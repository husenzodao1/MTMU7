import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/db/database.types";
import { publicEnv } from "@/lib/env";
import { resilientFetch } from "@/lib/supabase/resilient-fetch";

/** A page waits this long for the database, and asks a failed read again. */
const serverFetch = resilientFetch({ timeoutMs: 15_000 });

/**
 * User-scoped Supabase client for Server Components, Server Actions and Route
 * Handlers. Every query runs under the caller's JWT, so row level security is
 * the authority for what is returned or changed.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { fetch: serverFetch },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies; the proxy refreshes sessions.
        }
      },
    },
  });
}

export type ServerSupabase = Awaited<ReturnType<typeof createClient>>;
