import "server-only";
import { cookies } from "next/headers";
import { WELCOME_COOKIE } from "@/lib/auth/welcome-cookie";

/** Asks the next portal page to open with the welcome animation. */
export async function markWelcome(): Promise<void> {
  (await cookies()).set(WELCOME_COOKIE, "1", {
    path: "/",
    maxAge: 60,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    // The animation clears it the moment it has played.
    httpOnly: false,
  });
}

/** Whether this page is the first after signing in. */
export async function isWelcome(): Promise<boolean> {
  return (await cookies()).get(WELCOME_COOKIE)?.value === "1";
}
