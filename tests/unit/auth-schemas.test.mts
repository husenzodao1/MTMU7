import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { otpSchema, passwordSchema } from "../../src/features/auth/schemas.ts";

describe("the code from the account email", () => {
  it("is six digits", () => {
    assert.equal(otpSchema.safeParse("123456").success, true);
    assert.equal(otpSchema.safeParse(" 123456 ").data, "123456", "typed with a stray space, pasted from an email");
  });

  it("is whatever length the project issues, because refusing it locks people out", () => {
    // This test used to insist on exactly six, on the reasoning that accepting
    // eight would hide a misconfigured project. The project was misconfigured,
    // it sent eight, and the reasoning cost somebody their account: the field
    // kept the first six characters of a correct code and refused them for
    // ever. Only GoTrue can say whether a code is the right one; the form's job
    // is to carry it there intact.
    for (const value of ["123456", "1234567", "12345678"]) {
      assert.equal(otpSchema.safeParse(value).success, true, value);
    }
  });

  it("still refuses what is plainly not a code", () => {
    for (const value of ["12345", "12345678901", "12345a", "", "  "]) {
      assert.equal(otpSchema.safeParse(value).success, false, JSON.stringify(value));
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
