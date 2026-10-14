import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Download, MessageCircle } from "lucide-react";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { getClassOptions } from "@/features/admin/queries";
import { buttonClasses } from "@/components/ui/button";
import { SelectField } from "@/components/ui/fields";
import { Alert, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.parents");
  return { title: t("title") };
}

/**
 * Where the school makes the slips the parents type into the bot.
 *
 * One class at a time, because that is how they are handed out — to a class
 * teacher, who gives one line to each family. The file that comes back is the
 * only copy of the codes; the page says so above the button rather than after
 * the download.
 */
export default async function ParentsPage() {
  const access = await requirePermission("students.update");
  const t = await getTranslations("admin.parents");
  const classes = await getClassOptions(access.school!.id);

  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />}
        title={t("title")}
        description={t("description")}
      />

      <Card className="max-w-3xl">
        <CardHeader title={t("howTitle")} description={t("howDescription")} />
        <CardBody className="space-y-4">
          <ol className="list-decimal space-y-2 ps-5 text-sm leading-6 text-ink-secondary">
            <li>{t("step1")}</li>
            <li>{t("step2")}</li>
            <li>{t("step3")}</li>
          </ol>
          <Alert tone="info" title={t("botTitle")}>
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle className="size-4" aria-hidden />
              {t("botHint")}
            </span>
          </Alert>
        </CardBody>
      </Card>

      <Card className="mt-5 max-w-3xl">
        <CardHeader title={t("issueTitle")} description={t("issueDescription")} />
        <CardBody>
          {classes.length === 0 ? (
            <EmptyState title={t("noClasses")} description={t("noClassesHint")} />
          ) : (
            <form action="/admin/parents/codes" method="post" className="space-y-4">
              <SelectField
                name="classId"
                label={t("class")}
                options={classes.map(({ value, label }) => ({ value, label }))}
                required
              />
              <Alert tone="warning" title={t("reissueTitle")}>
                {t("reissueBody")}
              </Alert>
              <button type="submit" className={buttonClasses("primary")}>
                <Download aria-hidden />
                {t("download")}
              </button>
            </form>
          )}
        </CardBody>
      </Card>
    </>
  );
}
