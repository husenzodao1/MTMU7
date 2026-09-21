import "server-only";
import { can, type Access } from "@/lib/auth/access";
import type { Permission } from "@/lib/auth/permissions";
import { ilikeAny } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export interface SearchHit {
  id: string;
  title: string;
  detail?: string;
  href: string;
}

export interface SearchSection {
  key: string;
  hits: SearchHit[];
  more: boolean;
}

const PER_SECTION = 6;

/**
 * Cross-section search of the administrative records the caller may see.
 * Every section is gated by its own permission and scoped to the caller's
 * school; RLS repeats both checks in the database.
 */
export async function searchAdmin(access: Access, rawQuery: string): Promise<SearchSection[]> {
  const query = rawQuery.trim().slice(0, 100);
  const school = access.school?.id;
  if (!school || query.length < 2) return [];
  const supabase = await createClient();

  const section = async (
    key: string,
    permissions: Permission[],
    run: () => Promise<SearchHit[]>
  ): Promise<SearchSection | null> => {
    if (!permissions.some((permission) => can(access, permission))) return null;
    const hits = await run();
    return hits.length ? { key, hits: hits.slice(0, PER_SECTION), more: hits.length > PER_SECTION } : null;
  };

  // ilikeAny strips the characters PostgREST's `or` grammar reserves; a query
  // made only of those characters leaves nothing to match on.
  const byName = (columns: string[]) => ilikeAny(columns, query) ?? "id.is.null";
  const fullName = (row: { last_name: string | null; first_name: string | null; middle_name?: string | null }) =>
    [row.last_name, row.first_name, row.middle_name].filter(Boolean).join(" ");

  const sections = await Promise.all([
    section("students", ["students.view"], async () => {
      const { data } = await supabase
        .from("students")
        .select("id, first_name, last_name, middle_name, student_number, status")
        .eq("school_id", school)
        .or(byName(["last_name", "first_name", "middle_name", "student_number"]))
        .order("last_name")
        .limit(PER_SECTION + 1);
      return (data ?? []).map((row) => ({
        id: row.id,
        title: fullName(row),
        detail: row.student_number ?? undefined,
        href: `/admin/students/${row.id}`,
      }));
    }),
    section("staff", ["staff.view"], async () => {
      const { data } = await supabase
        .from("staff")
        .select("id, first_name, last_name, middle_name, employee_number, position")
        .eq("school_id", school)
        .or(byName(["last_name", "first_name", "middle_name", "employee_number"]))
        .order("last_name")
        .limit(PER_SECTION + 1);
      return (data ?? []).map((row) => ({
        id: row.id,
        title: fullName(row),
        detail: row.position ?? row.employee_number ?? undefined,
        href: `/admin/staff/${row.id}`,
      }));
    }),
    section("users", ["users.view"], async () => {
      const { data } = await supabase
        .from("users")
        .select("id, first_name, last_name, email, public_id")
        .eq("school_id", school)
        .or(byName(["last_name", "first_name", "email", "public_id"]))
        .order("last_name")
        .limit(PER_SECTION + 1);
      return (data ?? []).map((row) => ({
        id: row.id,
        title: fullName(row) || row.email,
        detail: row.public_id ?? row.email,
        href: `/admin/users/${row.id}`,
      }));
    }),
    section("classes", ["classes.view", "classes.update", "enrollments.manage"], async () => {
      const { data } = await supabase
        .from("classes")
        .select("id, name, grade_level, is_active")
        .eq("school_id", school)
        .or(byName(["name"]))
        .order("grade_level")
        .limit(PER_SECTION + 1);
      return (data ?? []).map((row) => ({ id: row.id, title: row.name, href: `/admin/classes/${row.id}` }));
    }),
    section("news", ["news.view", "news.update", "news.publish"], async () => {
      const { data } = await supabase
        .from("news_articles")
        .select("id, title, status")
        .eq("school_id", school)
        .or(byName(["title", "summary"]))
        .order("created_at", { ascending: false })
        .limit(PER_SECTION + 1);
      return (data ?? []).map((row) => ({ id: row.id, title: row.title, detail: row.status, href: `/admin/news/${row.id}` }));
    }),
    section("announcements", ["announcements.publish", "announcements.create"], async () => {
      const { data } = await supabase
        .from("announcements")
        .select("id, title, status")
        .eq("school_id", school)
        .or(byName(["title"]))
        .order("publish_at", { ascending: false })
        .limit(PER_SECTION + 1);
      return (data ?? []).map((row) => ({ id: row.id, title: row.title, detail: row.status, href: `/admin/announcements/${row.id}` }));
    }),
    section("library", ["library.view", "library.create", "library.update"], async () => {
      const { data } = await supabase
        .from("library_items")
        .select("id, title, author, isbn, status")
        .eq("school_id", school)
        .or(byName(["title", "author", "isbn"]))
        .order("title")
        .limit(PER_SECTION + 1);
      return (data ?? []).map((row) => ({ id: row.id, title: row.title, detail: row.author ?? undefined, href: `/admin/library/${row.id}` }));
    }),
    section("documents", ["documents.view", "documents.create"], async () => {
      const { data } = await supabase
        .from("documents")
        .select("id, title, category, status")
        .eq("school_id", school)
        .or(byName(["title", "description", "file_name"]))
        .order("title")
        .limit(PER_SECTION + 1);
      return (data ?? []).map((row) => ({ id: row.id, title: row.title, detail: row.category ?? undefined, href: "/admin/documents" }));
    }),
  ]);

  return sections.filter((s): s is SearchSection => s !== null);
}
