import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { postSignInPath, safeRedirectPath } from "../../src/lib/security/redirect.ts";
import { buildContentSecurityPolicy } from "../../src/lib/security/csp.ts";
import { uuid } from "../../src/lib/validation/uuid.ts";

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

describe("destination after signing in", () => {
  it("keeps a real portal destination", () => {
    assert.equal(postSignInPath("/admin/students?page=2"), "/admin/students?page=2");
    assert.equal(postSignInPath("/teach/attendance"), "/teach/attendance");
  });

  it("never returns to the auth flow after a correct password", () => {
    // A leftover "next" from an earlier redirect used to send the visitor back
    // to the registration form the moment they signed in.
    for (const path of ["/login", "/confirm-email", "/confirm-email?next=/dashboard", "/reset-password", "/verify", "/auth/callback"]) {
      assert.equal(postSignInPath(path), "/dashboard", path);
    }
  });

  it("still refuses another origin", () => {
    assert.equal(postSignInPath("https://evil.example/x"), "/dashboard");
    assert.equal(postSignInPath("//evil.example"), "/dashboard");
  });
});

describe("identifier validation", () => {
  it("accepts the identifiers this database actually contains", () => {
    // Seeded rows use readable ids; Zod's own uuid() rejects them because the
    // RFC version nibble is zero, which once made a signed-in user look like
    // an account with no profile.
    for (const id of [
      "00000000-0000-0000-0001-000000000004",
      "00000000-0000-0000-0000-000000000001",
      "c0cc1e7b-4b3e-4027-a114-971f5c3f305d",
      "A0000000-0000-4000-8000-000000000001",
    ]) {
      assert.equal(uuid.safeParse(id).success, true, id);
    }
  });

  it("still rejects anything that is not an identifier", () => {
    for (const value of ["", "not-a-uuid", "00000000-0000-0000-0001", "00000000000000000001000000000004", "'; drop table users; --"]) {
      assert.equal(uuid.safeParse(value).success, false, value);
    }
  });
});
