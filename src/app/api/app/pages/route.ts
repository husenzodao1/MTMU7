import { NextResponse } from "next/server";
import { adminNavigation, portalNavigation, showAdminLink } from "@/components/shell/navigation";
import { myHomeroomClasses } from "@/features/accounts/queries";
import { getMyChildren } from "@/features/academic/queries";
import { getMyClassSubjects } from "@/features/teach/queries";
import { getAccess, can, hasRole } from "@/lib/auth/access";
import { BUILD } from "@/lib/build";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The pages most likely to be opened, for the device to have before they are
 * tapped: enough for the menu, the office and what is a tap away from them,
 * without every sign-in asking the server for hundreds of pages — a class
 * signing in together would ask for thousands at once. Anything else is kept
 * the first time it is opened (public/sw.js keeps up to 700).
 */
const MOST = 220;

type Row = { id: string };

/**
 * Every page this person can open, for the phone to install at once after
 * signing in (page-installer.tsx): the menu and the office first, then the
 * pages a tap away from them — each journal, homework, piece
 * of news and book; for the office, each account, class, article,
 * announcement and book it looks after. With `build`, so a phone holding an
 * older version of the site knows to take the new one.
 *
 * What is asked for is what row level security lets this person read, so a
 * page that would turn them away is never listed.
 */
export async function GET() {
  const access = await getAccess();
  if (!access) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const pages: string[] = [];
  const add = (href: string) => {
    if (!pages.includes(href) && pages.length < MOST) pages.push(href);
  };

  // The menu first: what is tapped most is there soonest.
  const menu = portalNavigation(access).map((item) => item.href);
  for (const href of menu) add(href);
  for (const href of ["/notifications", "/profile", "/settings", "/news", "/announcements", "/events"]) add(href);

  const office = showAdminLink(access) ? adminNavigation(access).flatMap((group) => group.items.map((item) => item.href)) : [];
  const inOffice = (href: string) => office.includes(href);
  const teaches = can(access, "grades.enter") || can(access, "attendance.mark") || can(access, "homework.create");
  const supabase = await createClient();
  const none = Promise.resolve({ data: [] as Row[] });
  const ids = (result: { data: unknown }) => ((result.data ?? []) as Row[]).map((row) => row.id);

  const [classSubjects, homeroom, children, news, books, homework, myHomework, accounts, classes, officeNews, officeNotices, officeBooks] =
    await Promise.all([
      teaches ? getMyClassSubjects(access.userId, "tg").catch(() => []) : Promise.resolve([]),
      teaches ? myHomeroomClasses(access).catch(() => []) : Promise.resolve([]),
      hasRole(access, "parent") ? getMyChildren().catch(() => []) : Promise.resolve([]),
      menu.includes("/updates")
        ? supabase.from("news_articles").select("slug").eq("status", "published").order("published_at", { ascending: false }).limit(30)
        : Promise.resolve({ data: [] }),
      menu.includes("/library") ? supabase.from("library_items").select("id").eq("is_published", true).order("created_at", { ascending: false }).limit(60) : none,
      menu.includes("/homework") ? supabase.from("homework_assignments").select("id").eq("status", "published").order("due_at", { ascending: false }).limit(30) : none,
      teaches ? supabase.from("homework_assignments").select("id").eq("created_by", access.userId).order("created_at", { ascending: false }).limit(30) : none,
      inOffice("/admin/accounts") ? supabase.from("users").select("id").order("updated_at", { ascending: false }).limit(150) : none,
      // The classes with pupils in them: the empty ones are not shown either (admin/classes).
      inOffice("/admin/classes") ? supabase.from("enrollments").select("class_id").eq("status", "active").limit(5000) : Promise.resolve({ data: [] }),
      inOffice("/admin/news") ? supabase.from("news_articles").select("id").order("created_at", { ascending: false }).limit(30) : none,
      inOffice("/admin/announcements") ? supabase.from("announcements").select("id").order("created_at", { ascending: false }).limit(30) : none,
      inOffice("/admin/library") ? supabase.from("library_items").select("id").order("created_at", { ascending: false }).limit(40) : none,
    ]);

  if (teaches) {
    add("/teach/gradebook");
    add("/teach/attendance");
    add("/teach/homework");
    for (const cs of classSubjects) add(`/teach/gradebook/${cs.id}`);
  }
  if (homeroom.length > 0) add("/my-class");
  for (const child of children) add(`/children/${child.id}`);

  // The office's own pages, before anything a tap further away.
  for (const href of office) add(href);

  for (const id of ids(homework)) add(`/homework/${id}`);
  if (teaches) {
    add("/teach/homework/new");
    for (const id of ids(myHomework)) add(`/teach/homework/${id}`);
  }
  for (const row of (news.data ?? []) as Array<{ slug: string | null }>) if (row.slug) add(`/news/${row.slug}`);
  for (const id of ids(books)) add(`/library/${id}`);

  if (inOffice("/admin/accounts")) {
    add("/admin/accounts/new");
    add("/admin/accounts/parents");
    for (const id of ids(accounts)) add(`/admin/accounts/${id}`);
  }
  for (const id of new Set(((classes.data ?? []) as Array<{ class_id: string }>).map((row) => row.class_id))) add(`/admin/classes/${id}`);
  if (inOffice("/admin/news")) add("/admin/news/new");
  for (const id of ids(officeNews)) add(`/admin/news/${id}`);
  if (inOffice("/admin/announcements")) add("/admin/announcements/new");
  for (const id of ids(officeNotices)) add(`/admin/announcements/${id}`);
  if (inOffice("/admin/library")) add("/admin/library/new");
  for (const id of ids(officeBooks)) add(`/admin/library/${id}`);
  if (inOffice("/admin/subjects")) add("/admin/subjects/import");
  if (inOffice("/admin/timetable")) add("/admin/timetable/import");

  return NextResponse.json({ build: BUILD, pages }, { headers: { "Cache-Control": "no-store" } });
}
