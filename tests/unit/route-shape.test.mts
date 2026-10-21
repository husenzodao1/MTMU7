import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { routeShape } from "../../src/components/skeletons/route-shape.ts";

describe("each page loads in its own shape", () => {
  const cases: Array<[string, ReturnType<typeof routeShape>]> = [
    ["/dashboard", "dashboard"],
    ["/teach", "teach"],
    ["/teach/attendance", "roll"],
    ["/teach/gradebook/7f0c4c4e-0000-4000-8000-000000000000", "journal"],
    ["/teach/homework/new", "form"],
    ["/teach/pupils/abc", "pupil"],
    ["/my-class", "people"],
    ["/my-class/import", "import"],
    ["/schedule", "week"],
    ["/grades", "marks"],
    ["/homework", "table"],
    ["/homework/abc", "detail"],
    ["/children", "children"],
    ["/children/abc", "child"],
    ["/library", "shelf"],
    ["/library/abc", "book"],
    ["/updates", "feed"],
    ["/news/new", "form"],
    ["/news/olympiad-2026", "article"],
    ["/profile", "profile"],
    ["/u/someone", "profile"],
    ["/admin", "stats"],
    ["/admin/accounts", "directory"],
    ["/admin/accounts/parents", "directory"],
    ["/admin/accounts/abc", "account"],
    ["/admin/accounts/new", "form"],
    ["/admin/classes", "tiles"],
    ["/admin/classes/abc", "classroom"],
    ["/admin/timetable", "week"],
    ["/admin/students/import", "import"],
    ["/admin/news/abc", "form"],
    ["/admin/audit", "table"],
    ["/admin/media", "shelf"],
  ];
  for (const [path, shape] of cases) {
    it(`${path} → ${shape}`, () => assert.equal(routeShape(path), shape));
  }

  it("ignores a trailing slash and falls back to a plain list", () => {
    assert.equal(routeShape("/grades/"), "marks");
    assert.equal(routeShape("/somewhere-new"), "list");
    assert.equal(routeShape(null), "list");
  });
});
