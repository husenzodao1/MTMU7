/**
 * Writes the filled-in example workbooks to disk.
 *
 *   npm run import:samples            # into ./samples
 *   npm run import:samples -- <dir>   # somewhere else
 *
 * The same files are downloadable from the import pages, which is where the
 * school office will get them. This exists so they can also be sent, printed or
 * kept alongside the school's own paperwork without anyone needing to sign in.
 *
 * The rows come from src/features/admin/import/samples.ts, so the examples can
 * never drift from the columns the importer actually reads.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildWorkbook } from "../../src/lib/export/xlsx.ts";
import { isSampleKind, sampleRows, sampleSpec, SAMPLE_NOTICE, type SampleKind } from "../../src/features/admin/import/samples.ts";

const OUT = resolve(process.argv[2] ?? "samples");
mkdirSync(OUT, { recursive: true });

const KINDS: SampleKind[] = ["students", "staff", "timetable"];

for (const kind of KINDS) {
  if (!isSampleKind(kind)) continue;
  const spec = sampleSpec(kind);
  const columns = spec.columns.map((column) => ({
    header: column.required ? `${column.header}*` : column.header,
    width: column.width,
    issued: column.issued,
  }));

  const file = await buildWorkbook(
    [
      { name: "НАМУНА", title: `${spec.title} — намунаи пуркардашуда`, lines: SAMPLE_NOTICE },
      { name: "Дастур", title: spec.title, lines: [...spec.instructions, "", "Сутунҳои бо * ҳатмӣ."] },
    ],
    [{ name: spec.sheet, columns, rows: sampleRows(kind) }]
  );

  const path = join(OUT, `${spec.sheet} — намуна.xlsx`);
  writeFileSync(path, file);
  console.log(`${path}  (${file.length} bytes, ${sampleRows(kind).length} rows)`);
}

console.log("\nThese are examples. Import the blank workbooks with the school's own data.");
