"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAccess } from "@/lib/auth/access";
import { isLocale } from "@/lib/i18n/text";
import { safeRedirectPath } from "@/lib/security/redirect";
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

/**
 * Remembers which school's sign-in the visitor is using, so the card, its
 * background and the footer's accounts belong to that school. Nothing here
 * grants access: the cookie only chooses whose branding and whose registration
 * options are shown, and every server check still works from the session.
 */
export async function setAuthSchoolAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("school") ?? "");
  const target = safeRedirectPath(String(formData.get("next") ?? "/login")) ?? "/login";
  if (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && slug.length <= 100) {
    const cookieStore = await cookies();
    cookieStore.set("school", slug, {
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
      sameSite: "lax",
      httpOnly: true,
    });
  }
  redirect(target);
}

/** Returns to the school list. */
export async function clearAuthSchoolAction(formData: FormData): Promise<void> {
  const target = safeRedirectPath(String(formData.get("next") ?? "/login")) ?? "/login";
  (await cookies()).delete("school");
  redirect(target);
}
