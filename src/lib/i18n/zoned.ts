/**
 * Conversions between `<input type="datetime-local">` values, which carry no
 * zone, and ISO instants, interpreted in the school's time zone.
 */

function offsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** "2026-09-15T08:30" in `timeZone` → ISO string, or null for empty/invalid input. */
export function localInputToIso(value: string | null | undefined, timeZone = "Asia/Dushanbe"): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const [datePart, timePart] = value.split("T") as [string, string];
  const [y, m, d] = datePart.split("-").map(Number) as [number, number, number];
  const [hh, mm] = timePart.split(":").map(Number) as [number, number];
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const offset = offsetMinutes(timeZone, guess);
  return new Date(guess.getTime() - offset * 60000).toISOString();
}

/**
 * A "YYYY-MM-DD" filter pair → the half-open instant range [start, end) that
 * covers those calendar days in `timeZone`. Both bounds are optional; the end
 * is the start of the day after `to`, so the whole last day is included.
 */
export function localDayRangeIso(
  from: string | null | undefined,
  to: string | null | undefined,
  timeZone = "Asia/Dushanbe"
): { start: string | null; end: string | null } {
  const dayStart = (day: string | null | undefined) =>
    day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? localInputToIso(`${day}T00:00`, timeZone) : null;
  let end: string | null = null;
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    const next = new Date(`${to}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    end = dayStart(next.toISOString().slice(0, 10));
  }
  return { start: dayStart(from), end };
}

/** ISO instant → "YYYY-MM-DDTHH:mm" in `timeZone` for datetime-local inputs. */
export function isoToLocalInput(iso: string | null | undefined, timeZone = "Asia/Dushanbe"): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const shifted = new Date(date.getTime() + offsetMinutes(timeZone, date) * 60000);
  return shifted.toISOString().slice(0, 16);
}
