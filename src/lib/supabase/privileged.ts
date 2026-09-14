import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

/**
 * SERVICE ROLE CLIENT — bypasses row level security.
 *
 * Inventory of legitimate uses (keep in sync with docs/security/service-role.md):
 *   1. src/app/api/cron/dispatch-notifications/route.ts — calls
 *      public.dispatch_due_notifications(), which is executable only by
 *      service_role. The route authenticates the scheduler with CRON_SECRET.
 *
 * Do not use this client for anything a signed-in user does. User operations
 * go through src/lib/supabase/server.ts and are authorized by RLS and RPCs.
 */
export function createPrivilegedClient() {
  if (!serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
