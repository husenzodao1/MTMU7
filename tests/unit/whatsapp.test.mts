import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { whatsappLink, whatsappNumber } from "../../src/lib/contact/whatsapp.ts";

describe("a number for WhatsApp", () => {
  it("takes a Tajik mobile however it was typed", () => {
    for (const typed of ["929475028", "92 947 5028", "+992 92 947 5028", "992929475028", "00992 92 947-50-28", "(92) 947-50-28"]) {
      assert.equal(whatsappNumber(typed), "992929475028", typed);
    }
    assert.equal(whatsappNumber("+992 17 902 17 17"), "992179021717");
    assert.equal(whatsappNumber("00 123 4567"), "992001234567");
  });

  it("refuses a Tajik landline, which cannot have WhatsApp", () => {
    assert.equal(whatsappNumber("+992 3454 2 12 34"), null);
    assert.equal(whatsappNumber("372212345"), null);
  });

  it("refuses what is not a whole number", () => {
    for (const typed of [null, undefined, "", "   ", "12345", "+992 92 947", "+992 92 947 5028 1", "нет", "92947502x", "+0 123 456 7890"]) {
      assert.equal(whatsappNumber(typed), null, String(typed));
    }
  });

  it("takes a Russian mobile with 8 or 7 in front, and any number written in full international form", () => {
    assert.equal(whatsappNumber("8 912 345 67 89"), "79123456789");
    assert.equal(whatsappNumber("79123456789"), "79123456789");
    assert.equal(whatsappNumber("+7 912 345-67-89"), "79123456789");
    assert.equal(whatsappNumber("+998 90 123 45 67"), "998901234567");
    assert.equal(whatsappNumber("8 495 123 45 67"), null);
  });

  it("makes the link WhatsApp opens", () => {
    assert.equal(whatsappLink("92 947 5028"), "https://wa.me/992929475028");
    assert.equal(whatsappLink("+992 3454 2 12 34"), null);
  });
});
