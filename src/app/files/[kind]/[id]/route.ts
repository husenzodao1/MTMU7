import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SIGNED_URL_SECONDS = 300;

/**
 * Protected file access. The user-scoped client reads the referencing row
 * (RLS decides visibility) and asks Storage for a short-lived signed URL
 * (storage policies decide again). Nothing here uses the service role.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse(null, { status: 404 });
  const supabase = await createClient();
  const download = request.nextUrl.searchParams.get("download") === "1";

  let bucket: string | null = null;
  let path: string | null = null;
  let fileName: string | null = null;

  if (kind === "homework") {
    const { data } = await supabase.from("homework_attachments").select("storage_path, file_name").eq("id", id).maybeSingle();
    bucket = "homework";
    path = data?.storage_path ?? null;
    fileName = data?.file_name ?? null;
  } else if (kind === "documents") {
    const { data } = await supabase.from("documents").select("storage_path, file_name").eq("id", id).maybeSingle();
    bucket = "documents";
    path = data?.storage_path ?? null;
    fileName = data?.file_name ?? null;
  } else if (kind === "library") {
    const { data } = await supabase.from("library_items").select("file_url, file_name, school_id").eq("id", id).maybeSingle();
    bucket = "library-files";
    path = data?.file_url ?? null;
    fileName = data?.file_name ?? null;
    if (data && path) {
      await supabase.rpc("record_library_view", { p_item_id: id });
      const { data: claims } = await supabase.auth.getClaims();
      const userId = claims?.claims.sub;
      if (userId) {
        // Reading history is best effort: RLS limits it to the user's own school and visible books.
        await supabase
          .from("library_reading_history")
          .upsert({ user_id: userId, item_id: id, school_id: data.school_id, opened_at: new Date().toISOString() }, { onConflict: "user_id,item_id" });
      }
    }
  } else if (kind === "announcements") {
    const { data } = await supabase.from("announcements").select("attachment_path, attachment_name").eq("id", id).maybeSingle();
    bucket = "documents";
    path = data?.attachment_path ?? null;
    fileName = data?.attachment_name ?? null;
  } else if (kind === "covers") {
    const { data } = await supabase.from("library_items").select("cover_url").eq("id", id).maybeSingle();
    bucket = "library-covers";
    path = data?.cover_url ?? null;
  }

  if (!bucket || !path) return new NextResponse(null, { status: 404 });

  const { data: signed, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_SECONDS, download && fileName ? { download: fileName } : undefined);
  if (error || !signed?.signedUrl) return new NextResponse(null, { status: 404 });

  const response = NextResponse.redirect(signed.signedUrl, 302);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
