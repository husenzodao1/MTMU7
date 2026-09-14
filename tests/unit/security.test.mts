import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { safeRedirectPath } from "../../src/lib/security/redirect.ts";
import { buildContentSecurityPolicy } from "../../src/lib/security/csp.ts";

describe("safeRedirectPath (SEC-008)", () => {
  it("keeps same-origin relative paths with query and hash", () => {
    assert.equal(safeRedirectPath("/admin/users?page=2#top"), "/admin/users?page=2#top");
    assert.equal(safeRedirectPath("/news/olimpiada"), "/news/olimpiada");
  });

  it("rejects every open-redirect variant", () => {
    const attacks = [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "\\\\evil.example",
      "@evil.example",
      "javascript:alert(1)",
      "/\t/evil.example",
      "/%09/evil.example".replace("%09", "\t"),
      " //evil.example",
      "evil.example",
      "",
      null,
      42,
    ];
    for (const attack of attacks) {
      assert.equal(safeRedirectPath(attack, "/dashboard"), "/dashboard", `must reject ${String(attack)}`);
    }
  });

  it("does not allow host injection through userinfo after the origin join", () => {
    const result = safeRedirectPath("/@evil.example");
    assert.equal(result, "/@evil.example");
    assert.ok(!new URL(result, "https://school.tj").host.includes("evil"));
  });
});

describe("Content-Security-Policy", () => {
  it("allows only nonce scripts and the configured Supabase origin", () => {
    const csp = buildContentSecurityPolicy("abc123", "https://project.supabase.co", false);
    assert.match(csp, /script-src 'self' 'nonce-abc123' 'strict-dynamic'(;|$)/);
    assert.match(csp, /connect-src 'self' https:\/\/project\.supabase\.co wss:\/\/project\.supabase\.co/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.doesNotMatch(csp, /unsafe-eval/);
    assert.match(csp, /upgrade-insecure-requests/);
  });

  it("adds unsafe-eval only in development", () => {
    assert.match(buildContentSecurityPolicy("n", "http://127.0.0.1:54321", true), /'unsafe-eval'/);
  });

  it("stays same-origin when the Supabase URL is invalid", () => {
    const csp = buildContentSecurityPolicy("n", "not a url", false);
    assert.match(csp, /connect-src 'self'(;|$)/);
  });
});
