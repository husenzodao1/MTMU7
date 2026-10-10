import "server-only";
import writeXlsxFile, { type Cell, type SheetData } from "write-excel-file/node";

/**
 * Writing the workbooks the school office fills in and gets back.
 *
 * A real .xlsx rather than a CSV, because these files carry several sheets, a
 * frozen heading row, columns wide enough for a Tajik surname and a page of
 * instructions — none of which survive a comma-separated file. The office opens
 * them in Excel, edits them, saves them and sends them back.
 */

export interface SheetColumn {
  header: string;
  width?: number;
  /** Rendered grey: the columns the portal fills in, not the office. */
  issued?: boolean;
}

export interface Sheet {
  name: string;
  columns: SheetColumn[];
  rows: Array<Array<string | null>>;
}

/** A page of prose: one wide column, nothing to match against. */
export interface ProseSheet {
  name: string;
  title: string;
  lines: string[];
}

const HEADER_BACKGROUND = "#fdf7ea";
const ISSUED_BACKGROUND = "#eef0f2";

function headerRow(columns: SheetColumn[]): Cell[] {
  return columns.map((column) => ({
    value: column.header,
    type: String,
    fontWeight: "bold" as const,
    backgroundColor: column.issued ? ISSUED_BACKGROUND : HEADER_BACKGROUND,
  }));
}

function bodyRow(columns: SheetColumn[], values: Array<string | null>): Cell[] {
  return columns.map((column, index) => {
    const value = values[index];
    return {
      // Every cell is written as text. A date left as a date comes back as a
      // serial number in whichever calendar the machine was set to, and a
      // leading zero on a telephone number would simply be gone.
      //
      // Deliberately not run through neutralizeFormula: a .xlsx cell declared
      // as a string is never evaluated, so the apostrophe that guard prepends
      // would be a real character in the file, and +992… would come back as
      // '+992…. That guard belongs to CSV, where the format cannot say what a
      // cell is.
      value: value == null || value === "" ? undefined : String(value),
      type: String,
      backgroundColor: column.issued ? ISSUED_BACKGROUND : undefined,
    };
  });
}

function proseRows(sheet: ProseSheet): SheetData {
  return [
    [{ value: sheet.title, type: String, fontWeight: "bold" as const }],
    [{ value: undefined, type: String }],
    ...sheet.lines.map((line) => [{ value: line || undefined, type: String, wrap: true, align: "left" as const }]),
  ];
}

/**
 * One workbook. The prose pages come first, because the first thing the office
 * sees on opening the file should be what to do with it.
 */
export async function buildWorkbook(prose: ProseSheet[], sheets: Sheet[]): Promise<Buffer> {
  const written = await writeXlsxFile([
    ...prose.map((page) => ({ sheet: page.name, data: proseRows(page), columns: [{ width: 110 }] })),
    ...sheets.map((sheet) => ({
      sheet: sheet.name,
      data: [headerRow(sheet.columns), ...sheet.rows.map((row) => bodyRow(sheet.columns, row))],
      columns: sheet.columns.map((column) => ({ width: column.width ?? 18 })),
      // The heading stays in view while the office scrolls a thousand pupils.
      stickyRowsCount: 1,
    })),
  ]);
  return written.toBuffer();
}
