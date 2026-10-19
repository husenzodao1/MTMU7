import "server-only";
import { whatsappLink } from "@/lib/contact/whatsapp";
import { fold } from "@/lib/search/fold";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export interface PersonHit {
  id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  /** https://wa.me/… where the caller may see the number and it can have WhatsApp. */
  whatsapp: string | null;
}

/** Letters typed one way or the other in Tajik (list-params.ts, ALIKE): any one letter, to the database. */
const EITHER = /[хҳкқчҷиӣуӯгғеё]/giu;

/**
 * The people of one's school by a name, a handle or their portal number,
 * typed the way people type them ("Мехровар" finds Меҳровар), each with the
 * WhatsApp to reach them on where the caller may see it (00099).
 *
 * A database without 00099 yet is asked the way the messenger asked
 * (00095), with no numbers: each folded letter as "any one letter" (ILIKE's
 * `_`), the answers kept only where the names, folded here, really hold what
 * was typed.
 */
export async function searchPeople(supabase: Client, query: string, limit: number): Promise<PersonHit[]> {
  const asked = await supabase.rpc("search_people", { p_query: query, p_limit: limit });
  if (!asked.error) {
    return (asked.data ?? [])
      .filter((person) => person.id)
      .map((person) => ({
        id: person.id!,
        first_name: person.first_name ?? "",
        last_name: person.last_name ?? "",
        nickname: person.nickname,
        whatsapp: whatsappLink(person.phone),
      }));
  }

  const { data, error } = await supabase.rpc("search_message_contacts", { p_query: query.replace(EITHER, "_"), p_limit: 50 });
  if (error) throw error;
  const needle = fold(query.trim().replace(/^@/, "")).replace(/\s+/g, " ");
  return (data ?? [])
    .filter(
      (person) =>
        person.id &&
        [person.first_name, person.last_name, `${person.first_name ?? ""} ${person.last_name ?? ""}`, `${person.last_name ?? ""} ${person.first_name ?? ""}`, person.nickname ?? ""].some(
          (value) => fold(value ?? "").includes(needle)
        )
    )
    .slice(0, limit)
    .map((person) => ({ id: person.id!, first_name: person.first_name ?? "", last_name: person.last_name ?? "", nickname: person.nickname, whatsapp: null }));
}
