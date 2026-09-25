import "server-only";
import { cookies } from "next/headers";

export const RESET_COOKIE = "password_reset_email";
/**
 * Carries the address between signing in and confirming it, for the case where
 * the project refuses an unconfirmed account a session. httpOnly, so the page
 * that asks for the code never has to take the address from the form — where it
 * could be pointed at somebody else's inbox.
 */
export const CONFIRM_COOKIE = "confirm_email";

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

export async function readResetEmail(): Promise<string | null> {
  return (await cookies()).get(RESET_COOKIE)?.value ?? null;
}

export async function readConfirmEmail(): Promise<string | null> {
  return (await cookies()).get(CONFIRM_COOKIE)?.value ?? null;
}
