import { NextResponse } from "next/server";
import { createPrivilegedClient } from "@/lib/supabase/privileged";
import { serverEnv } from "@/lib/env.server";
import { hasValidCronAuthorization } from "@/lib/security/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function dispatch(request: Request) {
  if (!hasValidCronAuthorization(request.headers.get("authorization"), serverEnv.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // dispatch_due_notifications is executable only by service_role, so it is
    // absent from the generated types. Cast the client, never the method: a
    // detached client.rpc loses its receiver and throws inside supabase-js.
    const client = createPrivilegedClient() as unknown as {
      rpc: (name: "dispatch_due_notifications") => PromiseLike<{ data: unknown; error: { code?: string } | null }>;
    };
    const { data, error } = await client.rpc("dispatch_due_notifications");
    if (error) {
      console.error("Notification dispatch failed", { code: error.code });
      return NextResponse.json({ error: "Dispatch failed" }, { status: 500 });
    }
    const result = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
    return NextResponse.json({
      broadcasts: typeof result.broadcasts === "number" ? result.broadcasts : 0,
      announcements: typeof result.announcements === "number" ? result.announcements : 0,
    });
  } catch (error) {
    console.error("Notification dispatch failed", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Dispatch failed" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return dispatch(request);
}

export async function POST(request: Request) {
  return dispatch(request);
}
