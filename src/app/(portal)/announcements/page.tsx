import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Megaphone, Paperclip } from "lucide-react";
import { getVisibleAnnouncements } from "@/features/content/queries";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/ui/misc";
import { Card, CardBody, EmptyState, PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requireModule } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import { cn } from "@/lib/utils/cn";
import { redirect } from "next/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("announcements") };
}

export default async function AnnouncementsPage() {
  const access = await requireModule("announcements");
  if (!can(access, "announcements.view")) redirect("/access-denied");
  const t = await getTranslations("portal.announcements");
  const locale = (await getLocale()) as Locale;
  const items = await getVisibleAnnouncements(access.school!.id, 50);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      {items.length === 0 ? (
        <Card as="div"><EmptyState icon={<Megaphone />} title={t("empty")} /></Card>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => (
            <li key={item.id} id={`a-${item.id}`} className="scroll-mt-24">
              <Card as="article" className={cn(item.priority === "critical" && "border-danger-600/50", item.priority === "important" && "border-warning-600/40")}>
                <CardBody className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {item.priority !== "normal" ? (
                      <Badge tone={item.priority === "critical" ? "danger" : "warning"}>{t(`priority.${item.priority}`)}</Badge>
                    ) : null}
                    <h2 className="text-lg font-semibold">{item.title}</h2>
                  </div>
                  <p className="text-sm text-ink-muted tabular">
                    {formatDateTime(item.publishAt, locale)}
                    {item.expiresAt ? ` · ${t("until", { date: formatDateTime(item.expiresAt, locale) })}` : ""}
                  </p>
                  <Markdown source={item.body} />
                  {item.attachmentPath && item.attachmentName ? (
                    <a href={`/files/announcements/${item.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline" target="_blank" rel="noopener">
                      <Paperclip className="size-4" aria-hidden />
                      {item.attachmentName}
                    </a>
                  ) : null}
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
