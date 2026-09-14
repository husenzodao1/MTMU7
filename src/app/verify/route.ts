import { NextResponse, type NextRequest } from "next/server";

/** Legacy /verify links forward to the confirmation handler with the same query. */
export function GET(request: NextRequest) {
  const url = new URL(request.url);
  const target = new URL("/auth/confirm", url.origin);
  for (const key of ["token_hash", "type", "next"]) {
    const value = url.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }
  return NextResponse.redirect(target);
}
