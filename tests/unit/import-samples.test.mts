import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sampleRows, sampleSpec } from "../../src/features/admin/import/samples.ts";

/** The subjects a timetable cell names: «Англисӣ (19) / Англисӣ (23)» → both. */
function subjectsIn(cell: string): string[] {
  return cell
    .split("/")
    .map((part) => part.replace(/\(\s*\d+\s*\)/, "").trim())
    .filter(Boolean);
}

describe("the filled-in examples", () => {
  it("name every subject of the sample timetable in the sample subjects", () => {
    const subjects = new Set(sampleRows("subjects").map((row) => String(row[0]).toLowerCase()));
    const spec = sampleSpec("timetable");
    const periods = spec.columns.map((column, index) => (/^p\d+$/.test(column.key) ? index : -1)).filter((index) => index >= 0);
    const missing = new Set<string>();
    for (const row of sampleRows("timetable")) {
      for (const index of periods) {
        for (const name of subjectsIn(String(row[index] ?? ""))) if (!subjects.has(name.toLowerCase())) missing.add(name);
      }
    }
    assert.deepEqual([...missing], []);
  });

  it("give every subject a unique name and code", () => {
    const rows = sampleRows("subjects");
    const names = rows.map((row) => String(row[0]).toLowerCase());
    const codes = rows.map((row) => String(row[3]));
    assert.equal(new Set(names).size, names.length);
    assert.equal(new Set(codes).size, codes.length);
    assert.ok(codes.every((code) => /^[A-Z0-9_-]{1,20}$/.test(code)));
  });
});
