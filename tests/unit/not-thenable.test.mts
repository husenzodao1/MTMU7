import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { notThenable } from "../../src/lib/native/not-thenable.ts";

/** What Capacitor's registerPlugin hands back on a phone: every property is a native method. */
function capacitorLikePlugin(name: string, methods: Record<string, (...args: unknown[]) => unknown>) {
  return new Proxy({} as Record<string, unknown>, {
    get: (_, property) => {
      const method = methods[String(property)];
      if (method) return method;
      return () => {
        throw new Error(`"${name}.${String(property)}()" is not implemented on android`);
      };
    },
  });
}

describe("a Capacitor plugin handed out of an async function", () => {
  it("is swallowed by the await as it is — the bug the app shipped with", async () => {
    const google = capacitorLikePlugin("GoogleAccount", { signIn: async () => ({ idToken: "t" }) });
    const handOut = async () => google;
    await assert.rejects(handOut(), /"GoogleAccount\.then\(\)" is not implemented/);
  });

  it("arrives whole once it has no then, and its methods still reach the phone", async () => {
    const google = capacitorLikePlugin("GoogleAccount", { signIn: async () => ({ idToken: "token-from-phone" }) });
    const handOut = async () => notThenable(google);
    const arrived = await handOut();
    assert.equal((arrived as { then?: unknown }).then, undefined);
    assert.deepEqual(await (arrived.signIn as () => Promise<unknown>)(), { idToken: "token-from-phone" });
  });
});
