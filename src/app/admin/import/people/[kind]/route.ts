import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { can, getAccess } from "@/lib/auth/access";
import { buildWorkbook, type Sheet } from "@/lib/export/xlsx";
import { createClient } from "@/lib/supabase/server";
import { readPeopleSheet, type PeopleOutcome } from "@/features/admin/import/people-import";
import { isPeopleKind, PEOPLE_TEMPLATES, writtenColumns } from "@/features/admin/import/templates";
import { phoneConflicts } from "@/features/admin/import/phone-conflicts";
import { myHomeroomClasses } from "@/features/accounts/queries";
import { sendCredentialsToParents } from "@/features/accounts/send-credentials";

// Hashing a thousand passwords at the cost GoTrue uses takes real time, so the
// work is done in chunks and the request is given room for them.
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Rows per call. A pupil's row makes up to two accounts (the pupil, hashed
 * light, and one parent, hashed at full cost — 00096): about 80 ms a row, so
 * a chunk finishes in seconds, well inside one call's time limit.
 */
const CHUNK = { students: 100, staff: 200 } as const;
/** One call may take this long: far beyond a chunk, far short of the function's limit. */
const CALL_TIMEOUT_MS = 120_000;
/**
 * No chunk is started after this. The rows done so far are handed back with
 * their passwords, and the import is run again for the rest, rather than the
 * platform stopping the function with every password of the run in it.
 */
const BUDGET_MS = 230_000;

/**
 * Imports the register and hands the workbook straight back with the Логин and
 * Парол columns filled in.
 *
 * The passwords exist in the database's answer, in this function's memory, and
 * in the file that leaves it. They are never stored and never logged, so the
 * file the office downloads is the only copy — which is why it comes back in
 * the response rather than as something to fetch again later.
 *
 * Chunking is safe because the import is an upsert: a run that stops halfway
 * can simply be repeated, and the rows already done are recognised and left
 * alone rather than duplicated.
 */
export async function POST(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const access = await getAccess();
  if (!access?.school) return new NextResponse(null, { status: 401 });
  if (!isPeopleKind(kind)) return new NextResponse(null, { status: 404 });
  // A class teacher imports their own class; the database refuses any row of
  // another class (import_people, 00088).
  if (!can(access, kind === "students" ? "students.import" : "staff.create")) {
    if (kind !== "students" || (await myHomeroomClasses(access)).length === 0) return new NextResponse(null, { status: 403 });
  }

  const started = Date.now();
  const formData = await request.formData();
  const sheet = await readPeopleSheet(kind, formData.get("file"));
  if (!sheet.ok) return NextResponse.json(sheet.result, { status: 400 });

  const supabase = await createClient({ timeoutMs: CALL_TIMEOUT_MS });
  // The same check as the preview: a number on two accounts stops the import
  // here, row by row, rather than half-way through it.
  const clashes = await phoneConflicts(supabase, sheet.rows);
  if (clashes.length > 0) {
    return NextResponse.json({ ok: false, message: "errors.validation", data: { errors: clashes } }, { status: 400 });
  }
  const credentials = new Map<number, { login: string; password: string }>();
  // Every row's login, new or long issued, and the parent's beside it (one a
  // pupil: the father, or else the mother — 00096).
  const logins = new Map<number, string>();
  const parents = new Map<number, { login: string; password: string | null }>();
  let created = 0;
  let updated = 0;
  let newClasses: string[] = [];
  // The first row not imported, when the run stopped before the end.
  let stoppedAt: number | null = null;
  const chunk = CHUNK[kind];

  for (let offset = 0; offset < sheet.rows.length; offset += chunk) {
    if (offset > 0 && Date.now() - started > BUDGET_MS) {
      stoppedAt = offset + 1;
      break;
    }
    const { data, error } = await supabase.rpc("import_people", {
      p_kind: kind,
      p_rows: sheet.rows,
      p_dry_run: false,
      p_offset: offset,
      p_limit: chunk,
    });
    if (error) {
      console.error("import_people failed", { kind, offset, code: error.code, message: error.message });
      // Nothing imported yet: nothing to hand back.
      if (offset === 0) {
        return NextResponse.json({ ok: false, message: "errors.unexpected", data: { created, updated, failedAt: 1 } }, { status: 500 });
      }
      // The chunks before this one are in, with passwords issued that exist
      // nowhere but here: they go back in the file, and the rest is imported
      // by running the same file again, which issues nothing twice.
      stoppedAt = offset + 1;
      break;
    }
    const outcome = data as unknown as PeopleOutcome;
    if (!outcome.valid) return NextResponse.json({ ok: false, message: "errors.validation", data: outcome }, { status: 400 });
    created += outcome.created;
    updated += outcome.updated;
    newClasses = [...new Set([...newClasses, ...outcome.newClasses])];
    for (const credential of outcome.credentials) {
      credentials.set(credential.row, { login: credential.login, password: credential.password });
    }
    for (const entry of outcome.logins ?? []) logins.set(entry.row, entry.login);
    for (const parent of outcome.parents ?? []) {
      if (parent.login) parents.set(parent.row, { login: parent.login, password: parent.password });
    }
  }

  const t = await getTranslations("admin.import.workbook");
  const template = PEOPLE_TEMPLATES[kind];
  const written = writtenColumns(template);
  const columns = [
    ...written.map((column) => ({ header: column.header, width: column.width, issued: column.issued })),
    ...sheet.extras.map((extra) => ({ header: extra.header, width: 18 })),
  ];

  // The youngest pupils' new logins, straight to the parents who follow them
  // in the bot, when the office asked for it.
  let telegram = 0;
  if (kind === "students" && formData.get("notifyParents") === "1" && credentials.size > 0) {
    telegram = (await sendCredentialsToParents([...credentials.values()])).messages;
  }

  const body: Sheet = {
    name: template.sheet,
    columns,
    rows: sheet.rows.map((row, index) => {
      const issued = credentials.get(index + 1);
      const parent = parents.get(index + 1);
      const skipped = stoppedAt !== null && index + 1 >= stoppedAt;
      return [
        ...written.map((column) => {
          if (skipped && (column.key === "login" || column.key === "password")) return t("notImported");
          if (column.key === "login") return issued?.login ?? logins.get(index + 1) ?? row.login ?? "";
          if (column.key === "password") return issued?.password ?? t("alreadyIssued");
          if (column.key === "parent_login") return parent?.login ?? "";
          if (column.key === "parent_password") return parent ? parent.password ?? t("alreadyIssued") : "";
          return row[column.key] ?? "";
        }),
        ...sheet.extras.map((extra) => extra.values[index] ?? ""),
      ];
    }),
  };

  const file = await buildWorkbook(
    [
      {
        name: t("warningSheet"),
        title: t("warningTitle"),
        lines: [
          t("warningBody"),
          t("warningKeep"),
          t("summary", { created, updated }),
          ...(stoppedAt !== null ? [t("stoppedAt", { row: stoppedAt })] : []),
          ...(kind === "students" ? [t("parentsSummary", { issued: [...parents.values()].filter((p) => p.password).length, total: parents.size })] : []),
        ],
      },
    ],
    [body]
  );

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${kind}-${stamp}.xlsx"`,
      "Cache-Control": "private, no-store",
      "X-Import-Created": String(created),
      "X-Import-Updated": String(updated),
      "X-Import-Parents": String([...parents.values()].filter((p) => p.password).length),
      "X-Telegram-Sent": String(telegram),
      "X-Import-New-Classes": encodeURIComponent(newClasses.join(",")),
      ...(stoppedAt !== null ? { "X-Import-Stopped-At": String(stoppedAt) } : {}),
    },
  });
}
