import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { replyKey, signReplyToken, verifyReplyToken } from "../../src/lib/push/reply-token.ts";

const key = replyKey("a-service-role-key-for-tests-only");
const grant = {
  userId: "11111111-1111-4111-8111-111111111111",
  conversationId: "22222222-2222-4222-8222-222222222222",
  expiresAt: 2_000_000_000_000,
};

describe("the key a notification is answered with", () => {
  it("reads back exactly what it was given", () => {
    assert.deepEqual(verifyReplyToken(signReplyToken(grant, key), key, 1_900_000_000_000), grant);
  });

  it("refuses one past its time", () => {
    assert.equal(verifyReplyToken(signReplyToken(grant, key), key, 2_000_000_000_001), null);
  });

  it("refuses one signed with another key, or changed after signing", () => {
    const other = replyKey("some-other-secret-entirely");
    assert.equal(verifyReplyToken(signReplyToken(grant, other), key, 0), null);
    const token = signReplyToken(grant, key);
    const [body, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ u: grant.userId, c: "33333333-3333-4333-8333-333333333333", e: grant.expiresAt })
    ).toString("base64url");
    assert.equal(verifyReplyToken(`${forged}.${signature}`, key, 0), null);
    assert.equal(verifyReplyToken(`${body}.${signature}x`, key, 0), null);
  });

  it("refuses anything that is not a token at all", () => {
    for (const junk of [null, 42, "", "a.b.c", "x".repeat(500), `${Buffer.from("{}").toString("base64url")}.sig`]) {
      assert.equal(verifyReplyToken(junk, key, 0), null);
    }
  });

  it("uses a key of its own, not the secret itself", () => {
    assert.notDeepEqual(replyKey("s"), Buffer.from("s"));
    assert.equal(replyKey("s").length, 32);
  });
});
