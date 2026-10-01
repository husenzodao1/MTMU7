import test from "node:test";
import assert from "node:assert/strict";
import { hasValidCronAuthorization } from "../../src/lib/security/cron.ts";

test("cron authorization requires an exact bearer secret", () => {
  const secret = "a".repeat(32);
  assert.equal(hasValidCronAuthorization(`Bearer ${secret}`, secret), true);
  assert.equal(hasValidCronAuthorization(`Bearer ${secret.slice(0, -1)}`, secret), false);
  assert.equal(hasValidCronAuthorization(`Basic ${secret}`, secret), false);
  assert.equal(hasValidCronAuthorization(null, secret), false);
  assert.equal(hasValidCronAuthorization(`Bearer ${secret}`, undefined), false);
});
