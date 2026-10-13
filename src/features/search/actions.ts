"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { portalNavigation } from "@/components/shell/navigation";
import { searchAdmin } from "@/features/admin/search/query";
import { searchContacts } from "@/features/messages/contact-search";
import { failure, success, type ActionResult } from "@/lib/actions/result";
import { can, canEnterAdmin, getAccess, hasModule, type Access } from "@/lib/auth/access";
import { matchAny } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";
import { fold } from "@/lib/search/fold";

/** What kind of thing a hit is: it picks the icon and the section it is listed in. */
export type EverythingKind =
  | "pages"
  | "people"
  | "students"
  | "staff"
  | "users"
  | "classes"
  | "announcements"
  | "news"
  | "events"
  | "homework"
  | "library"
  | "documents";

export interface EverythingHit {
  id: string;
  title: string;
  detail?: string;
  href: string;
}

export interface EverythingSection {
  kind: EverythingKind;
  hits: EverythingHit[];
}

const PER_SECTION = 5;

/**
 * One search across everything the caller may see: the portal's own sections
 * by name, people, and — each where the caller has the module and the
 * permission — announcements, news, events, homework, the library and the
 * documents; for somebody who may enter the office, the school's records too
 * (pupils, staff, accounts, classes). Every section asks the database as the
 * caller, so row level security has the last word on each row; the sections
 * are asked side by side, so the slowest one sets the pace, not their sum.
 */
export async function searchEverythingAction(raw: string): Promise<ActionResult<EverythingSection[]>> {
  const access = await getAccess();
  if (!access?.school) return failure("errors.not_authenticated");
  const parsed = z.string().trim().min(2).max(100).safeParse(raw);
  if (!parsed.success) return success(undefined, []);
  const query = parsed.data;
  const school = access.school.id;
  const supabase = await createClient();
  const now = new Date().toISOString();
  // matchAny strips what PostgREST's `or` grammar reserves; a query made only
  // of those characters matches nothing rather than everything.
  const match = (columns: string[]) => matchAny(columns, query) ?? "id.is.null";
  const section = async (kind: EverythingKind, allowed: boolean, run: () => Promise<EverythingHit[]>): Promise<EverythingSection | null> => {
    if (!allowed) return null;
    try {
      const hits = await run();
      return hits.length > 0 ? { kind, hits: hits.slice(0, PER_SECTION) } : null;
    } catch {
      // One section that fails does not take the others with it.
      return null;
    }
  };

  const [pages, people, admin, announcements, news, events, homework, library, documents] = await Promise.all([
    section("pages", true, () => matchPages(access, query)),
    section("people", can(access, "messages.use") && hasModule(access, "messages"), async () => {
      const { data } = await searchContacts(supabase, query, PER_SECTION);
      return (data ?? []).filter((person) => person.id).map((person) => ({
        id: person.id!,
        title: `${person.last_name ?? ""} ${person.first_name ?? ""}`.trim(),
        detail: person.nickname ? `@${person.nickname}` : undefined,
        href: `/profile/${person.id}`,
      }));
    }),
    canEnterAdmin(access) ? searchAdmin(access, query).catch(() => []) : Promise.resolve([]),
    section("announcements", hasModule(access, "announcements") && can(access, "announcements.view"), async () => {
      const { data } = await supabase
        .from("announcements")
        .select("id, title, publish_at")
        .eq("school_id", school)
        .eq("status", "published")
        .lte("publish_at", now)
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .or(match(["title", "body"]))
        .order("publish_at", { ascending: false })
        .limit(PER_SECTION);
      return (data ?? []).map((row) => ({ id: row.id, title: row.title, href: `/announcements#a-${row.id}` }));
    }),
    section("news", hasModule(access, "news") && can(access, "news.view"), async () => {
      const { data } = await supabase
        .from("news_articles")
        .select("id, title, slug, summary")
        .eq("school_id", school)
        .eq("status", "published")
        .lte("publish_at", now)
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .or(match(["title", "summary"]))
        .order("publish_at", { ascending: false })
        .limit(PER_SECTION);
      return (data ?? []).map((row) => ({ id: row.id, title: row.title, detail: row.summary?.slice(0, 80) || undefined, href: `/news/${row.slug}` }));
    }),
    section("events", hasModule(access, "events") && can(access, "events.view"), async () => {
      const { data } = await supabase
        .from("events")
        .select("id, title, location, starts_at")
        .eq("school_id", school)
        .in("status", ["published", "cancelled"])
        .or(match(["title", "location"]))
        .order("starts_at", { ascending: false })
        .limit(PER_SECTION);
      return (data ?? []).map((row) => ({ id: row.id, title: row.title, detail: row.location ?? undefined, href: `/updates?type=event#e-${row.id}` }));
    }),
    section("homework", hasModule(access, "homework") && (can(access, "homework.view") || can(access, "homework.create")), async () => {
      const { data } = await supabase
        .from("homework_assignments")
        .select("id, title, due_at")
        .eq("school_id", school)
        .eq("status", "published")
        .or(match(["title"]))
        .order("due_at", { ascending: false, nullsFirst: false })
        .limit(PER_SECTION);
      return (data ?? []).map((row) => ({ id: row.id, title: row.title, href: `/homework/${row.id}` }));
    }),
    section("library", hasModule(access, "library") && can(access, "library.view"), async () => {
      const { data } = await supabase
        .from("library_items")
        .select("id, title, author")
        .eq("school_id", school)
        .or(match(["title", "author"]))
        .order("title")
        .limit(PER_SECTION);
      return (data ?? []).map((row) => ({ id: row.id, title: row.title, detail: row.author ?? undefined, href: `/library/${row.id}` }));
    }),
    section("documents", hasModule(access, "documents") && can(access, "documents.view"), async () => {
      const { data } = await supabase
        .from("documents")
        .select("id, title, category")
        .eq("school_id", school)
        .or(match(["title", "description"]))
        .order("title")
        .limit(PER_SECTION);
      return (data ?? []).map((row) => ({ id: row.id, title: row.title, detail: row.category ?? undefined, href: "/documents" }));
    }),
  ]);

  // From the office's search, only what the portal has no section of its own for.
  const records: EverythingSection[] = admin
    .filter((s) => s.key === "students" || s.key === "staff" || s.key === "users" || s.key === "classes")
    .map((s) => ({ kind: s.key as EverythingKind, hits: s.hits.slice(0, PER_SECTION) }));

  const sections = [pages, people, ...records, announcements, news, events, homework, library, documents].filter(
    (s): s is EverythingSection => s !== null
  );
  return success(undefined, sections);
}

/** The portal's own sections whose name has the words in it: "ҷадвал" finds the timetable. */
async function matchPages(access: Access, query: string): Promise<EverythingHit[]> {
  const t = await getTranslations();
  const needle = fold(query);
  const items = portalNavigation(access);
  const office = canEnterAdmin(access) ? [{ key: "admin", href: "/admin", labelKey: "nav.adminCenter" }] : [];
  return [...items, ...office]
    .map((item) => ({ id: item.key, title: t(item.labelKey), href: item.href }))
    .filter((item) => fold(item.title).includes(needle));
}
