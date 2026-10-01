import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { downloadUrl, platformOf, servedFile } from "../../src/lib/native/downloads.ts";

describe("where the apps come from", () => {
  it("serves the APK and the installer from the fixed release, unless told otherwise", () => {
    assert.match(downloadUrl("android", {})!, /releases\/download\/app-latest\/MTMU7-android\.apk$/);
    assert.match(downloadUrl("windows", {})!, /MTMU7-windows-setup\.exe$/);
    assert.equal(downloadUrl("android", { ANDROID_APP_URL: "https://play.google.com/store/apps/details?id=tj.mtmu7.app" }), "https://play.google.com/store/apps/details?id=tj.mtmu7.app");
  });

  it("hands out the APK from the portal itself, unless it lives elsewhere", () => {
    const apk = servedFile("android", {})!;
    assert.match(apk.source, /releases\/download\/app-latest\/MTMU7-android\.apk$/);
    assert.equal(apk.type, "application/vnd.android.package-archive");
    assert.equal(apk.name, "MTMU7.apk");
    assert.equal(servedFile("android", { ANDROID_APP_URL: "https://play.google.com/store/apps/details?id=tj.mtmu7.app" }), null);
    assert.equal(servedFile("windows", {}), null);
    assert.equal(servedFile("ios", {}), null);
  });

  it("sends an iPhone to the instructions until there is a store listing", () => {
    assert.equal(downloadUrl("ios", {}), null);
    assert.equal(downloadUrl("ios", { IOS_APP_URL: "https://apps.apple.com/app/id1" }), "https://apps.apple.com/app/id1");
  });

  it("recognises the device a visitor is on", () => {
    assert.equal(platformOf("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/140 Mobile"), "android");
    assert.equal(platformOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"), "ios");
    assert.equal(platformOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140"), "windows");
    assert.equal(platformOf("Mozilla/5.0 (X11; Linux x86_64)"), null);
  });
});
