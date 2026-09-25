import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cellText } from "../../src/lib/import/cells.ts";
import { normalizeHeader, PEOPLE_TEMPLATES } from "../../src/features/admin/import/templates.ts";

describe("what a spreadsheet hands back", () => {
  it("reads a date cell as the day it says, in any timezone", () => {
    // Excel stores midnight. Reading it with local getters would move a
    // birthday to the day before for anyone west of Greenwich.
    assert.equal(cellText(new Date(Date.UTC(2015, 2, 4))), "2015-03-04");
    assert.equal(cellText(new Date(Date.UTC(2015, 0, 1))), "2015-01-01");
  });

  it("reads a number back as its digits", () => {
    assert.equal(cellText(14), "14", "a teacher number typed without quotes arrives as a number");
    assert.equal(cellText(0), "0");
  });

  it("treats an empty cell as an empty string, never as the word null", () => {
    assert.equal(cellText(null), "");
    assert.equal(cellText(undefined), "");
    assert.equal(cellText("  spaced  "), "spaced");
  });
});

describe("matching a heading to its column", () => {
  it("ignores case, stray spaces and the required star", () => {
    assert.equal(normalizeHeader("Санаи таваллуд*"), normalizeHeader(" санаи  таваллуд "));
    assert.equal(normalizeHeader("Логин"), "логин");
  });

  it("keeps Cyrillic, which the CSV reader would have deleted", () => {
    // The CSV header normalizer strips everything outside [a-z0-9], so "Синф"
    // became the empty string and the column vanished. These templates are
    // written in Tajik, so they need their own comparison.
    assert.notEqual(normalizeHeader("Синф"), "");
  });
});

describe("the workbooks themselves", () => {
  it("end with the two columns the portal fills in", () => {
    for (const template of Object.values(PEOPLE_TEMPLATES)) {
      const last = template.columns.slice(-2);
      assert.deepEqual(last.map((column) => column.key), ["login", "password"], template.sheet);
      assert.ok(last.every((column) => column.issued), "both must be marked as issued, so they are drawn grey");
    }
  });

  it("give every column a distinct heading", () => {
    for (const template of Object.values(PEOPLE_TEMPLATES)) {
      const headings = template.columns.map((column) => normalizeHeader(column.header));
      assert.equal(new Set(headings).size, headings.length, `${template.sheet} has two columns with one heading`);
    }
  });

  it("require what the import cannot work without", () => {
    const required = (kind: keyof typeof PEOPLE_TEMPLATES) =>
      PEOPLE_TEMPLATES[kind].columns.filter((column) => column.required).map((column) => column.key).sort();
    assert.deepEqual(required("students"), ["class_name", "date_of_birth", "email", "first_name", "last_name"]);
    assert.deepEqual(required("staff"), ["email", "employee_number", "first_name", "last_name"]);
  });
});
