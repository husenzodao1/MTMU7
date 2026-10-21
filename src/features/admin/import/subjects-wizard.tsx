"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/surface";
import { importSubjectsAction } from "@/features/admin/import/subjects-actions";
import { SheetImportWizard } from "@/features/admin/import/sheet-wizard";
import { SUBJECTS_TEMPLATE } from "@/features/admin/import/templates";

/** Download the list → fill it in → check it → add and update the subjects. */
export function SubjectsImportWizard() {
  const t = useTranslations("admin.import");
  const heading = (field: string) => SUBJECTS_TEMPLATE.columns.find((column) => column.key === field)?.header ?? field;
  return (
    <SheetImportWizard
      kind="subjects"
      instructions={SUBJECTS_TEMPLATE.instructions}
      submit={importSubjectsAction}
      issueField={heading}
      notes={(outcome) =>
        outcome.valid ? (
          <Alert tone="info" title={t("subjects.planTitle")}>
            {t("subjects.plan", { created: outcome.created, updated: outcome.updated })}
            {outcome.newSubjects.length > 0 ? <span className="mt-1 block text-ink-secondary">{outcome.newSubjects.join(" · ")}</span> : null}
          </Alert>
        ) : null
      }
      confirmLabel={(outcome) => t("subjects.confirm", { total: outcome.total })}
      done={(outcome) => t("subjects.done", { created: outcome.created, updated: outcome.updated })}
      backHref="/admin/subjects"
    />
  );
}
