"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/surface";
import { importTimetableAction } from "@/features/admin/import/timetable-actions";
import { SheetImportWizard } from "@/features/admin/import/sheet-wizard";
import { TIMETABLE_TEMPLATE } from "@/features/admin/import/templates";

/** Download the grid → fill it in → check it → replace the week. */
export function TimetableImportWizard() {
  const t = useTranslations("admin.import");
  return (
    <SheetImportWizard
      kind="timetable"
      instructions={TIMETABLE_TEMPLATE.instructions}
      submit={importTimetableAction}
      issueField={(field) => t("timetable.cell", { field: field.replace(/^p/, "") })}
      notes={(outcome) =>
        outcome.newSubjects.length > 0 ? (
          <Alert tone="info" title={t("timetable.newSubjectsTitle")}>
            {t("timetable.newSubjects", { subjects: outcome.newSubjects.join(", ") })}
          </Alert>
        ) : null
      }
      confirmLabel={(outcome) => t("timetable.confirm", { total: outcome.total })}
      done={(outcome) => t("timetable.done", { lessons: outcome.written })}
      backHref="/admin/timetable"
    />
  );
}
