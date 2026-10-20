import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseInline } from "../../src/lib/content/markdown.ts";
import { platformOf, shortAddress } from "../../src/lib/social/platforms.ts";

describe("which service an address belongs to", () => {
  it("names the service and whose page it is", () => {
    assert.deepEqual(platformOf("https://t.me/mtmu7"), { platform: "telegram", handle: "@mtmu7" });
    assert.deepEqual(platformOf("https://t.me/s/mtmu7_news"), { platform: "telegram", handle: "@mtmu7_news" });
    assert.deepEqual(platformOf("https://t.me/+992900000000"), { platform: "telegram", handle: "+992900000000" });
    assert.deepEqual(platformOf("https://www.instagram.com/school7/"), { platform: "instagram", handle: "@school7" });
    assert.deepEqual(platformOf("https://www.youtube.com/@school7"), { platform: "youtube", handle: "@school7" });
    assert.deepEqual(platformOf("https://youtu.be/dQw4w9WgXcQ"), { platform: "youtube", handle: null });
    assert.deepEqual(platformOf("https://www.tiktok.com/@school7/video/1"), { platform: "tiktok", handle: "@school7" });
    assert.deepEqual(platformOf("https://wa.me/992900000000"), { platform: "whatsapp", handle: "+992900000000" });
    assert.deepEqual(platformOf("https://www.snapchat.com/add/school7"), { platform: "snapchat", handle: "@school7" });
    assert.deepEqual(platformOf("https://x.com/school7"), { platform: "x", handle: "@school7" });
    assert.deepEqual(platformOf("https://vk.com/school7"), { platform: "vk", handle: "school7" });
    assert.deepEqual(platformOf("https://docs.google.com/document/d/1/edit"), { platform: "docs", handle: null });
  });

  it("does not take a service's own pages for somebody's name", () => {
    assert.deepEqual(platformOf("https://www.instagram.com/p/Cxyz/"), { platform: "instagram", handle: null });
    assert.deepEqual(platformOf("https://www.youtube.com/watch?v=1"), { platform: "youtube", handle: null });
    assert.deepEqual(platformOf("https://t.me/joinchat/abc"), { platform: "telegram", handle: null });
  });

  it("leaves other sites, and what is not an address, alone", () => {
    assert.equal(platformOf("https://example.com/t.me"), null);
    assert.equal(platformOf("https://notinstagram.com/x"), null);
    assert.equal(platformOf("javascript:alert(1)"), null);
    assert.equal(platformOf("not a url"), null);
    assert.equal(shortAddress("https://www.example.com/"), "example.com");
  });
});

describe("addresses typed as they are", () => {
  it("become links, without the full stop that ends the sentence", () => {
    const nodes = parseInline("Канали мо: https://t.me/mtmu7. Обуна шавед!");
    assert.deepEqual(nodes[0], { type: "text", value: "Канали мо: " });
    assert.deepEqual(nodes[1], { type: "link", href: "https://t.me/mtmu7", children: [], bare: true });
    assert.deepEqual(nodes[2], { type: "text", value: ". Обуна шавед!" });
  });

  it("take https:// in front of t.me/ and www.", () => {
    assert.deepEqual(parseInline("t.me/mtmu7")[0], { type: "link", href: "https://t.me/mtmu7", children: [], bare: true });
    assert.deepEqual(parseInline("(www.example.com)")[1], { type: "link", href: "https://www.example.com", children: [], bare: true });
  });

  it("are not found inside a word or an email address", () => {
    assert.deepEqual(parseInline("info@www.example.com"), [{ type: "text", value: "info@www.example.com" }]);
  });
});

describe("an account typed on a profile", async () => {
  const { readAccount, accountUrl, accountLabel } = await import("../../src/lib/social/accounts.ts");

  it("is read as a name, whichever way it was typed", () => {
    assert.deepEqual(readAccount("instagram", "@school.7"), { ok: true, handle: "school.7" });
    assert.deepEqual(readAccount("instagram", "https://www.instagram.com/school.7/"), { ok: true, handle: "school.7" });
    assert.deepEqual(readAccount("telegram", "t.me/mtmu7_news"), { ok: true, handle: "mtmu7_news" });
    assert.deepEqual(readAccount("tiktok", "https://www.tiktok.com/@school7"), { ok: true, handle: "school7" });
  });

  it("takes a Telegram number, with or without the country", () => {
    assert.deepEqual(readAccount("telegram", "+992 92 947 5028"), { ok: true, handle: "+992929475028" });
    assert.deepEqual(readAccount("telegram", "929475028"), { ok: true, handle: "+992929475028" });
  });

  it("refuses another service's address, and names no service allows", () => {
    assert.deepEqual(readAccount("instagram", "https://t.me/mtmu7"), { ok: false, error: "otherService" });
    assert.deepEqual(readAccount("instagram", "javascript:alert(1)"), { ok: false, error: "invalid" });
    assert.deepEqual(readAccount("x", "much_too_long_for_x_handles"), { ok: false, error: "invalid" });
    assert.deepEqual(readAccount("snapchat", "  "), { ok: false, error: "empty" });
  });

  it("makes the address itself, never taking one as typed", () => {
    assert.equal(accountUrl({ platform: "telegram", handle: "+992929475028" }), "https://t.me/+992929475028");
    assert.equal(accountUrl({ platform: "snapchat", handle: "school7" }), "https://www.snapchat.com/add/school7");
    assert.equal(accountLabel({ platform: "instagram", handle: "school.7" }), "@school.7");
  });
});
