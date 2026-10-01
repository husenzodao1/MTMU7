import { NextResponse, type NextRequest } from "next/server";
import { downloadUrl, isAppPlatform, servedFile } from "@/lib/native/downloads";

/**
 * /download/android, /download/windows, /download/ios: one address per app on
 * the portal's own domain, whatever hosts the file today. The APK is passed
 * through from the release, so the phone's browser saves it as a download
 * from this site; the others redirect. The iPhone link goes to the App Store
 * when there is a listing, and otherwise to the page that explains adding the
 * portal to the home screen.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const origin = new URL(request.url).origin;
  if (!isAppPlatform(platform)) return NextResponse.redirect(new URL("/app", origin));

  const served = servedFile(platform);
  if (served) {
    const upstream = await fetch(served.source, { cache: "no-store" }).catch(() => null);
    if (upstream?.ok && upstream.body) {
      const headers = new Headers({
        "Content-Type": served.type,
        "Content-Disposition": `attachment; filename="${served.name}"`,
        // The edge keeps a copy for ten minutes: a class downloading at once
        // is one fetch from the release, and a new build shows up soon after.
        "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=3600",
        "X-Content-Type-Options": "nosniff",
      });
      const length = upstream.headers.get("content-length");
      if (length) headers.set("Content-Length", length);
      return new Response(upstream.body, { headers });
    }
  }

  const target = downloadUrl(platform);
  return NextResponse.redirect(target ?? new URL(`/app#${platform}`, origin), 302);
}
