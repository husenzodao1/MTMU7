export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | boolean | null | undefined;
}

/**
 * Spreadsheet applications execute cells that start with =, +, -, @, tab or
 * carriage return as formulas (CSV injection). Such values are prefixed with
 * an apostrophe so they are shown as text.
 */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? neutralizeFormula(value) : String(value);
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** UTF-8 CSV with BOM so Excel shows Cyrillic correctly. */
export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines = [columns.map((c) => escapeCsvCell(c.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCsvCell(c.value(row))).join(","));
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

/**
 * Parses CSV text (RFC 4180 quoting, comma or semicolon separated) into
 * records keyed by normalized header names. Used by the import preview.
 */
export function parseCsv(text: string, maxRows = 5000): { headers: string[]; rows: Array<Record<string, string>> } {
  const source = text.replace(/^﻿/, "");
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]!;
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field === "") {
      quoted = true;
    } else if (char === delimiter) {
      record.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      record.push(field);
      field = "";
      if (record.some((cell) => cell.trim() !== "")) records.push(record);
      record = [];
      if (records.length > maxRows + 1) break;
    } else {
      field += char;
    }
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    if (record.some((cell) => cell.trim() !== "")) records.push(record);
  }

  const [headerRow, ...dataRows] = records;
  const headers = (headerRow ?? []).map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
  const rows = dataRows.slice(0, maxRows).map((cells) => {
    const entry: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (header) entry[header] = (cells[index] ?? "").trim();
    });
    return entry;
  });
  return { headers, rows };
}
