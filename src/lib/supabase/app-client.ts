import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { publicEnv } from "@/lib/env";
import { resilientFetch } from "@/lib/supabase/resilient-fetch";

const appFetch = resilientFetch({ timeoutMs: 15_000 });

/**
 * The phone app's own session, for the few routes the app calls: the app
 * keeps its session itself (it has no cookies) and sends it as
 * `Authorization: Bearer <access token>`. Every query runs under that token,
 * so row level security decides exactly as it does for the site.
 */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+([A-Za-z0-9._-]{20,4096})$/.exec(header.trim());
  return match ? match[1]! : null;
}

export function createAppClient(token: string) {
  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: appFetch, headers: { Authorization: `Bearer ${token}` } },
  });
}

/** A client with no session at all: what a sign-in starts from. */
export function createAnonymousClient() {
  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: appFetch },
  });
}
