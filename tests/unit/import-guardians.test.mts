import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gradeOf, guardianIssues } from "../../src/features/admin/import/guardians.ts";
import { credentialsMessage } from "../../src/features/accounts/credentials-message.ts";

describe("parents in the register workbook", () => {
  it("reads the grade off a class name", () => {
    assert.equal(gradeOf("1А"), 1);
    assert.equal(gradeOf(" 11Б"), 11);
    assert.equal(gradeOf("А5"), null);
  });

  it("asks a parent of the youngest pupils only", () => {
    const issues = guardianIssues(
      [
        { class_name: "2А" },
        { class_name: "3Б", guardian_name: "Каримова Мадина" },
        { class_name: "4В", guardian_name: "Каримова Мадина", guardian_phone: "+992 90 111 22 33" },
        { class_name: "7А" },
      ],
      4
    );
    assert.deepEqual(issues, [
      { row: 1, field: "guardian_name", code: "guardian_required" },
      { row: 2, field: "guardian_phone", code: "guardian_required" },
    ]);
  });

  it("checks a parent written for an older pupil too", () => {
    const issues = guardianIssues([{ class_name: "9А", guardian_phone: "abc" }], 4);
    assert.deepEqual(issues.map((i) => i.code).sort(), ["invalid_phone", "required"]);
  });
});

describe("the login sent to a parent", () => {
  const entry = {
    first_name: "Aziz", last_name: "Karimov", middle_name: null, nickname: "aziz.k", class_name: "3А",
    login: "MT-000123", password: "k7m2p9x4qa",
  };

  it("carries the name, class, login, password and nickname in a table", () => {
    const text = credentialsMessage(entry, "tg", "https://school.example/");
    for (const part of ["Karimov Aziz", "3А", "MT-000123", "k7m2p9x4qa", "aziz.k", "https://school.example/login"]) {
      assert.ok(text.includes(part), part);
    }
    assert.match(text, /<pre>[\s\S]*<\/pre>/);
  });

  it("escapes what came from people, once", () => {
    const text = credentialsMessage({ ...entry, last_name: "A<b>&" }, "en", "https://x.example");
    assert.ok(text.includes("A&lt;b&gt;&amp;"));
    assert.ok(!text.includes("&amp;lt;"));
  });
});
