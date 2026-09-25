import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isGuestOnlyPath, isPortalPath } from "../../src/lib/security/routes.ts";

describe("route classification used by the proxy", () => {
  it("treats the portal and its subpaths as signed-in areas", () => {
    for (const path of ["/dashboard", "/admin", "/admin/students", "/teach/attendance", "/messages/42", "/profile"]) {
      assert.equal(isPortalPath(path), true, path);
    }
  });

  it("leaves the public site and auth pages open", () => {
    for (const path of ["/", "/schools", "/s/mtmu-7", "/s/mtmu-7/news", "/login", "/confirm-email", "/api/cron/x"]) {
      assert.equal(isPortalPath(path), false, path);
    }
  });

  it("does not send a signed-in visitor away from /confirm-email", () => {
    // A session exists there by design: the visitor is sent to it precisely
    // because they have one but have not yet proved the address. Treating it as
    // guest-only would bounce them back, as it once did for /register, and
    // produce ERR_TOO_MANY_REDIRECTS.
    assert.equal(isGuestOnlyPath("/confirm-email"), false);
    assert.equal(isGuestOnlyPath("/confirm-email/anything"), false);
  });

  it("keeps sign-in and password reset for guests", () => {
    assert.equal(isGuestOnlyPath("/login"), true);
    assert.equal(isGuestOnlyPath("/reset-password"), true);
    assert.equal(isGuestOnlyPath("/dashboard"), false);
  });

  it("does not match a path that merely starts with the same letters", () => {
    assert.equal(isPortalPath("/administration"), false);
    assert.equal(isGuestOnlyPath("/login-help"), false);
  });
});
