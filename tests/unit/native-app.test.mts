import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { appReturnUrl, isAppUserAgent, pathForAppLink } from "../../src/lib/native/app.ts";

const SITE = "https://mtmuraqami7.vercel.app";

describe("the phone app, as the site sees it", () => {
  it("knows the app by its user agent", () => {
    assert.equal(isAppUserAgent("Mozilla/5.0 (Linux; Android 14) … Chrome/140 Mobile Safari/537.36 MTMU7App"), true);
    assert.equal(isAppUserAgent("Mozilla/5.0 (iPhone) Safari/604.1"), false);
    assert.equal(isAppUserAgent(null), false);
  });

  it("hands a sign-in back to the app with only what a sign-in carries", () => {
    const link = appReturnUrl(new URLSearchParams({ code: "abc-123", via: "google", next: "/messages", evil: "x" }));
    assert.equal(link, "tj.mtmu7.app://auth/callback?code=abc-123&via=google&next=%2Fmessages");
  });

  it("turns that link into the callback path inside the app", () => {
    assert.equal(pathForAppLink("tj.mtmu7.app://auth/callback?code=abc&via=google&next=%2Fgrades", SITE), "/auth/callback?code=abc&via=google&next=%2Fgrades");
    assert.equal(pathForAppLink("tj.mtmu7.app://auth/callback?error=access_denied&via=google", SITE), "/auth/callback?via=google&error=access_denied");
  });

  it("opens links to the site in place and ignores everything else", () => {
    assert.equal(pathForAppLink(`${SITE}/messages/1?x=1#end`, SITE), "/messages/1?x=1#end");
    assert.equal(pathForAppLink("https://evil.example/phish", SITE), null);
    assert.equal(pathForAppLink("tj.mtmu7.app://settings", SITE), null);
    assert.equal(pathForAppLink("not a url", SITE), null);
  });
});
