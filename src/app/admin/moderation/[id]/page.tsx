import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { resolveReportAction } from "@/features/admin/management/actions";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { StatusBadge } from "@/components/ui/badge";
import { TextAreaField } from "@/components/ui/fields";
import { Alert, Card, CardBody, CardHeader, DescriptionList, PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { robots: { index: false } };

const person = z.object({ id: z.string(), first_name: z.string(), last_name: z.string(), public_id: z.string().optional() }).nullable();
const reportSchema = z.object({
  report: z.object({ id: z.string(), reason: z.string(), details: z.string().nullable(), status: z.string(), resolution_note: z.string().nullable(), created_at: z.string() }),
  message: z.object({ id: z.string(), content: z.string(), is_deleted: z.boolean(), created_at: z.string(), sender: person }),
  reporter: person,
  context: z.array(z.object({ id: z.string(), sender_id: z.string().nullable(), content: z.string(), created_at: z.string() })),
});

export default async function ModerationReportPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("messages.moderate");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const t = await getTranslations("admin.moderation");
  const tr = await getTranslations("portal.messages.reasons");
  const ts = await getTranslations("common.status");
  const locale = (await getLocale()) as Locale;
  const timeZone = access.school!.timezone;
  const supabase = await createClient();
  // Every access to a reported conversation is written to the audit log by the database.
  const { data, error } = await supabase.rpc("moderation_get_report", { p_report_id: id });
  const parsed = reportSchema.safeParse(data);
  if (error || !parsed.success) notFound();
  const { report, message, reporter, context } = parsed.data;
  const name = (p: z.infer<typeof person>) => (p ? `${p.last_name} ${p.first_name}` : t("unknown"));

  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title"), href: "/admin/moderation" }, { label: t("report") }]} />}
        title={t("reportTitle", { reason: tr(report.reason as "other") })}
        meta={<StatusBadge status={report.status} label={ts(report.status as "open")} />}
      />
      <Alert tone="info" className="mb-4">{t("privacyNotice")}</Alert>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader title={t("contextTitle")} description={t("contextHint")} />
          <CardBody>
            <ol className="space-y-2">
              {context.map((m) => (
                <li key={m.id} className={cn("rounded-md border px-3 py-2 text-sm", m.id === message.id ? "border-danger-600/50 bg-danger-50" : "border-line")}>
                  <p className="text-xs text-ink-muted">
                    {m.sender_id === message.sender?.id ? name(message.sender) : m.sender_id === reporter?.id ? name(reporter) : t("participant")} · {formatDateTime(m.created_at, locale, timeZone)}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{m.content || <em className="text-ink-muted">{t("deleted")}</em>}</p>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader title={t("details")} />
            <CardBody>
              <DescriptionList
                items={[
                  { term: t("author"), description: `${name(message.sender)}${message.sender?.public_id ? ` (${message.sender.public_id})` : ""}` },
                  { term: t("reporter"), description: name(reporter) },
                  { term: t("reported"), description: formatDateTime(report.created_at, locale, timeZone) },
                  { term: t("comment"), description: report.details || "—" },
                  ...(report.resolution_note ? [{ term: t("resolutionNote"), description: report.resolution_note }] : []),
                ]}
              />
            </CardBody>
          </Card>
          {report.status === "open" ? (
            <Card>
              <CardHeader title={t("decision")} />
              <CardBody>
                <ActionForm action={resolveReportAction} className="space-y-3">
                  <input type="hidden" name="id" value={report.id} />
                  <TextAreaField name="note" label={t("note")} rows={3} maxLength={1000} />
                  <div className="flex flex-col gap-2">
                    <SubmitButton name="decision" value="delete_message" variant="danger" disabled={message.is_deleted}>{t("removeMessage")}</SubmitButton>
                    <SubmitButton name="decision" value="dismiss" variant="secondary">{t("dismiss")}</SubmitButton>
                  </div>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
