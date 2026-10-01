import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { buildWorkbook, type Sheet } from "@/lib/export/xlsx";
import { can, getAccess } from "@/lib/auth/access";
import { todayIso } from "@/lib/i18n/format";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CodeRow {
  student_id: string;
  class_name: string;
  full_name: string;
  nickname: string | null;
  login: string | null;
  code: string;
}

/**
 * The sheet the office prints and cuts up: one class, one row per pupil, and
 * the code that pupil's parent types into the bot.
 *
 * Only the hash is kept, so this file is the only copy of the codes. Issuing
 * again replaces them — which is how a lost slip is dealt with, and why the
 * page says so before the button.
 */
export async function POST(request: Request) {
  const access = await getAccess();
  if (!access?.school) return new NextResponse(null, { status: 401 });
  if (!can(access, "students.update")) return new NextResponse(null, { status: 403 });

  const form = await request.formData();
  const classId = String(form.get("classId") ?? "");
  if (!UUID.test(classId)) return new NextResponse(null, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("issue_parent_codes", { p_class: classId });
  if (error) return new NextResponse(null, { status: 500 });

  const rows = (data ?? []) as unknown as CodeRow[];
  const t = await getTranslations("admin.parents");

  const sheet: Sheet = {
    name: t("sheet"),
    columns: [
      { header: t("class"), width: 10 },
      { header: t("pupil"), width: 34 },
      { header: t("nickname"), width: 20 },
      { header: t("login"), width: 14 },
      { header: t("code"), width: 16, issued: true },
    ],
    rows: rows.map((row) => [row.class_name, row.full_name, row.nickname ?? "", row.login ?? "", row.code]),
  };

  const file = await buildWorkbook(
    [
      {
        name: t("noticeSheet"),
        title: t("noticeTitle"),
        lines: [t("noticeBody"), t("noticeKeep"), t("noticeReissue"), t("noticeCount", { count: rows.length })],
      },
    ],
    [sheet]
  );

  // The school's own day, not the server's: at three in the morning in
  // Dushanbe the UTC date is still yesterday, and the file would be misfiled.
  const stamp = todayIso(access.school.timezone);
  // Named for the class in the school's own alphabet. Stripping it to ASCII
  // turned both 5А and 5Б into "5_", so the second download quietly replaced
  // the first.
  const name = `${t("sheet")} ${rows[0]?.class_name ?? ""} ${stamp}`.trim().replace(/\s+/g, " ");
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}.xlsx`,
      "Cache-Control": "no-store",
    },
  });
}
