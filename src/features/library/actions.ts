"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mapDbError } from "@/lib/actions/errors";
import { done, failure, success, type FormState } from "@/lib/actions/result";
import { getAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

/** Adds or removes a book from the signed-in user's favorites (RLS: own rows, visible items only). */
export async function toggleFavoriteAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const itemId = z.string().uuid().safeParse(formData.get("itemId"));
  if (!itemId.success) return done(failure("errors.invalid"));
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("library_favorites")
    .select("item_id")
    .eq("user_id", access.userId)
    .eq("item_id", itemId.data)
    .maybeSingle();

  const { error } = existing
    ? await supabase.from("library_favorites").delete().eq("user_id", access.userId).eq("item_id", itemId.data)
    : await supabase.from("library_favorites").insert({ user_id: access.userId, item_id: itemId.data, school_id: access.school.id });
  if (error) return done(mapDbError(error));

  revalidatePath("/library");
  revalidatePath(`/library/${itemId.data}`);
  return done(success(existing ? "portal.library.favoriteRemoved" : "portal.library.favoriteAdded"));
}
