import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { BookOpenCheck } from "lucide-react";
import { getMyClassSubjects, getSchoolClassSubjects } from "@/features/teach/queries";
import { Breadcrumb, Card, EmptyState, PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import type { Locale } from "@/lib/i18n/text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("teach.gradebook");
  return { title: t("title") };
}

export default async function GradebookIndexPage() {
  const access = await requirePermission("grades.enter");
  const t = await getTranslations("teach.gradebook");
  const tt = await getTranslations("teach");
  const locale = (await getLocale()) as Locale;
  const classSubjects = await getMyClassSubjects(access.userId, locale);

  // A director or administrator checks journals they do not teach; the listing
  // is separate so nobody mistakes someone else's class for their own.
  const inspects = can(access, "grades.view");
  const mine = new Set(classSubjects.map((cs) => cs.id));
  const others = inspects ? (await getSchoolClassSubjects(locale)).filter((cs) => !mine.has(cs.id)) : [];

  return (
    <>
      <PageHeader breadcrumb={<Breadcrumb label={tt("breadcrumb")} items={[{ label: tt("title"), href: "/teach" }, { label: t("title") }]} />} title={t("title")} description={t("indexDescription")} />
      {classSubjects.length === 0 && others.length === 0 ? (
        <Card as="div"><EmptyState icon={<BookOpenCheck />} title={tt("noClasses")} description={tt("noClassesHint")} /></Card>
      ) : classSubjects.length === 0 ? null : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {classSubjects.map((cs) => (
            <li key={cs.id}>
              <Link href={`/teach/gradebook/${cs.id}`} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 font-medium shadow-xs hover:border-brand-300 hover:text-brand-text">
                <BookOpenCheck className="size-5 text-brand-text" aria-hidden />
                {cs.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">{t("allJournals")}</h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {others.map((cs) => (
              <li key={cs.id}>
                <Link href={`/teach/gradebook/${cs.id}`} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 text-sm shadow-xs hover:border-brand-300 hover:text-brand-text">
                  <BookOpenCheck className="size-5 shrink-0 text-ink-muted" aria-hidden />
                  {cs.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
