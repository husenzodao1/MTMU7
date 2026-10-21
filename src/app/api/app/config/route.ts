import { NextResponse } from "next/server";
import { publicEnv } from "@/lib/env";

export const runtime = "nodejs";

/**
 * What the phone app needs before anything else: the database's address and
 * its publishable key — the same two values every browser already receives
 * with the site — so that they live in one place (the portal's environment)
 * rather than in the app's source. The app asks once, keeps the answer, and
 * asks again only if the key stops working.
 */
export function GET() {
  return NextResponse.json(
    {
      supabaseUrl: publicEnv.NEXT_PUBLIC_SUPABASE_URL,
      supabaseKey: publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
}
