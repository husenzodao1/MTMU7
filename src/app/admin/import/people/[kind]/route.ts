import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { can, getAccess } from "@/lib/auth/access";
import { buildWorkbook, type Sheet } from "@/lib/export/xlsx";
import { createClient } from "@/lib/supabase/server";
import { readPeopleSheet, type PeopleOutcome } from "@/features/admin/import/people-import";
import { isPeopleKind, PEOPLE_TEMPLATES } from "@/features/admin/import/templates";
import { guardianIssues } from "@/features/admin/import/guardians";
import { gradeLimits } from "@/features/accounts/queries";
import { sendCredentialsToParents } from "@/features/accounts/send-credentials";

// Hashing a thousand passwords at the cost GoTrue uses takes real time, so the
// work is done in chunks and the request is given room for them.
export const runtime = "nodejs";
export const maxDuration = 300;

const CHUNK = 300;

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
  if (!can(access, kind === "students" ? "students.import" : "staff.create")) {
    return new NextResponse(null, { status: 403 });
  }

  const formData = await request.formData();
  const sheet = await readPeopleSheet(kind, formData.get("file"));
  if (!sheet.ok) return NextResponse.json(sheet.result, { status: 400 });

  // The youngest pupils come with a parent, in the workbook as on the form.
  if (kind === "students") {
    const issues = guardianIssues(sheet.rows, (await gradeLimits(access.school.id)).required);
    if (issues.length > 0) {
      return NextResponse.json({ ok: false, message: "errors.validation", data: { errors: issues } }, { status: 400 });
    }
  }

  const supabase = await createClient();
  const credentials = new Map<number, { login: string; password: string }>();
  let created = 0;
  let updated = 0;
  let newClasses: string[] = [];

  for (let offset = 0; offset < sheet.rows.length; offset += CHUNK) {
    const { data, error } = await supabase.rpc("import_people", {
      p_kind: kind,
      p_rows: sheet.rows,
      p_dry_run: false,
      p_offset: offset,
      p_limit: CHUNK,
    });
    if (error) {
      // A chunk that fails leaves the ones before it in place. Saying how far
      // it got is the difference between "run it again" and "start over".
      return NextResponse.json(
        { ok: false, message: "errors.unexpected", data: { created, updated, failedAt: offset + 1 } },
        { status: 500 }
      );
    }
    const outcome = data as unknown as PeopleOutcome;
    if (!outcome.valid) return NextResponse.json({ ok: false, message: "errors.validation", data: outcome }, { status: 400 });
    created += outcome.created;
    updated += outcome.updated;
    newClasses = [...new Set([...newClasses, ...outcome.newClasses])];
    for (const credential of outcome.credentials) {
      credentials.set(credential.row, { login: credential.login, password: credential.password });
    }
  }

  const t = await getTranslations("admin.import.workbook");
  const template = PEOPLE_TEMPLATES[kind];
  const columns = [
    ...template.columns.map((column) => ({ header: column.header, width: column.width, issued: column.issued })),
    ...sheet.extras.map((extra) => ({ header: extra.header, width: 18 })),
  ];

  // Logins are looked up for every row, not only the new ones: the office wants
  // one file it can hand out from, and a row imported last term has a login too.
  const { data: directory } = await supabase
    .from("users")
    .select("public_id, email")
    .eq("school_id", access.school.id)
    .limit(5000);
  const loginByEmail = new Map((directory ?? []).map((row) => [row.email.toLowerCase(), row.public_id]));

  // The parents written beside the pupils: found by telephone or made, and
  // linked — after the pupils, so a new pupil's login finds them.
  if (kind === "students") {
    const withParents = (sheet.rows as Array<Record<string, string | undefined>>)
      .map((row, index): Record<string, string | undefined> => ({
        ...row,
        login: credentials.get(index + 1)?.login ?? row.login ?? loginByEmail.get((row.email ?? "").toLowerCase()) ?? "",
      }))
      .filter((row) => (row.guardian_name ?? "").trim() && (row.guardian_phone ?? "").trim());
    if (withParents.length > 0) await supabase.rpc("import_guardians", { p_rows: withParents });
  }

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
      return [
        ...template.columns.map((column) => {
          if (column.key === "login") return issued?.login ?? loginByEmail.get((row.email ?? "").toLowerCase()) ?? "";
          if (column.key === "password") return issued?.password ?? t("alreadyIssued");
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
        lines: [t("warningBody"), t("warningKeep"), t("summary", { created, updated })],
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
      "X-Telegram-Sent": String(telegram),
      "X-Import-New-Classes": encodeURIComponent(newClasses.join(",")),
    },
  });
}
