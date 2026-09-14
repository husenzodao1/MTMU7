"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAccess } from "@/lib/auth/access";
import { isLocale } from "@/lib/i18n/text";
import { createClient } from "@/lib/supabase/server";

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** Stores the interface language in a cookie and, for signed-in users, in their settings. */
export async function setLocaleAction(formData: FormData): Promise<void> {
  const locale = formData.get("locale");
  if (!isLocale(locale)) return;

  const cookieStore = await cookies();
  cookieStore.set("NEXT_LOCALE", locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: false });

  const access = await getAccess();
  if (access?.school && access.status === "active") {
    const supabase = await createClient();
    await supabase
      .from("user_settings")
      .upsert({ user_id: access.userId, school_id: access.school.id, locale }, { onConflict: "user_id" });
  }
  revalidatePath("/", "layout");
}
