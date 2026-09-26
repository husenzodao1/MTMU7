"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/db/database.types";
import { publicEnv } from "@/lib/env";
import { resilientFetch } from "@/lib/supabase/resilient-fetch";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

/**
 * Browser client: realtime, messages written straight from the page, photos.
 * A minute per request is room for a photo on a slow line; reads that meet a
 * busy gateway are asked again.
 */
export function getBrowserClient() {
  client ??= createBrowserClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { fetch: resilientFetch({ timeoutMs: 60_000 }) },
  });
  return client;
}
