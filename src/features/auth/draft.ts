import "server-only";
import { cookies } from "next/headers";
import { registrationDetailsSchema, type RegistrationDraft } from "@/features/auth/schemas";

export const DRAFT_COOKIE = "registration_draft";
export const RESET_COOKIE = "password_reset_email";

export async function writeShortLivedCookie(name: string, value: string) {
  const store = await cookies();
  store.set(name, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60,
  });
}

export async function readDraft(): Promise<RegistrationDraft | null> {
  const raw = (await cookies()).get(DRAFT_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = registrationDetailsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function readResetEmail(): Promise<string | null> {
  return (await cookies()).get(RESET_COOKIE)?.value ?? null;
}
