import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildQueryString, ilikeAny, ilikePattern, parseListParams } from "../../src/lib/list-params.ts";

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
  it("escapes LIKE wildcards in single-column patterns", () => {
    assert.equal(ilikePattern("50%_off"), "%50\\%\\_off%");
  });

  it("cannot inject extra PostgREST or-conditions", () => {
    const filter = ilikeAny(["title", "author"], "x%,status.eq.draft),(id.neq.0");
    assert.ok(filter);
    assert.equal(filter.split(",").length, 2, filter);
    assert.doesNotMatch(filter, /[()]/);
    assert.equal(ilikeAny(["title"], " ,.() "), null);
  });
});

describe("buildQueryString", () => {
  it("merges and removes parameters", () => {
    assert.equal(buildQueryString({ q: "a", page: "2" }, { page: null, view: "past" }), "?q=a&view=past");
    assert.equal(buildQueryString({}, {}), "");
  });
});
