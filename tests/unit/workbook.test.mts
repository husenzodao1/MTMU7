import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cellText } from "../../src/lib/import/cells.ts";
import { fromHeadingRow, pickSheet } from "../../src/lib/import/sheet-pick.ts";
import { normalizeHeader, PEOPLE_TEMPLATES, TIMETABLE_TEMPLATE } from "../../src/features/admin/import/templates.ts";

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

  it("forgives the Tajik letters a Russian keyboard does not have", () => {
    assert.equal(normalizeHeader("Руз"), normalizeHeader("Рӯз*"));
    assert.equal(normalizeHeader("Чадвал"), normalizeHeader("Ҷадвал"));
    // "у" followed by a combining macron, as some Tajik layouts type "ӯ".
    assert.equal(normalizeHeader("Ру\u0304з"), normalizeHeader("Рӯз"));
  });
});

describe("finding the rows in a workbook that is not quite ours", () => {
  const columns = TIMETABLE_TEMPLATE.columns;
  const heading = ["Синф*", "Рӯз*", "1", "2"];
  const lesson = ["5А", "Душанбе", "Математика (14)", ""];

  it("takes a sheet renamed to Лист1 when it is the only one with anything on it", () => {
    const rows = pickSheet([{ name: "Лист1", rows: [heading, lesson] }, { name: "Лист2", rows: [] }], "Ҷадвал", columns);
    assert.deepEqual(rows, [heading, lesson]);
  });

  it("prefers the sheet whose headings are the template's over an instructions page", () => {
    const rows = pickSheet(
      [
        { name: "Дастур", rows: [["Чӣ тавр пур кардан"], ["Ҳар сатр як синф ва як рӯз"]] },
        { name: "Sheet1", rows: [heading, lesson] },
      ],
      "Ҷадвал",
      columns
    );
    assert.deepEqual(rows, [heading, lesson]);
  });

  it("finds the sheet by a name retyped on a Russian keyboard", () => {
    const rows = pickSheet([{ name: "Дастур", rows: [["x"]] }, { name: "Чадвал", rows: [["Синф"], ["5А"]] }], "Ҷадвал", columns);
    assert.deepEqual(rows, [["Синф"], ["5А"]]);
  });

  it("gives up only when several sheets have something and none is recognisable", () => {
    assert.equal(pickSheet([{ name: "A", rows: [["x"]] }, { name: "B", rows: [["y"]] }], "Ҷадвал", columns), null);
  });

  it("starts at the headings when a title was typed above them", () => {
    const rows = fromHeadingRow([["Ҷадвали дарсҳо, нимсолаи 1"], [], heading, lesson], columns);
    assert.deepEqual(rows, [heading, lesson]);
  });

  it("leaves the rows alone when the headings are nowhere, so the missing ones can be named", () => {
    const rows = [["Номи фан"], ["Алгебра"]];
    assert.deepEqual(fromHeadingRow(rows, columns), rows);
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
