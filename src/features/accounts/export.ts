import "server-only";
import { NextResponse } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { buildWorkbook, type Sheet } from "@/lib/export/xlsx";
import { formatDate, formatDateTime } from "@/lib/i18n/format";
import { pickName, type Locale } from "@/lib/i18n/text";
import { loadDirectory } from "@/features/accounts/queries";
import type { AccountCategory, AccountRow } from "@/features/accounts/types";

export const EXPORT_KINDS = ["students", "teachers", "parents", "staff", "all"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

/**
 * The register as a workbook, of one kind of account. Built from the same
 * directory the page shows, so a homeroom teacher's file holds their own
 * class and nothing else — the database decides, not this code.
 */
export async function exportAccounts(kind: ExportKind, timeZone: string, fileLabel: string): Promise<NextResponse> {
  const t = await getTranslations("accounts");
  const locale = (await getLocale()) as Locale;

  const category: AccountCategory = kind === "staff" ? "all" : kind;
  const rows: AccountRow[] = [];
  for (let page = 1; page <= 20; page++) {
    const directory = await loadDirectory({ category, query: "", classId: null, page, pageSize: 500 });
    if (!directory) return new NextResponse(null, { status: 403 });
    rows.push(...directory.rows);
    if (rows.length >= directory.total || directory.rows.length === 0) break;
  }
  const chosen = kind === "staff" ? rows.filter((r) => ["director", "admin", "staff"].includes(r.category)) : rows;

  const role = (r: AccountRow) => (r.roles[0] ? pickName(r.roles[0], locale) : "");
  const date = (value: string | null) => (value ? formatDate(value, locale) : "");
  const status = (r: AccountRow) => (r.status === "active" ? "" : r.status === "blocked" ? t("row.blocked") : r.status);

  let sheet: Sheet;
  if (kind === "students") {
    sheet = {
      name: t("exportKinds.students"),
      columns: [
        { header: t("fields.class_id"), width: 8 },
        { header: t("fields.last_name"), width: 20 },
        { header: t("fields.first_name"), width: 18 },
        { header: t("fields.middle_name"), width: 20 },
        { header: t("fields.date_of_birth"), width: 14 },
        { header: t("login"), width: 14 },
        { header: t("fields.nickname"), width: 16 },
        { header: t("fields.phone"), width: 18 },
        { header: t("fields.email"), width: 28 },
        { header: t("sections.positions"), width: 26 },
        { header: t("sections.guardians"), width: 10 },
        { header: "Telegram", width: 10 },
        { header: t("row.blocked"), width: 12 },
      ],
      rows: chosen.map((r) => [
        r.class_name, r.last_name, r.first_name, r.middle_name, date(r.date_of_birth), r.public_id, r.nickname, r.phone, r.email,
        r.positions.map((p) => t(`positions.${p}`)).join(", "), String(r.parents ?? 0), String(r.telegram ?? 0), status(r),
      ]),
    };
  } else if (kind === "parents") {
    sheet = {
      name: t("exportKinds.parents"),
      columns: [
        { header: t("fields.last_name"), width: 20 },
        { header: t("fields.first_name"), width: 18 },
        { header: t("fields.middle_name"), width: 20 },
        { header: t("sections.children"), width: 40 },
        { header: t("login"), width: 14 },
        { header: t("fields.phone"), width: 18 },
        { header: t("fields.email"), width: 28 },
      ],
      rows: chosen.map((r) => [r.last_name, r.first_name, r.middle_name, r.children, r.public_id, r.phone, r.email]),
    };
  } else {
    sheet = {
      name: t(`exportKinds.${kind}`),
      columns: [
        { header: t("sections.kind"), width: 18 },
        { header: t("fields.last_name"), width: 20 },
        { header: t("fields.first_name"), width: 18 },
        { header: t("fields.middle_name"), width: 20 },
        { header: kind === "all" ? `${t("fields.class_id")} / ${t("fields.homeroom_class_id")}` : t("fields.homeroom_class_id"), width: 18 },
        { header: t("login"), width: 14 },
        { header: t("fields.phone"), width: 18 },
        { header: t("fields.email"), width: 28 },
        { header: t("lastLogin"), width: 18 },
        { header: t("row.blocked"), width: 12 },
      ],
      rows: chosen.map((r) => [
        role(r), r.last_name, r.first_name, r.middle_name, r.class_name ?? r.homeroom, r.public_id, r.phone, r.email,
        r.last_login_at ? formatDateTime(r.last_login_at, locale, timeZone) : "", status(r),
      ]),
    };
  }

  const file = await buildWorkbook([], [sheet]);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileLabel}-${kind}-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
