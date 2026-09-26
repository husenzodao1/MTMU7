import { NextResponse, type NextRequest } from "next/server";
import { downloadUrl, isAppPlatform } from "@/lib/native/downloads";

/**
 * /download/android, /download/windows, /download/ios: one address per app on
 * the portal's own domain, whatever hosts the file today. The iPhone link
 * goes to the App Store when there is a listing, and otherwise to the page
 * that explains adding the portal to the home screen.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const origin = new URL(request.url).origin;
  if (!isAppPlatform(platform)) return NextResponse.redirect(new URL("/app", origin));
  const target = downloadUrl(platform);
  return NextResponse.redirect(target ?? new URL(`/app#${platform}`, origin), 302);
}
