import "server-only";
import { fold } from "@/lib/search/fold";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/** Letters typed one way or the other in Tajik (list-params.ts, ALIKE): any one letter, to the database. */
const EITHER = /[хҳкқчҷиӣуӯгғеё]/giu;

/**
 * Whom this person may write to, by a name typed the way people type it:
 * "Мехровар" finds Меҳровар. The database search (00095) folds the letter
 * pairs itself; a database without 00095 yet is asked with each such letter
 * as "any one letter" (ILIKE's `_`) and the answers are kept only where the
 * names, folded here, really hold what was typed — so it works either way.
 */
export async function searchContacts(supabase: Client, query: string, limit: number) {
  const { data, error } = await supabase.rpc("search_message_contacts", { p_query: query.replace(EITHER, "_"), p_limit: 50 });
  if (error) return { data: null, error };
  const needle = fold(query.trim().replace(/^@/, "")).replace(/\s+/g, " ");
  const rows = (data ?? []).filter((person) =>
    [person.first_name, person.last_name, `${person.first_name ?? ""} ${person.last_name ?? ""}`, `${person.last_name ?? ""} ${person.first_name ?? ""}`, person.nickname ?? ""].some(
      (value) => fold(value ?? "").includes(needle)
    )
  );
  return { data: rows.slice(0, limit), error: null };
}
