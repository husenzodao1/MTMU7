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
    for (const path of ["/", "/schools", "/s/mtmu-7", "/s/mtmu-7/news", "/login", "/register", "/pending", "/api/cron/x"]) {
      assert.equal(isPortalPath(path), false, path);
    }
  });

  it("does not send a signed-in visitor away from /register", () => {
    // A session can exist before the account has a profile row, and the portal
    // sends exactly that visitor to /register?step=profile. Treating /register
    // as guest-only bounced them back and produced ERR_TOO_MANY_REDIRECTS.
    assert.equal(isGuestOnlyPath("/register"), false);
    assert.equal(isGuestOnlyPath("/register/anything"), false);
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
