import { notFound, redirect } from "next/navigation";
import { requireAccess } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

/**
 * The address a @mention points at.
 *
 * A notice names somebody by the handle they chose; this turns that handle into
 * whoever holds it now. Resolving at the moment the link is followed rather than
 * when the notice was written means a notice keeps working after somebody
 * changes their nickname, and nothing has to store an id in prose.
 */
export default async function MentionPage({ params }: { params: Promise<{ nickname: string }> }) {
  await requireAccess();
  const { nickname } = await params;
  if (!/^[A-Za-z0-9._]{3,30}$/.test(nickname)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.rpc("user_by_nickname", { p_nickname: nickname });
  if (typeof data !== "string" || data.length === 0) notFound();
  redirect(`/profile/${data}`);
}
