import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/uuid";

/**
 * Opening a support conversation from the desk's inbox.
 *
 * Somebody given the desk permission after the conversation began is not yet
 * one of its members; this makes them one (the database checks the
 * permission) and hands them to the ordinary conversation page.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  if (!isUuid(id)) return NextResponse.redirect(new URL("/admin/support", url.origin));
  const supabase = await createClient();
  const { error } = await supabase.rpc("join_support_conversation", { p_conversation_id: id });
  if (error) return NextResponse.redirect(new URL("/admin/support", url.origin));
  return NextResponse.redirect(new URL(`/messages/${id}`, url.origin));
}
