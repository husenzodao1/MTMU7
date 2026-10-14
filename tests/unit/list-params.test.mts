import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildQueryString, matchAny, parseListParams, searchPattern } from "../../src/lib/list-params.ts";

describe("parseListParams", () => {
  it("clamps pages and restricts sorts and filters to allow-lists", () => {
    const list = parseListParams(
      { page: "-4", sort: "drop table", status: "evil", category: "not-a-uuid", q: "  math  " },
      { sorts: ["recent", "title"] as const, defaultSort: "recent", filters: { status: ["active"], category: "uuid" } }
    );
    assert.equal(list.page, 1);
    assert.equal(list.sort, "recent");
    assert.deepEqual(list.filters, {});
    assert.equal(list.query, "math");
  });

  it("accepts valid values", () => {
    const id = "0b5f3f39-8b1d-4a57-9f35-3ab1c2d4e5f6";
    const list = parseListParams({ page: "3", sort: "title", status: "active", category: id }, {
      sorts: ["recent", "title"] as const,
      defaultSort: "recent",
      pageSize: 10,
      filters: { status: ["active"], category: "uuid" },
    });
    // Lists grow as they are scrolled: page 3 is the first three pages.
    assert.deepEqual([list.offset, list.pageSize, list.perPage], [0, 30, 10]);
    assert.deepEqual(list.filters, { status: "active", category: id });
  });
});

describe("search filters", () => {
  it("drops pattern characters from single-column patterns", () => {
    assert.equal(searchPattern("50%_off"), "50 off");
    assert.equal(searchPattern(" .*() "), null);
  });

  it("matches the Tajik letters a hurried hand swaps", () => {
    // Мехровар finds Меҳровар, Али finds Алӣ, whichever was typed.
    assert.equal(searchPattern("Мехровар"), "м[её][хҳ]ровар");
    assert.equal(searchPattern("Алӣ"), "ал[иӣ]");
    for (const [typed, name] of [
      ["Мехровар", "Меҳровар"],
      ["Меҳровар", "Мехровар"],
      ["кодир", "Қодир"],
      ["чамшед", "Ҷамшед"],
      ["Ёкуб", "Яқуб"],
      ["гаффор", "Ғаффор"],
      ["Умед", "Ӯмед"],
    ] as const) {
      const pattern = searchPattern(typed)!;
      const matches = new RegExp(pattern, "iu").test(name);
      if (typed === "Ёкуб") assert.equal(matches, false, `${typed} is not ${name}`);
      else assert.ok(matches, `${typed} → ${pattern} should find ${name}`);
    }
  });

  it("cannot inject extra PostgREST or-conditions", () => {
    const filter = matchAny(["title", "author"], "x%,status.eq.draft),(id.neq.0");
    assert.ok(filter);
    assert.equal(filter.split(",").length, 2, filter);
    assert.doesNotMatch(filter, /[()]/);
    assert.equal(matchAny(["title"], " ,.() "), null);
    assert.equal(matchAny(["first_name", "last_name"], "Ҳасан"), "first_name.imatch.[хҳ]асан,last_name.imatch.[хҳ]асан");
  });
});

describe("buildQueryString", () => {
  it("merges and removes parameters", () => {
    assert.equal(buildQueryString({ q: "a", page: "2" }, { page: null, view: "past" }), "?q=a&view=past");
    assert.equal(buildQueryString({}, {}), "");
  });
});
