"use client";

import { useTranslations } from "next-intl";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { TextAreaField, TextField } from "@/components/ui/fields";
import { saveLessonTopicAction } from "@/features/teach/journal-actions";

export interface LessonTopic {
  date: string;
  shortDate: string;
  topic: string;
  homework: string | null;
}

/**
 * The right-hand page of the register: a narrow column of dates and a wide one
 * of what each lesson was about.
 *
 * Deliberately a plain list rather than a grid. The marks page is dense because
 * it has to be; this one is read as prose, by the head teacher checking that the
 * syllabus was covered, and it should look like the page it replaces.
 */
export function LessonTopics({
  classSubjectId,
  academicTermId,
  topics,
  defaultDate,
  readOnly,
}: {
  classSubjectId: string;
  academicTermId: string;
  topics: LessonTopic[];
  defaultDate: string;
  readOnly?: boolean;
}) {
  const t = useTranslations("teach.gradebook");

  return (
    <div className="space-y-4">
      {topics.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("noTopics")}</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{t("topics")}</caption>
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
              <th scope="col" className="w-20 px-2 py-2 text-start">{t("date")}</th>
              <th scope="col" className="px-2 py-2 text-start">{t("topic")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line align-top">
            {topics.map((lesson) => (
              <tr key={lesson.date}>
                <td className="px-2 py-2 text-xs tabular text-ink-secondary">{lesson.shortDate}</td>
                <td className="px-2 py-2">
                  <p className="text-ink">{lesson.topic}</p>
                  {lesson.homework ? (
                    <p className="mt-0.5 text-xs text-ink-muted">
                      <span className="font-medium">{t("homework")}:</span> {lesson.homework}
                    </p>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {readOnly ? null : (
        <ActionForm action={saveLessonTopicAction} className="space-y-3 border-t border-line pt-4" resetOnSuccess>
          <input type="hidden" name="classSubjectId" value={classSubjectId} />
          <input type="hidden" name="academicTermId" value={academicTermId} />
          <TextField name="lessonDate" type="date" label={t("date")} defaultValue={defaultDate} required />
          <TextAreaField name="topic" label={t("topic")} rows={2} maxLength={500} required />
          <TextAreaField name="homework" label={t("homework")} rows={2} maxLength={1000} />
          <SubmitButton size="sm">{t("saveTopic")}</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
