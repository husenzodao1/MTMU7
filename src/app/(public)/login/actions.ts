"use server";

import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function loginAction(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "invalidCredentials" };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: "invalidCredentials" };
  }

  const redirectTo = new URL(
    formData.get("redirect")?.toString() ?? "/dashboard",
    process.env.NEXT_PUBLIC_APP_URL
  ).pathname;

  redirect(redirectTo);
}
