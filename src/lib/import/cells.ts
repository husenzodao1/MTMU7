/**
 * Turning what a spreadsheet hands back into the text a person typed.
 *
 * Kept free of any server-only import so it can be tested on its own: these few
 * conversions are where a register quietly goes wrong — a birthday a day early,
 * a telephone number that lost its leading zero, a class name that arrived as
 * the number 5 because the cell held "5" and nothing else.
 */

/** Cells arrive as strings, numbers, booleans, dates or nothing at all. */
export function cellText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) {
    // Read back in UTC. A date cell carries midnight, and reading it in a
    // timezone behind UTC moves every birthday back by one day.
    const year = value.getUTCFullYear();
    const month = `${value.getUTCMonth() + 1}`.padStart(2, "0");
    const day = `${value.getUTCDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "";
  return String(value).trim();
}
