import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ExternalLink } from "lucide-react";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { getClassOptions } from "@/features/admin/queries";
import { setUserStatusAction } from "@/features/admin/users/actions";
import { allowedKinds } from "@/features/accounts/access";
import { AccountForm } from "@/features/accounts/account-form";
import { AccountSecurity } from "@/features/accounts/account-security";
import { gradeLimits, loadDetails } from "@/features/accounts/queries";
import { kindFromDetails } from "@/features/accounts/types";
import { FormDialog } from "@/components/ui/action-form";
import { StatusBadge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/fields";
import { Avatar } from "@/components/ui/misc";
import { Alert, Card, CardBody, CardHeader, DescriptionList, PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";

export const metadata: Metadata = { robots: { index: false } };

/**
 * One account, opened from the list: who they are and how they sign in at
 * the top, everything that can be changed below, in the same form that made
 * the account.
 */
export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("users.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const details = await loadDetails(id);
  if (!details) notFound();

  const t = await getTranslations("accounts");
  const tu = await getTranslations("admin.users");
  const tCard = await getTranslations("portal.messages.card");
  const ts = await getTranslations("common.status");
  const locale = (await getLocale()) as Locale;
  const timeZone = access.school!.timezone;
  const [classes, limits] = await Promise.all([getClassOptions(access.school!.id), gradeLimits(access.school!.id)]);

  const name = [details.last_name, details.first_name, details.middle_name].filter(Boolean).join(" ");
  const kind = kindFromDetails(details);
  const kinds = allowedKinds(access, "school");
  const canChangeStatus = can(access, "users.deactivate") && details.can_edit && !details.is_self && ["active", "blocked"].includes(details.status);

  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title"), href: "/admin/accounts" }, { label: name }]} />}
        title={name}
        description={`${details.public_id} · ${t(`kinds.${kind}`)}${details.student?.class_name ? ` · ${details.student.class_name}` : ""}`}
        meta={<StatusBadge status={details.status} label={ts(details.status as "active")} />}
        actions={
          <>
            {details.student ? (
              <Link href={`/admin/students/${details.student.id}`} className={buttonClasses("ghost")}>
                <ExternalLink aria-hidden />
                {t("academicRecord")}
              </Link>
            ) : null}
            <Link href={`/admin/users/${details.id}`} className={buttonClasses("ghost")}>
              {t("moreRoles")}
            </Link>
            {canChangeStatus ? (
              details.status === "active" ? (
                <FormDialog action={setUserStatusAction} trigger={<Button variant="danger-outline">{tu("block")}</Button>} title={tu("blockTitle")} description={tu("blockDescription")} submitLabel={tu("block")} tone="danger">
                  <input type="hidden" name="userId" value={details.id} />
                  <input type="hidden" name="status" value="blocked" />
                  <TextAreaField name="reason" label={tu("reason")} required rows={3} maxLength={500} />
                </FormDialog>
              ) : (
                <FormDialog action={setUserStatusAction} trigger={<Button variant="secondary">{tu("unblock")}</Button>} title={tu("unblockTitle")} submitLabel={tu("unblock")}>
                  <input type="hidden" name="userId" value={details.id} />
                  <input type="hidden" name="status" value="active" />
                  <TextAreaField name="reason" label={tu("reason")} rows={3} maxLength={500} />
                </FormDialog>
              )
            ) : null}
          </>
        }
      />

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardBody className="flex items-center gap-4">
            <Avatar name={`${details.first_name} ${details.last_name}`} src={details.avatar_url} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-ink">{name}</p>
              <p className="truncate text-sm text-ink-muted">
                <span className="font-mono tracking-wide">{details.public_id}</span>
                {details.nickname ? ` · @${details.nickname}` : ""}
              </p>
            </div>
          </CardBody>
          <CardBody className="border-t border-line">
            <DescriptionList
              items={[
                { term: t("lastLogin"), description: details.last_login_at ? formatDateTime(details.last_login_at, locale, timeZone) : t("never") },
                { term: t("credentialsIssued"), description: details.credentials_issued_at ? formatDateTime(details.credentials_issued_at, locale, timeZone) : "—" },
                ...(details.staff?.subjects.length ? [{ term: tCard("subjects"), description: details.staff.subjects.join(" · ") }] : []),
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("sections.security")} />
          <CardBody>
            <AccountSecurity
              userId={details.id}
              name={name}
              mfa={details.mfa}
              canResetPassword={details.can_edit && !details.is_self}
              canResetTwoFactor={details.can_edit && !details.is_self && can(access, "users.update")}
              offerTelegram={Boolean(details.student?.parent_managed)}
            />
          </CardBody>
        </Card>
      </div>

      {details.can_edit ? (
        <AccountForm
          details={details}
          basePath="/admin/accounts"
          allowedKinds={kinds.length > 0 ? kinds : [kind]}
          classes={classes}
          parentRequiredMaxGrade={limits.required}
          parentManagedMaxGrade={limits.managed}
        />
      ) : (
        <Alert tone="info">{tu("ownRolesHint")}</Alert>
      )}
    </>
  );
}
