import { NextResponse, type NextRequest } from "next/server";
import { safeRedirectPath } from "@/lib/security/redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * Marks a notification as read and follows its link. Works without
 * JavaScript; the stored link is re-validated as a same-origin path.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fallback = new URL("/notifications", request.url);
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.redirect(fallback, 303);

  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("id, link_url, is_read").eq("id", id).maybeSingle();
  if (!data) return NextResponse.redirect(fallback, 303);
  if (!data.is_read) {
    await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id);
  }
  const target = safeRedirectPath(data.link_url, "/notifications");
  return NextResponse.redirect(new URL(target, request.url), 303);
}
