"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { RealtimeChannel } from "@supabase/supabase-js";
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

let session: Promise<void> | null = null;

/**
 * Joins a realtime channel once realtime holds this visitor's token.
 *
 * A channel joins with whatever token realtime has at that moment, and one
 * that joined while the session was still being read from the cookies joined
 * as nobody. Row level security then let it hear of nothing at all: the
 * conversation list never learnt of a message sent while it was open, and the
 * bell and the unread count waited for a reload. So every channel waits for
 * the session first — a moment, once per page — and one let go of meanwhile
 * does not join at all.
 */
export function listen(channel: RealtimeChannel, callback?: Parameters<RealtimeChannel["subscribe"]>[0]): RealtimeChannel {
  const supabase = getBrowserClient();
  session ??= supabase.auth.getSession().then(
    async ({ data }) => {
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
    },
    () => undefined
  );
  void session.then(() => {
    if (supabase.getChannels().includes(channel)) channel.subscribe(callback);
  });
  return channel;
}
