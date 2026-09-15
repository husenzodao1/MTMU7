import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { getSchoolRoles } from "@/features/admin/queries";
import { setUserRolesAction, setUserStatusAction } from "@/features/admin/users/actions";
import { ActionForm, FormDialog, SubmitButton } from "@/components/ui/action-form";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/fields";
import { Checkbox } from "@/components/ui/form-controls";
import { Avatar } from "@/components/ui/misc";
import { Alert, Card, CardBody, CardHeader, DescriptionList, PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import { formatDate, formatDateTime } from "@/lib/i18n/format";
import { pickName, type Locale } from "@/lib/i18n/text";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { robots: { index: false } };

const ns = z.string().nullable();
const userSchema = z.object({
  id: z.string(),
  public_id: z.string(),
  school_id: z.string(),
  email: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  middle_name: ns,
  phone: ns,
  date_of_birth: ns,
  avatar_url: ns,
  status: z.string(),
  is_active: z.boolean(),
  created_at: z.string(),
  last_login_at: ns,
  roles: z.array(z.object({ id: z.string(), slug: z.string(), name_tg: z.string(), name_ru: ns, name_en: ns, level: z.number() })),
  history: z.array(
    z.object({
      action: z.string(),
      old_value: ns,
      new_value: ns,
      notes: ns,
      created_at: z.string(),
      performed_by: z.object({ id: z.string(), first_name: z.string(), last_name: z.string() }).nullable(),
    })
  ),
});

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("users.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const t = await getTranslations("admin.users");
  const tp = await getTranslations("admin.people");
  const ts = await getTranslations("common.status");
  const locale = (await getLocale()) as Locale;
  const timeZone = access.school!.timezone;
  const supabase = await createClient();

  const { data } = await supabase.rpc("admin_get_user", { p_user_id: id });
  const parsed = userSchema.safeParse(data);
  if (!parsed.success || parsed.data.school_id !== access.school!.id) notFound();
  const user = parsed.data;

  const [roles, { data: student }, { data: staff }, { data: guardian }] = await Promise.all([
    getSchoolRoles(access.school!.id),
    supabase.from("students").select("id").eq("user_id", id).maybeSingle(),
    supabase.from("staff").select("id").eq("user_id", id).maybeSingle(),
    supabase.from("guardians").select("id").eq("user_id", id).maybeSingle(),
  ]);
  const self = id === access.userId;
  const held = new Set(user.roles.map((r) => r.id));
  const name = [user.last_name, user.first_name, user.middle_name].filter(Boolean).join(" ");
  const canChangeStatus = can(access, "users.deactivate") && !self && ["active", "blocked"].includes(user.status);

  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title"), href: "/admin/users" }, { label: name }]} />}
        title={name}
        description={`${user.email} · ${user.public_id}`}
        meta={<StatusBadge status={user.status} label={ts(user.status as "active")} />}
        actions={
          canChangeStatus ? (
            user.status === "active" ? (
              <FormDialog action={setUserStatusAction} trigger={<Button variant="danger-outline">{t("block")}</Button>} title={t("blockTitle")} description={t("blockDescription")} submitLabel={t("block")} tone="danger">
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="status" value="blocked" />
                <TextAreaField name="reason" label={t("reason")} required rows={3} maxLength={500} />
              </FormDialog>
            ) : (
              <FormDialog action={setUserStatusAction} trigger={<Button variant="secondary">{t("unblock")}</Button>} title={t("unblockTitle")} submitLabel={t("unblock")}>
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="status" value="active" />
                <TextAreaField name="reason" label={t("reason")} rows={3} maxLength={500} />
              </FormDialog>
            )
          ) : null
        }
      />
      {user.status === "pending" ? <Alert tone="info" className="mb-4">{t("pendingHint")} <Link href="/admin/approvals" className="font-medium underline">{t("openApprovals")}</Link></Alert> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,24rem)_1fr]">
        <Card>
          <CardBody className="flex items-center gap-4">
            <Avatar name={`${user.first_name} ${user.last_name}`} src={user.avatar_url} size="lg" />
            <div className="min-w-0">
              <p className="font-semibold">{name}</p>
              <p className="truncate text-sm text-ink-muted">{user.email}</p>
            </div>
          </CardBody>
          <CardBody className="border-t border-line">
            <DescriptionList
              items={[
                { term: tp("phone"), description: user.phone ?? "—" },
                { term: tp("dateOfBirth"), description: user.date_of_birth ? formatDate(user.date_of_birth, locale) : "—" },
                { term: t("created"), description: formatDateTime(user.created_at, locale, timeZone) },
                { term: t("lastLogin"), description: user.last_login_at ? formatDateTime(user.last_login_at, locale, timeZone) : "—" },
                {
                  term: t("records"),
                  description: (
                    <span className="flex flex-wrap gap-2">
                      {student ? <Link className="text-brand-700 hover:underline" href={`/admin/students/${student.id}`}>{t("studentRecord")}</Link> : null}
                      {staff ? <Link className="text-brand-700 hover:underline" href={`/admin/staff/${staff.id}`}>{t("staffRecord")}</Link> : null}
                      {guardian ? <Link className="text-brand-700 hover:underline" href="/admin/guardians">{t("guardianRecord")}</Link> : null}
                      {!student && !staff && !guardian ? "—" : null}
                    </span>
                  ),
                },
              ]}
            />
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title={t("roles")} description={self ? t("ownRolesHint") : t("rolesHint")} />
            <CardBody>
              <ActionForm action={setUserRolesAction} className="space-y-3">
                <input type="hidden" name="userId" value={user.id} />
                <fieldset disabled={self || !can(access, "users.assign_roles")} className="grid gap-x-6 sm:grid-cols-2">
                  <legend className="sr-only">{t("roles")}</legend>
                  {roles.filter((r) => r.is_active || held.has(r.id)).map((role) => (
                    <Checkbox key={role.id} name="roleId" value={role.id} defaultChecked={held.has(role.id)} label={pickName(role, locale)} description={role.slug} />
                  ))}
                </fieldset>
                {!self && can(access, "users.assign_roles") ? <SubmitButton variant="secondary">{t("saveRoles")}</SubmitButton> : null}
              </ActionForm>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("history")} />
            <CardBody>
              {user.history.length === 0 ? (
                <p className="text-sm text-ink-muted">{t("noHistory")}</p>
              ) : (
                <ol className="space-y-3">
                  {user.history.map((h, index) => (
                    <li key={index} className="border-s-2 border-line ps-3 text-sm">
                      <p className="font-medium">{t.has(`historyActions.${h.action}`) ? t(`historyActions.${h.action}`) : h.action}{h.new_value ? ` → ${h.new_value}` : ""}</p>
                      <p className="text-ink-muted">
                        {formatDateTime(h.created_at, locale, timeZone)}
                        {h.performed_by ? ` · ${h.performed_by.first_name} ${h.performed_by.last_name}` : ""}
                      </p>
                      {h.notes ? <p className="mt-0.5 text-ink-secondary">{h.notes}</p> : null}
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
