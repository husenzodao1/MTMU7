import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { markdownToPlainText, parseInline, parseMarkdown, safeHref } from "../../src/lib/content/markdown.ts";
import { escapeCsvCell, parseCsv, toCsv } from "../../src/lib/export/csv.ts";
import { checkFile, contentMatchesType, isValidStoragePath, newStoragePath } from "../../src/lib/storage/files.ts";
import { buildQueryString, ilikePattern, parseListParams } from "../../src/lib/list-params.ts";

describe("safe markdown", () => {
  it("parses headings, lists, quotes and inline formatting", () => {
    const blocks = parseMarkdown("## Эълон\n\nМатни **муҳим** ва *курсив*.\n\n- як\n- ду\n\n1. first\n2. second\n\n> иқтибос");
    assert.deepEqual(blocks.map((b) => b.type), ["heading", "paragraph", "list", "list", "quote"]);
    const paragraph = blocks[1]!;
    assert.equal(paragraph.type, "paragraph");
    if (paragraph.type === "paragraph") {
      assert.deepEqual(paragraph.children.map((c) => c.type), ["text", "strong", "text", "em", "text"]);
    }
  });

  it("never produces links to dangerous schemes", () => {
    for (const href of ["javascript:alert(1)", "data:text/html,<script>", "//evil.example", "vbscript:x", " JaVaScRiPt:alert(1)"]) {
      assert.equal(safeHref(href), null, href);
    }
    const nodes = parseInline("[click](javascript:alert(1))");
    assert.deepEqual(nodes, [{ type: "text", value: "click" }]);
    assert.equal(safeHref("https://edu.tj/doc"), "https://edu.tj/doc");
    assert.equal(safeHref("/news/a"), "/news/a");
  });

  it("treats HTML as text", () => {
    const blocks = parseMarkdown("<script>alert(1)</script>");
    assert.deepEqual(blocks, [{ type: "paragraph", children: [{ type: "text", value: "<script>alert(1)</script>" }] }]);
  });

  it("creates plain-text excerpts", () => {
    assert.equal(markdownToPlainText("## Title\n\n**Bold** [link](https://x.tj)", 50), "Title Bold link");
    assert.equal(markdownToPlainText("a".repeat(30), 10).length, 10);
  });
});

describe("CSV", () => {
  it("neutralizes spreadsheet formulas and escapes delimiters", () => {
    assert.equal(escapeCsvCell("=HYPERLINK(\"http://x\")"), "\"'=HYPERLINK(\"\"http://x\"\")\"");
    assert.equal(escapeCsvCell("+992 900"), "'+992 900");
    assert.equal(escapeCsvCell("Karimov, Ali"), "\"Karimov, Ali\"");
    assert.equal(escapeCsvCell(null), "");
  });

  it("writes UTF-8 with BOM and parses it back", () => {
    const csv = toCsv([{ name: "Ҳусейнов; А.", score: 5 }], [
      { header: "Ном", value: (r) => r.name },
      { header: "Score", value: (r) => r.score },
    ]);
    assert.ok(csv.startsWith("﻿"));
    const parsed = parseCsv("first_name;Last Name;class\nАли;Каримов;9А\n\"Мадина\";\"Раҳимова, М\";9Б\n");
    assert.deepEqual(parsed.headers, ["first_name", "last_name", "class"]);
    assert.deepEqual(parsed.rows[1], { first_name: "Мадина", last_name: "Раҳимова, М", class: "9Б" });
  });
});

describe("upload validation", () => {
  it("checks size, MIME type and extension together", () => {
    assert.deepEqual(checkFile("book", { name: "physics.pdf", type: "application/pdf", size: 1000 }), { ok: true, extension: "pdf" });
    assert.equal(checkFile("book", { name: "virus.exe", type: "application/pdf", size: 10 }).ok, false);
    // Avatars allow four megabytes, which covers an ordinary phone photograph.
    assert.equal(checkFile("avatar", { name: "a.png", type: "image/png", size: 3 * 1024 * 1024 }).ok, true);
    assert.equal(checkFile("avatar", { name: "a.png", type: "image/png", size: 5 * 1024 * 1024 }).ok, false);
    assert.equal(checkFile("image", { name: "a.svg", type: "image/svg+xml", size: 10 }).ok, false);
  });

  it("sniffs content to catch renamed files", () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(contentMatchesType("application/pdf", pdf), true);
    assert.equal(contentMatchesType("image/png", pdf), false);
    assert.equal(contentMatchesType("image/png", png), true);
  });

  it("accepts only generated paths inside the school folder", () => {
    const school = "00000000-0000-0000-0000-000000000001";
    const path = newStoragePath(school, "news", "webp");
    assert.equal(isValidStoragePath(path, school, "news"), true);
    assert.equal(isValidStoragePath(`${school}/news/../x.webp`, school, "news"), false);
    assert.equal(isValidStoragePath(path.replace(school, "0000000b-0000-0000-0000-00000000000b"), school, "news"), false);
    assert.equal(isValidStoragePath(`${school}/news/evil name.webp`, school, "news"), false);
  });
});

describe("list parameters", () => {
  it("clamps paging and restricts sort and filters to allow-lists", () => {
    const params = parseListParams(
      { page: "-4", sort: "drop table", status: "active", role: "hacker", class: "not-a-uuid", q: "  Али  " },
      { sorts: ["name", "created"], defaultSort: "created", filters: { status: ["active", "blocked"], role: ["student"], class: "uuid" } }
    );
    assert.equal(params.page, 1);
    assert.equal(params.sort, "created");
    assert.deepEqual(params.filters, { status: "active" });
    assert.equal(params.query, "Али");
  });

  it("escapes PostgREST pattern characters", () => {
    assert.equal(ilikePattern("50%_a,b()"), "%50\\%\\_a\\,b\\(\\)%");
    assert.equal(buildQueryString({ q: "x", page: "3" }, { page: null, sort: "name" }), "?q=x&sort=name");
  });
});
