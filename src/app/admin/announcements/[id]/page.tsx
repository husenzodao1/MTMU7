import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { deleteAnnouncementDraftAction } from "@/features/admin/content/announcement-actions";
import { AnnouncementForm } from "@/features/admin/content/announcement-form";
import { getAudienceOptions } from "@/features/admin/content/announcement-options";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { ConfirmAction } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import type { Locale } from "@/lib/i18n/text";
import { isoToLocalInput } from "@/lib/i18n/zoned";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { robots: { index: false } };

export default async function EditAnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("announcements.publish", "announcements.create");
  const canPublish = can(access, "announcements.publish");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const t = await getTranslations("admin.announcements");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  const { data: a } = await supabase
    .from("announcements")
    .select("id, school_id, title, body, priority, audience_type, audience_roles, audience_class_ids, publish_at, expires_at, status, attachment_name, published_at, created_by")
    .eq("id", id)
    .maybeSingle();
  if (!a || a.school_id !== access.school!.id) notFound();
  // Without the publishing right only your own drafts are editable.
  if (!canPublish && (a.created_by !== access.userId || a.status !== "draft")) notFound();
  const options = await getAudienceOptions(access.school!.id, locale);
  const timeZone = access.school!.timezone;

  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title"), href: "/admin/announcements" }, { label: a.title }]} />}
        title={t("edit")}
        actions={a.status === "draft" && !a.published_at ? (
          <ConfirmAction action={deleteAnnouncementDraftAction} fields={{ id: a.id }} title={t("deleteTitle")} description={t("deleteDescription")} confirmLabel={tc("delete")} trigger={<Button variant="danger-outline">{tc("delete")}</Button>} />
        ) : null}
      />
      <AnnouncementForm
        announcement={{
          id: a.id,
          title: a.title,
          body: a.body,
          priority: a.priority,
          audienceType: a.audience_type,
          audienceRoles: a.audience_roles,
          audienceClassIds: a.audience_class_ids,
          publishAt: isoToLocalInput(a.publish_at, timeZone),
          expiresAt: isoToLocalInput(a.expires_at, timeZone),
          status: a.status,
          attachmentName: a.attachment_name,
        }}
        schoolId={access.school!.id}
        roles={options.roles}
        classes={options.classes}
        canPublish={canPublish}
      />
    </>
  );
}
