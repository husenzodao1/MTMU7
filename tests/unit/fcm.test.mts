import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { createFcmClient, fcmMessage, readServiceAccount, serviceAccountAssertion } from "../../src/lib/push/fcm.ts";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const account = {
  project_id: "mtmu7-test",
  client_email: "push@mtmu7-test.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
};

function fakeFetch(sendStatuses: Array<{ status: number; body?: string }>) {
  const calls: Array<{ url: string; body: string; auth: string | null }> = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, body: String(init?.body ?? ""), auth: headers.get("authorization") });
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "ya29.test", expires_in: 3600 }), { status: 200 });
    }
    const next = sendStatuses.shift() ?? { status: 200 };
    return new Response(next.body ?? "{}", { status: next.status });
  }) as typeof fetch;
  return { impl, calls };
}

const message = { token: "device-token-1", title: "Мадина", body: "Салом", url: "/messages/c1", tag: "conversation:c1" };

describe("Firebase, without the SDK", () => {
  it("reads the service account as JSON or as base64, and nothing else", () => {
    const json = JSON.stringify({ ...account, type: "service_account" });
    assert.equal(readServiceAccount(json)?.project_id, "mtmu7-test");
    assert.equal(readServiceAccount(Buffer.from(json).toString("base64"))?.client_email, account.client_email);
    assert.equal(readServiceAccount("not a key"), null);
    assert.equal(readServiceAccount(JSON.stringify({ project_id: "x" })), null);
    assert.equal(readServiceAccount(undefined), null);
  });

  it("signs the assertion Google trades for an access token", () => {
    const jwt = serviceAccountAssertion(account, 1_800_000_000);
    const [header, claims, signature] = jwt.split(".");
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${claims}`);
    assert.equal(verifier.verify(publicKey, Buffer.from(signature!, "base64url")), true);
    const body = JSON.parse(Buffer.from(claims!, "base64url").toString());
    assert.equal(body.scope, "https://www.googleapis.com/auth/firebase.messaging");
    assert.equal(body.exp - body.iat, 3600);
  });

  it("sends a notification that opens the conversation, and asks for a token once", async () => {
    const fake = fakeFetch([{ status: 200 }, { status: 200 }]);
    const client = createFcmClient(account, fake.impl, () => 1_800_000_000_000);
    assert.equal(await client.send(message), "sent");
    assert.equal(await client.send({ ...message, token: "device-token-2" }), "sent");
    assert.equal(fake.calls.filter((c) => c.url.includes("oauth2")).length, 1);
    const send = fake.calls.find((c) => c.url.includes("fcm.googleapis.com"))!;
    assert.equal(send.url, "https://fcm.googleapis.com/v1/projects/mtmu7-test/messages:send");
    assert.equal(send.auth, "Bearer ya29.test");
    const payload = JSON.parse(send.body).message;
    assert.equal(payload.token, "device-token-1");
    // Android draws its own notification from the data; the iPhone gets the alert.
    assert.equal(payload.notification, undefined);
    assert.deepEqual(
      { kind: payload.data.kind, title: payload.data.title, body: payload.data.body, url: payload.data.url },
      { kind: "message", title: "Мадина", body: "Салом", url: "/messages/c1" }
    );
    assert.equal(payload.android.priority, "HIGH");
    assert.deepEqual(payload.apns.payload.aps.alert, { title: "Мадина", body: "Салом" });
    assert.equal(payload.apns.headers["apns-collapse-id"], "conversation:c1");
  });

  it("carries the reply key and the buttons' words only when there is a reply to offer", () => {
    const plain = fcmMessage(message, 1_800_000_000_000) as { data: Record<string, string> };
    assert.equal(plain.data.reply, undefined);
    const answerable = fcmMessage(
      { ...message, reply: "signed.token", labels: { reply: "Ҷавоб", read: "Хондам", placeholder: "Паём…", failed: "Нарафт" } },
      1_800_000_000_000
    ) as { data: Record<string, string> };
    assert.deepEqual(
      { reply: answerable.data.reply, replyLabel: answerable.data.replyLabel, readLabel: answerable.data.readLabel },
      { reply: "signed.token", replyLabel: "Ҷавоб", readLabel: "Хондам" }
    );
    // FCM data is strings only.
    assert.ok(Object.values(answerable.data).every((value) => typeof value === "string"));
  });

  it("tells a removed app from a passing failure", async () => {
    const fake = fakeFetch([
      { status: 404, body: '{"error":{"status":"NOT_FOUND"}}' },
      { status: 400, body: '{"error":{"status":"INVALID_ARGUMENT","message":"The registration token is not a valid FCM registration token"}}' },
      { status: 500 },
    ]);
    const client = createFcmClient(account, fake.impl);
    assert.equal(await client.send(message), "gone");
    assert.equal(await client.send(message), "gone");
    assert.equal(await client.send(message), "failed");
  });

  it("fails quietly when Google will not give a token", async () => {
    const impl = (async () => new Response("{}", { status: 401 })) as typeof fetch;
    assert.equal(await createFcmClient(account, impl).send(message), "failed");
  });
});
