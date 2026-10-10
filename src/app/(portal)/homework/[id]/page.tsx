import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Paperclip } from "lucide-react";
import { submitHomeworkAction } from "@/features/academic/homework-actions";
import { resolveStudentContext } from "@/features/academic/student-context";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { StatusBadge } from "@/components/ui/badge";
import { DirectUpload } from "@/components/ui/direct-upload";
import { TextAreaField } from "@/components/ui/fields";
import { Markdown } from "@/components/ui/misc";
import { Alert, Breadcrumb, Card, CardBody, CardHeader, DescriptionList, PageHeader } from "@/components/ui/surface";
import { requireModule } from "@/lib/auth/guards";
import { formatDateTime, formatNumber } from "@/lib/i18n/format";
import { pickName, type Locale } from "@/lib/i18n/text";
import type { SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { robots: { index: false } };

export default async function HomeworkDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const access = await requireModule("homework");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const t = await getTranslations("portal.homework");
  const ts = await getTranslations("common.status");
  const locale = (await getLocale()) as Locale;
  const context = await resolveStudentContext(access, await searchParams);
  if (!context) notFound();

  const supabase = await createClient();
  const { data: assignment } = await supabase
    .from("homework_assignments")
    .select("id, title, instructions, due_at, max_score, allow_submissions, status, class_subjects!inner(subjects!inner(name_tg, name_ru, name_en)), homework_attachments(id, file_name, size_bytes)")
    .eq("id", id)
    .maybeSingle();
  if (!assignment) notFound();

  const { data: submission } = await supabase
    .from("homework_submissions")
    .select("id, content, status, submitted_at, score, feedback, reviewed_at, homework_attachments(id, file_name)")
    .eq("assignment_id", id)
    .eq("student_id", context.studentId)
    .maybeSingle();

  const canSubmit =
    context.viewer === "student" &&
    assignment.status === "published" &&
    assignment.allow_submissions &&
    (!submission || ["submitted", "late", "returned"].includes(submission.status));

  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumb label={t("breadcrumb")} items={[{ label: t("title"), href: "/homework" }, { label: assignment.title }]} />}
        title={assignment.title}
        description={pickName(assignment.class_subjects.subjects, locale)}
        meta={assignment.due_at ? <span className="text-sm text-ink-secondary tabular">{t("due", { date: formatDateTime(assignment.due_at, locale) })}</span> : null}
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t("instructions")} />
          <CardBody className="space-y-4">
            {assignment.instructions ? <Markdown source={assignment.instructions} /> : <p className="text-sm text-ink-muted">{t("noInstructions")}</p>}
            {assignment.homework_attachments.length > 0 ? (
              <ul className="space-y-1.5">
                {assignment.homework_attachments.map((file) => (
                  <li key={file.id}>
                    <a href={`/files/homework/${file.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-text hover:underline">
                      <Paperclip className="size-4" aria-hidden />
                      {file.file_name}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("yourWork")} actions={submission ? <StatusBadge status={submission.status} label={ts(submission.status)} /> : null} />
          <CardBody className="space-y-4">
            {submission ? (
              <DescriptionList
                items={[
                  { term: t("submittedAt"), description: submission.submitted_at ? formatDateTime(submission.submitted_at, locale) : "—" },
                  ...(submission.score !== null ? [{ term: t("score"), description: `${formatNumber(submission.score, locale)}${assignment.max_score ? ` / ${formatNumber(assignment.max_score, locale)}` : ""}` }] : []),
                ]}
              />
            ) : null}
            {submission?.feedback ? (
              <Alert tone="info" title={t("feedback")}>
                <p className="whitespace-pre-line">{submission.feedback}</p>
              </Alert>
            ) : null}
            {submission?.homework_attachments.length ? (
              <ul className="space-y-1">
                {submission.homework_attachments.map((file) => (
                  <li key={file.id}>
                    <a href={`/files/homework/${file.id}`} className="inline-flex items-center gap-1.5 text-sm text-brand-text hover:underline">
                      <Paperclip className="size-4" aria-hidden />
                      {file.file_name}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}

            {canSubmit && access.school ? (
              <ActionForm action={submitHomeworkAction} className="space-y-4 border-t border-line pt-4">
                <input type="hidden" name="assignmentId" value={assignment.id} />
                <TextAreaField name="content" label={t("answer")} defaultValue={submission?.content ?? ""} rows={6} maxLength={20000} />
                <DirectUpload kind="homework" folder={`${access.school.id}/${access.userId}`} name="attachment" label={t("attachment")} />
                <SubmitButton className="w-full">{submission ? t("resubmit") : t("submit")}</SubmitButton>
              </ActionForm>
            ) : context.viewer === "student" && !submission && !assignment.allow_submissions ? (
              <p className="text-sm text-ink-muted">{t("noSubmissions")}</p>
            ) : null}
            {context.viewer === "guardian" && !submission ? <p className="text-sm text-ink-muted">{t("notSubmittedYet")}</p> : null}
          </CardBody>
        </Card>
      </div>
      <p className="mt-6">
        <Link href="/homework" className="text-sm font-medium text-brand-text hover:underline">
          ← {t("backToList")}
        </Link>
      </p>
    </>
  );
}
