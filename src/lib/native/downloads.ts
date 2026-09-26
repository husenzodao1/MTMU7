/**
 * Where each app is downloaded from.
 *
 * The Android APK and the Windows installer are built by GitHub Actions and
 * published to one release of the (public) repository, tag `app-latest`,
 * replaced on every build — so these addresses never change. The iPhone app
 * lives in the App Store once it is published there; until then the iPhone
 * link leads to the page that shows how to put the portal on the home screen.
 *
 * Each can be pointed elsewhere with an environment variable, without a code
 * change: a Play Store listing instead of the APK, say.
 */

const RELEASE = "https://github.com/husenzodao1/MTMU7/releases/download/app-latest";

export type AppPlatform = "android" | "ios" | "windows";

export const APP_PLATFORMS: AppPlatform[] = ["android", "ios", "windows"];

export function isAppPlatform(value: string): value is AppPlatform {
  return (APP_PLATFORMS as string[]).includes(value);
}

/** The address the download button sends each platform to, or null for "show the instructions". */
export function downloadUrl(platform: AppPlatform, env: Record<string, string | undefined> = process.env): string | null {
  if (platform === "android") return env.ANDROID_APP_URL || `${RELEASE}/MTMU7-android.apk`;
  if (platform === "windows") return env.WINDOWS_APP_URL || `${RELEASE}/MTMU7-windows-setup.exe`;
  return env.IOS_APP_URL || null;
}

/** Which button to put first, from what the browser says it is. */
export function platformOf(userAgent: string | null | undefined): AppPlatform | null {
  if (!userAgent) return null;
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && /mobile/i.test(userAgent))) return "ios";
  if (/windows/i.test(userAgent)) return "windows";
  return null;
}
