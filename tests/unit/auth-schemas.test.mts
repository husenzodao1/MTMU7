import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { otpSchema, passwordSchema } from "../../src/features/auth/schemas.ts";

describe("the code from the account email", () => {
  it("is six digits", () => {
    assert.equal(otpSchema.safeParse("123456").success, true);
    assert.equal(otpSchema.safeParse(" 123456 ").data, "123456", "typed with a stray space, pasted from an email");
  });

  it("is not five, not seven, and not eight", () => {
    // Eight is the length GoTrue issues when the project's OTP setting was
    // never turned down, and it arrived that way once. Accepting it would let
    // the mismatch pass unnoticed while every screen still promises six.
    for (const value of ["12345", "1234567", "12345678"]) {
      assert.equal(otpSchema.safeParse(value).success, false, value);
    }
  });

  it("is digits only", () => {
    for (const value of ["12345a", "12-345", "", "  "]) {
      assert.equal(otpSchema.safeParse(value).success, false, JSON.stringify(value));
    }
  });
});

describe("a password somebody chooses for themselves", () => {
  it("wants ten characters, a letter and a digit", () => {
    assert.equal(passwordSchema.safeParse("parol12345").success, true);
    assert.equal(passwordSchema.safeParse("Ҳусейнов2026").success, true, "Tajik letters count as letters");
    assert.equal(passwordSchema.safeParse("parol1").success, false, "too short");
    assert.equal(passwordSchema.safeParse("1234567890").success, false, "no letter");
    assert.equal(passwordSchema.safeParse("parolparol").success, false, "no digit");
  });
});
