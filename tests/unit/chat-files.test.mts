import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkFile, cleanFileName, formatBytes, formatDuration, kindOf, MAX_FILE_BYTES, splitLinks } from "../../src/features/messages/files.ts";

describe("which files a conversation takes", () => {
  it("takes documents, tables, slides, archives, sound and video by their extension", () => {
    for (const [name, kind] of [
      ["Timetable.PDF", "pdf"],
      ["report.docx", "doc"],
      ["marks.xlsx", "sheet"],
      ["lesson.pptx", "slides"],
      ["photos.zip", "archive"],
      ["song.mp3", "audio"],
      ["clip.mp4", "video"],
      ["notes.txt", "text"],
    ] as const) {
      const check = checkFile(name, 1000);
      assert.ok(check.ok, name);
      if (check.ok) assert.equal(check.kind, kind, name);
    }
  });

  it("refuses programs, pages and scripts, whatever they are called", () => {
    for (const name of ["setup.exe", "page.html", "run.bat", "app.apk", "script.js", "image.svg", "noextension", "x.pdf.exe"]) {
      assert.deepEqual(checkFile(name, 1000), { ok: false, error: "not_allowed" }, name);
    }
  });

  it("refuses an empty file and one over twenty megabytes", () => {
    assert.deepEqual(checkFile("a.pdf", 0), { ok: false, error: "empty" });
    assert.deepEqual(checkFile("a.pdf", MAX_FILE_BYTES + 1), { ok: false, error: "too_large" });
    assert.ok(checkFile("a.pdf", MAX_FILE_BYTES).ok);
  });

  it("gives the file a clean name that keeps its extension", () => {
    assert.equal(cleanFileName("C:\\Users\\me\\Report <final>.docx"), "Report final.docx");
    assert.equal(cleanFileName("../../etc/passwd.txt"), "passwd.txt");
    assert.equal(cleanFileName(".pdf", "pdf"), "file.pdf");
    const long = cleanFileName(`${"a".repeat(300)}.xlsx`);
    assert.equal(long.length, 120);
    assert.ok(long.endsWith(".xlsx"));
  });

  it("tells a kind from the name first, then from the type", () => {
    assert.equal(kindOf("x.pdf", "application/octet-stream"), "pdf");
    assert.equal(kindOf(null, "audio/webm"), "audio");
    assert.equal(kindOf("strange", null), "doc");
  });
});

describe("how files and recordings are described", () => {
  it("writes sizes the way people read them", () => {
    assert.equal(formatBytes(812, "en"), "812 B");
    assert.equal(formatBytes(48 * 1024, "en"), "48 KB");
    assert.equal(formatBytes(3.4 * 1024 * 1024, "en"), "3.4 MB");
    assert.equal(formatBytes(3.4 * 1024 * 1024, "ru"), "3,4 МБ");
  });

  it("writes a recording's length as minutes and seconds", () => {
    assert.equal(formatDuration(7), "0:07");
    assert.equal(formatDuration(102), "1:42");
    assert.equal(formatDuration(null), "0:00");
  });
});

describe("links in a message", () => {
  it("finds web addresses and leaves the sentence's punctuation outside them", () => {
    assert.deepEqual(splitLinks("See https://edu.tj/news. Thanks"), [
      { text: "See " },
      { text: "https://edu.tj/news", href: "https://edu.tj/news" },
      { text: ". Thanks" },
    ]);
  });

  it("never makes a link of anything but http and https", () => {
    assert.deepEqual(splitLinks("javascript:alert(1) and data:text/html,x"), [{ text: "javascript:alert(1) and data:text/html,x" }]);
  });
});
