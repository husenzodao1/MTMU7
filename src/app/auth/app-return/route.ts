import { NextResponse, type NextRequest } from "next/server";
import { appReturnUrl } from "@/lib/native/app";

/**
 * Google's sign-in, finished in the phone's browser, handed back to the app.
 *
 * Nothing is exchanged here: the code is only good with the verifier that
 * /auth/google left in the app's own cookie jar, so this just opens the app
 * with the code, and the app takes it to /auth/callback itself. Everything
 * but the few parameters a sign-in carries is dropped on the way.
 */
export function GET(request: NextRequest) {
  const url = new URL(request.url);
  return NextResponse.redirect(appReturnUrl(url.searchParams), 302);
}
