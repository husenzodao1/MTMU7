import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { UserCheck } from "lucide-react";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { getClassOptions, getSchoolRoles } from "@/features/admin/queries";
import { reviewRegistrationAction } from "@/features/admin/users/actions";
import { ActionForm, FormDialog, SubmitButton } from "@/components/ui/action-form";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField } from "@/components/ui/fields";
import { TabNav } from "@/components/ui/misc";
import { Pagination } from "@/components/ui/pagination";
import { Card, CardBody, EmptyState, PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/i18n/format";
import { pickName, type Locale } from "@/lib/i18n/text";
import { firstValue, parseListParams, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("approvals") };
}

const DETAIL_KEYS = ["phone", "date_of_birth", "gender", "position", "child_name", "child_class", "relationship", "comment"] as const;

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("users.approve");
  const t = await getTranslations("admin.approvals");
  const ts = await getTranslations("common.status");
  const locale = (await getLocale()) as Locale;
  const timeZone = access.school!.timezone;
  const params = await searchParams;
  const view = firstValue(params.view) === "reviewed" ? "reviewed" : "pending";
  const list = parseListParams(params, { sorts: ["recent"], defaultSort: "recent", pageSize: 20 });
  const schoolId = access.school!.id;

  const supabase = await createClient();
  let query = supabase
    .from("registration_requests")
    .select("id, email, first_name, last_name, middle_name, requested_role_id, requested_class_id, additional_data, status, rejection_reason, created_at, reviewed_at, invitation_code_id, classes(name)", { count: "exact" })
    .eq("school_id", schoolId)
    .range(list.offset, list.offset + list.pageSize - 1);
  query = view === "pending" ? query.eq("status", "pending").order("created_at") : query.neq("status", "pending").order("reviewed_at", { ascending: false });
  const [{ data, count }, roles, classes] = await Promise.all([query, getSchoolRoles(schoolId), getClassOptions(schoolId)]);
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const roleOptions = roles.filter((r) => r.is_active && r.level > 1).map((r) => ({ value: r.id, label: pickName(r, locale) }));
  const classOptions = classes.map(({ value, label }) => ({ value, label }));

  return (
    <>
      <PageHeader breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />} title={t("title")} description={t("description")} />
      <TabNav
        label={t("views")}
        items={[
          { href: "/admin/approvals", label: t("pending"), active: view === "pending", count: view === "pending" ? count ?? 0 : undefined },
          { href: "/admin/approvals?view=reviewed", label: t("reviewed"), active: view === "reviewed" },
        ]}
      />
      {!data || data.length === 0 ? (
        <Card as="div"><EmptyState icon={<UserCheck />} title={view === "pending" ? t("emptyPending") : t("emptyReviewed")} /></Card>
      ) : (
        <ul className="space-y-4">
          {data.map((request) => {
            const role = roleById.get(request.requested_role_id);
            const details = (request.additional_data && typeof request.additional_data === "object" ? request.additional_data : {}) as Record<string, unknown>;
            const name = [request.last_name, request.first_name, request.middle_name].filter(Boolean).join(" ");
            const className = (request.classes as { name: string } | null)?.name;
            return (
              <li key={request.id}>
                <Card as="article">
                  <CardBody className="grid gap-4 lg:grid-cols-[1fr_auto]">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold">{name}</h2>
                        {role ? <Badge tone="brand">{pickName(role, locale)}</Badge> : null}
                        {request.invitation_code_id ? <Badge tone="success">{t("viaInvitation")}</Badge> : null}
                        {view === "reviewed" ? <StatusBadge status={request.status} label={ts(request.status as "approved")} /> : null}
                      </div>
                      <p className="text-sm text-ink-secondary">{request.email}</p>
                      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                        <div><dt className="inline text-ink-muted">{t("submitted")}: </dt><dd className="inline tabular">{formatDateTime(request.created_at, locale, timeZone)}</dd></div>
                        {className ? <div><dt className="inline text-ink-muted">{t("class")}: </dt><dd className="inline">{className}</dd></div> : null}
                        {DETAIL_KEYS.filter((key) => typeof details[key] === "string" && details[key]).map((key) => (
                          <div key={key}><dt className="inline text-ink-muted">{t(`details.${key}`)}: </dt><dd className="inline">{String(details[key]).slice(0, 200)}</dd></div>
                        ))}
                      </dl>
                      {request.rejection_reason ? <p className="text-sm text-danger-700">{t("rejectionReason", { reason: request.rejection_reason })}</p> : null}
                    </div>
                    {view === "pending" ? (
                      <div className="flex flex-col gap-2 lg:w-72">
                        <ActionForm action={reviewRegistrationAction} className="space-y-2">
                          <input type="hidden" name="requestId" value={request.id} />
                          <input type="hidden" name="decision" value="approve" />
                          <SelectField name="roleId" id={`role-${request.id}`} label={t("role")} defaultValue={request.requested_role_id} options={roleOptions} />
                          {role?.slug === "student" ? (
                            <SelectField name="classId" id={`class-${request.id}`} label={t("class")} defaultValue={request.requested_class_id ?? ""} placeholder={t("noClass")} options={classOptions} />
                          ) : null}
                          <SubmitButton className="w-full">{t("approve")}</SubmitButton>
                        </ActionForm>
                        <FormDialog
                          action={reviewRegistrationAction}
                          trigger={<Button variant="danger-outline" className="w-full">{t("reject")}</Button>}
                          title={t("rejectTitle")}
                          description={t("rejectDescription", { name })}
                          submitLabel={t("reject")}
                          tone="danger"
                        >
                          <input type="hidden" name="requestId" value={request.id} />
                          <input type="hidden" name="decision" value="reject" />
                          <TextAreaField name="reason" label={t("reason")} hint={t("reasonHint")} required rows={3} maxLength={500} />
                        </FormDialog>
                      </div>
                    ) : null}
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination pathname="/admin/approvals" searchParams={params} page={list.page} pageSize={list.pageSize} total={count ?? 0} />
    </>
  );
}
