"use client";

import { ChevronDown, Download, FileSpreadsheet, FileUp, Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { Avatar } from "@/components/ui/misc";
import * as Overlay from "@/components/ui/overlay";
import { MemberCardDialog, type MemberCardSeed } from "@/features/messages/member-card";

/**
 * The face at the start of a row. A tap on the row opens the account for
 * editing; a tap on the face opens the person's profile card instead — who
 * they are, rather than what can be changed about them.
 */
export function ProfileAvatar({ userId, name, avatarUrl, canMessage }: { userId: string; name: string; avatarUrl: string | null; canMessage: boolean }) {
  const t = useTranslations("accounts");
  const [seed, setSeed] = useState<MemberCardSeed | null>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => setSeed({ userId, name, avatarUrl })}
        className="relative z-10 shrink-0 rounded-full transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        aria-label={t("row.openProfile", { name })}
        title={t("profile")}
      >
        <Avatar name={name} src={avatarUrl} size="md" />
      </button>
      <MemberCardDialog seed={seed} onClose={() => setSeed(null)} canMessage={canMessage} />
    </>
  );
}

/** New account, and everything Excel: import, templates, and export by kind. */
export function AccountsToolbar({
  basePath,
  canCreate,
  canImport,
  exportKinds,
  newLabel,
}: {
  basePath: string;
  canCreate: boolean;
  canImport: boolean;
  exportKinds: Array<"students" | "teachers" | "parents" | "staff" | "all">;
  newLabel: string;
}) {
  const t = useTranslations("accounts");
  return (
    <div className="flex flex-wrap items-center gap-2">
      {exportKinds.length > 0 || canImport ? (
        <Overlay.DropdownMenu>
          <Overlay.DropdownMenuTrigger asChild>
            <button type="button" className={buttonClasses("secondary")}>
              <FileSpreadsheet aria-hidden className="text-[#16a34a]" />
              {t("excel")}
              <ChevronDown aria-hidden />
            </button>
          </Overlay.DropdownMenuTrigger>
          <Overlay.DropdownMenuContent align="end">
            {canImport ? (
              <>
                <Overlay.DropdownMenuLabel>{t("tabs.import")}</Overlay.DropdownMenuLabel>
                <Overlay.DropdownMenuItem asChild>
                  <Link href="/admin/students/import">
                    <FileUp aria-hidden />
                    {t("importStudents")}
                  </Link>
                </Overlay.DropdownMenuItem>
                <Overlay.DropdownMenuItem asChild>
                  <Link href="/admin/staff/import">
                    <FileUp aria-hidden />
                    {t("importStaff")}
                  </Link>
                </Overlay.DropdownMenuItem>
                <Overlay.DropdownMenuItem asChild>
                  <a href="/admin/import/template/students" download>
                    <Download aria-hidden />
                    {t("templateStudents")}
                  </a>
                </Overlay.DropdownMenuItem>
                <Overlay.DropdownMenuItem asChild>
                  <a href="/admin/import/template/staff" download>
                    <Download aria-hidden />
                    {t("templateStaff")}
                  </a>
                </Overlay.DropdownMenuItem>
                {exportKinds.length > 0 ? <Overlay.DropdownMenuSeparator /> : null}
              </>
            ) : null}
            {exportKinds.length > 0 ? <Overlay.DropdownMenuLabel>{t("exportTitle")}</Overlay.DropdownMenuLabel> : null}
            {exportKinds.map((kind) => (
              <Overlay.DropdownMenuItem key={kind} asChild>
                <a href={`${basePath}/export?kind=${kind}`} download>
                  <FileSpreadsheet aria-hidden />
                  {t(`exportKinds.${kind}`)}
                </a>
              </Overlay.DropdownMenuItem>
            ))}
          </Overlay.DropdownMenuContent>
        </Overlay.DropdownMenu>
      ) : null}
      {canCreate ? (
        <Link href={`${basePath}/new`} className={buttonClasses("primary")}>
          <Plus aria-hidden />
          {newLabel}
        </Link>
      ) : null}
    </div>
  );
}
