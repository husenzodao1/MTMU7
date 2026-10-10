/**
 * What the report picture shows, worked out apart from how it is drawn.
 *
 * A table typed in a monospace font looked like a spreadsheet printout on a
 * phone, and Telegram wrapped it wherever it liked. The report is now a
 * picture (report-card.tsx) of a card: the child, then each mark or absence on
 * a line of its own with the subject in words and the mark as a coloured
 * badge. This file decides the lines, their words and their colours; it is
 * free of the renderer and of the server, so the tests can read it.
 */
import { dayMonth, markText, pickRaw, statusWord, words, type Loc, type Report, type ReportKind } from "./messages.ts";

export type Tone = "great" | "good" | "fair" | "poor" | "late" | "excused" | "absent" | "plain";

export interface CardRow {
  title: string;
  detail: string | null;
  value: string;
  tone: Tone;
  /** A mark is drawn round, a status as a pill. */
  shape: "mark" | "pill" | "text";
}

export interface CardSection {
  title: string;
  kind: "grades" | "attendance" | "timetable" | "results";
  rows: CardRow[];
  /** How many were left out to keep the picture a sensible length. */
  more: number;
}

export interface CardModel {
  title: string;
  dateLine: string;
  child: string;
  className: string | null;
  sections: CardSection[];
  empty: string | null;
  average: { label: string; value: string; tone: Tone } | null;
  school: string | null;
}

const MOST_ROWS = 14;

/** A mark's colour, read as a share of its maximum: 5 green, 4 blue, 3 amber, 2 red. */
export function markTone(score: number, max: number): Tone {
  const share = max > 0 ? score / max : 0;
  if (share >= 0.9) return "great";
  if (share >= 0.7) return "good";
  if (share >= 0.55) return "fair";
  return "poor";
}

function statusTone(status: string): Tone {
  return status === "late" ? "late" : status === "excused" ? "excused" : "absent";
}

function capitalise(value: string): string {
  return value ? value[0]!.toUpperCase() + value.slice(1) : value;
}

export function reportCardModel(
  locale: Loc,
  report: Report,
  kind: ReportKind,
  school?: { name?: string | null } | null
): CardModel {
  const w = words(locale);
  const title = kind === "timetable" ? w.timetable : kind === "results" ? w.resultsTitle : kind === "week" ? w.week : w.dayReport;
  const date = (iso?: string) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "");
  const dateLine =
    kind === "results"
      ? [report.term?.name, `${date(report.from)} – ${date(report.to)}`].filter(Boolean).join(" · ")
      : kind === "week"
        ? `${date(report.from)} – ${date(report.to)}`
        : date(report.to);
  const base = { title, dateLine, child: report.child.name, className: report.child.class ?? null, school: school?.name ?? null };

  // The term so far: one line a subject — its marks in words, their average
  // as the badge — and the average of the averages at the foot.
  if (kind === "results") {
    const rows = report.results ?? [];
    const marked = rows.filter((row) => row.average !== null);
    const mean = marked.length ? marked.reduce((sum, row) => sum + Number(row.average), 0) / marked.length : null;
    return {
      ...base,
      sections: rows.length
        ? [
            {
              title: w.resultsTitle,
              kind: "results",
              rows: rows.slice(0, MOST_ROWS * 2).map((row) => ({
                title: pickRaw(row.subject, locale),
                detail:
                  [
                    row.marks.length ? row.marks.map((m) => markText(m.score, m.max)).join("  ") : null,
                    row.absences ? `${w.absentShort} ${row.absences}` : null,
                    row.late ? `${w.lateShort} ${row.late}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—",
                value: row.average === null ? "—" : Number(row.average).toFixed(1),
                tone: row.average === null ? "plain" : markTone(Number(row.average), 5),
                shape: "mark",
              })),
              more: Math.max(0, rows.length - MOST_ROWS * 2),
            },
          ]
        : [],
      empty: marked.length ? null : w.noResults,
      average: mean === null ? null : { label: w.average, value: mean.toFixed(1), tone: markTone(mean, 5) },
    };
  }

  if (kind === "timetable") {
    const rows = report.timetable ?? [];
    return {
      ...base,
      sections: rows.length
        ? [
            {
              title: w.timetable,
              kind: "timetable",
              rows: rows.slice(0, MOST_ROWS).map((row) => ({
                title: pickRaw(row.subject, locale),
                detail: [row.teacher, row.room ? `${w.room} ${row.room}` : null].filter(Boolean).join(" · ") || null,
                value: String(row.period),
                tone: "plain",
                shape: "mark",
              })),
              more: Math.max(0, rows.length - MOST_ROWS),
            },
          ]
        : [],
      empty: rows.length ? null : w.noTimetable,
      average: null,
    };
  }

  const sections: CardSection[] = [];
  if (report.grades.length > 0) {
    sections.push({
      title: w.grades,
      kind: "grades",
      rows: report.grades.slice(0, MOST_ROWS).map((g) => ({
        title: pickRaw(g.subject, locale),
        detail:
          [kind === "week" ? dayMonth(g.date) : null, pickRaw(g.work, locale) || null, g.final ? w.final : null]
            .filter(Boolean)
            .join(" · ") || null,
        value: markText(g.score, g.max),
        tone: markTone(g.score, g.max),
        shape: "mark",
      })),
      more: Math.max(0, report.grades.length - MOST_ROWS),
    });
  }
  if (report.attendance.length > 0) {
    sections.push({
      title: w.attendance,
      kind: "attendance",
      rows: report.attendance.slice(0, MOST_ROWS).map((a) => ({
        title: pickRaw(a.subject, locale) || w.attendance,
        detail:
          [kind === "week" ? dayMonth(a.date) : null, a.period ? `${w.lesson} ${a.period}` : null].filter(Boolean).join(" · ") || null,
        value: capitalise(statusWord(a.status, locale)),
        tone: statusTone(a.status),
        shape: "pill",
      })),
      more: Math.max(0, report.attendance.length - MOST_ROWS),
    });
  }

  // The same reading as the text report: on the five-point scale, term marks
  // aside, and only when there is more than one mark to average.
  const counted = report.grades.filter((g) => !g.final && g.max > 0);
  let average: CardModel["average"] = null;
  if (counted.length > 1) {
    const mean = counted.reduce((sum, g) => sum + (g.max === 5 ? g.score : (g.score / g.max) * 5), 0) / counted.length;
    average = { label: w.average, value: mean.toFixed(1), tone: markTone(mean, 5) };
  }

  return {
    ...base,
    sections,
    empty: sections.length ? null : kind === "week" ? w.nothingWeek : w.nothingToday,
    average,
  };
}

/** The picture's height for a model: header, each section, each line, the average, the footer. */
export function cardHeight(model: CardModel): number {
  const titled = model.sections.filter((section) => section.kind !== "timetable" && section.kind !== "results").length;
  const rows = model.sections.reduce((sum, section) => sum + section.rows.length, 0);
  const more = model.sections.filter((section) => section.more > 0).length;
  return Math.max(640, 500 + titled * 70 + rows * 112 + more * 50 + (model.empty ? 120 : 0) + (model.average ? 140 : 0));
}
