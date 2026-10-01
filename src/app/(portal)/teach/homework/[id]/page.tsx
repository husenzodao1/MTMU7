import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Paperclip, Trash2 } from "lucide-react";
import { AssignmentForm } from "@/features/teach/assignment-form";
import { removeAssignmentAttachmentAction, reviewSubmissionAction } from "@/features/teach/homework-actions";
import { getClassSubjectContext, getRoster } from "@/features/teach/queries";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { StatusBadge } from "@/components/ui/badge";
import { TextAreaField, TextField } from "@/components/ui/fields";
import { Alert, Breadcrumb, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";
import { formatBytes } from "@/lib/storage/files";
import { formatDateTime, formatNumber } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import { isoToLocalInput } from "@/lib/i18n/zoned";
import { firstValue, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { robots: { index: false } };

export default async function TeachAssignmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("homework.create", "homework.review");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const saved = firstValue((await searchParams).saved);
  const t = await getTranslations("teach.homework");
  const tt = await getTranslations("teach");
  const ts = await getTranslations("common.status");
  const locale = (await getLocale()) as Locale;
  const timeZone = access.school!.timezone;
  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("homework_assignments")
    .select("id, class_subject_id, title, instructions, due_at, max_score, allow_submissions, status, published_at, homework_attachments(id, file_name, size_bytes, uploaded_by)")
    .eq("id", id)
    .maybeSingle();
  if (!assignment) notFound();
  const cs = await getClassSubjectContext(assignment.class_subject_id, locale);
  if (!cs) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const [roster, { data: submissions }] = await Promise.all([
    getRoster(cs.classId, today),
    supabase
      .from("homework_submissions")
      .select("id, student_id, content, status, submitted_at, score, feedback, homework_attachments(id, file_name, size_bytes)")
      .eq("assignment_id", id),
  ]);
  const byStudent = new Map((submissions ?? []).map((s) => [s.student_id, s]));
  const pastDue = assignment.due_at ? assignment.due_at < new Date().toISOString() : false;
  const attachments = (assignment.homework_attachments ?? []) as Array<{ id: string; file_name: string; size_bytes: number; uploaded_by: string | null }>;

  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumb label={tt("breadcrumb")} items={[{ label: tt("title"), href: "/teach" }, { label: t("title"), href: "/teach/homework" }, { label: assignment.title }]} />}
        title={assignment.title}
        description={`${cs.className} · ${cs.subjectName}`}
        meta={<StatusBadge status={assignment.status} label={ts(assignment.status)} />}
      />
      {saved ? <Alert tone="success" className="mb-4">{t(`saved.${["publish", "archive", "restore"].includes(saved) ? saved : "draft"}`)}</Alert> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,26rem)_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader title={t("details")} />
            <CardBody>
              <AssignmentForm
                assignment={{
                  id: assignment.id,
                  classSubjectId: assignment.class_subject_id,
                  title: assignment.title,
                  instructions: assignment.instructions,
                  dueAt: isoToLocalInput(assignment.due_at, timeZone),
                  maxScore: assignment.max_score === null ? null : Number(assignment.max_score),
                  allowSubmissions: assignment.allow_submissions,
                  status: assignment.status,
                }}
                classSubjects={[]}
                uploadFolder={`${access.school!.id}/${access.userId}`}
              />
            </CardBody>
          </Card>
          {attachments.length > 0 ? (
            <Card>
              <CardHeader title={t("attachments")} />
              <CardBody>
                <ul className="space-y-2">
                  {attachments.map((file) => (
                    <li key={file.id} className="flex items-center justify-between gap-2">
                      <a href={`/files/homework/${file.id}`} className="inline-flex min-w-0 items-center gap-1.5 text-sm text-brand-text hover:underline">
                        <Paperclip className="size-4 shrink-0" aria-hidden />
                        <span className="truncate">{file.file_name}</span>
                        <span className="shrink-0 text-ink-muted">({formatBytes(file.size_bytes)})</span>
                      </a>
                      {file.uploaded_by === access.userId ? (
                        <ActionForm action={removeAssignmentAttachmentAction}>
                          <input type="hidden" name="attachmentId" value={file.id} />
                          <SubmitButton variant="ghost" size="icon-sm" aria-label={t("removeAttachment", { name: file.file_name })}>
                            <Trash2 aria-hidden />
                          </SubmitButton>
                        </ActionForm>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
        </div>

        <Card>
          <CardHeader
            title={t("submissions")}
            description={t("submissionsSummary", {
              submitted: (submissions ?? []).filter((s) => s.status !== "missing").length,
              total: roster.length,
            })}
          />
          <CardBody className="p-0">
            {assignment.status === "draft" ? <p className="px-5 py-4 text-sm text-ink-muted">{t("draftNoSubmissions")}</p> : null}
            <ul className="divide-y divide-line">
              {roster.map((student) => {
                const submission = byStudent.get(student.id);
                const files = (submission?.homework_attachments ?? []) as Array<{ id: string; file_name: string; size_bytes: number }>;
                const name = `${student.lastName} ${student.firstName}`;
                return (
                  <li key={student.id} className="px-4 py-4 sm:px-5">
                    <details open={submission?.status === "submitted" || submission?.status === "late"}>
                      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-ink">{name}</span>
                        <span className="flex items-center gap-2">
                          {submission?.score !== null && submission?.score !== undefined ? (
                            <span className="text-sm font-semibold tabular">{formatNumber(submission.score, locale)}{assignment.max_score ? ` / ${formatNumber(assignment.max_score, locale)}` : ""}</span>
                          ) : null}
                          <StatusBadge status={submission?.status ?? (pastDue ? "missing" : "pending")} label={submission ? ts(submission.status) : pastDue ? t("notSubmitted") : ts("pending")} />
                        </span>
                      </summary>
                      <div className="mt-3 space-y-3">
                        {submission?.submitted_at ? <p className="text-xs text-ink-muted">{t("submittedAt", { date: formatDateTime(submission.submitted_at, locale, timeZone) })}</p> : null}
                        {submission?.content ? <p className="whitespace-pre-wrap rounded-md bg-surface-muted px-3 py-2 text-sm">{submission.content}</p> : null}
                        {files.length > 0 ? (
                          <ul className="space-y-1">
                            {files.map((file) => (
                              <li key={file.id}>
                                <a href={`/files/homework/${file.id}`} className="inline-flex items-center gap-1.5 text-sm text-brand-text hover:underline">
                                  <Paperclip className="size-4" aria-hidden />
                                  {file.file_name} ({formatBytes(file.size_bytes)})
                                </a>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {assignment.status !== "draft" ? (
                          <ActionForm action={reviewSubmissionAction} className="grid gap-3 sm:grid-cols-[8rem_1fr]">
                            <input type="hidden" name="assignmentId" value={assignment.id} />
                            <input type="hidden" name="studentId" value={student.id} />
                            <input type="hidden" name="submissionId" value={submission?.id ?? ""} />
                            {submission && submission.status !== "missing" ? (
                              <>
                                <TextField name="score" id={`score-${student.id}`} inputMode="decimal" label={t("score")} defaultValue={submission.score ?? ""} />
                                <TextAreaField name="feedback" id={`feedback-${student.id}`} label={t("feedback")} defaultValue={submission.feedback ?? ""} rows={2} maxLength={5000} />
                                <div className="flex flex-wrap gap-2 sm:col-span-2">
                                  <SubmitButton name="decision" value="reviewed" size="sm">{t("markReviewed")}</SubmitButton>
                                  <SubmitButton name="decision" value="returned" size="sm" variant="secondary">{t("returnForChanges")}</SubmitButton>
                                </div>
                              </>
                            ) : !submission && pastDue ? (
                              <div className="sm:col-span-2">
                                <SubmitButton name="decision" value="missing" size="sm" variant="secondary">{t("markMissing")}</SubmitButton>
                              </div>
                            ) : null}
                          </ActionForm>
                        ) : null}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
