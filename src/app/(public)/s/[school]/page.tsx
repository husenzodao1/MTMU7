import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Markdown } from "@/components/ui/misc";
import { EventHighlights, NewsHighlights } from "@/features/site/highlights";
import { getPublicEvents, getPublicNews } from "@/features/site/public-content";
import { getPlatformIdentity, getPublicSchoolBySlug } from "@/lib/site/identity";
import { publicSchoolTitle } from "@/features/site/metadata";
import { createClient } from "@/lib/supabase/server";
import { pickText, type Locale } from "@/lib/i18n/text";
import { SECTION_DEFINITIONS, readSectionContent, type SectionKey } from "@/features/site/sections";

type SchoolPageProps = { params: Promise<{ school: string }> };

export async function generateMetadata({ params }: SchoolPageProps): Promise<Metadata> {
  const { school: slug } = await params;
  const [title, t] = await Promise.all([publicSchoolTitle(slug), getTranslations("site.public")]);
  const description = t("directoryDescription");
  return { title, description, openGraph: { title, description, type: "website" } };
}

export default async function SchoolPage({ params }: SchoolPageProps) {
  const { school: slug } = await params;
  const [school, localeValue, t, identity] = await Promise.all([
    getPublicSchoolBySlug(slug),
    getLocale(),
    getTranslations("site.public"),
    getPlatformIdentity(),
  ]);
  const locale = localeValue as Locale;
  const attribution = pickText(identity.footerAttribution, locale);

  if (!school) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-3xl font-semibold text-ink">{t("schoolNotFound")}</h1>
        <Link className="mt-6 inline-flex text-sm font-semibold text-brand-text hover:underline" href="/schools">
          {t("backToSchools")}
        </Link>
      </section>
    );
  }

  const [news, events] = await Promise.all([getPublicNews(school.id, 4), getPublicEvents(school.id, 3)]);
  const supabase = await createClient();
  const { data: sectionRows } = await supabase
    .from("site_sections")
    .select("section_key, is_enabled, is_approved, sort_order, content")
    .eq("school_id", school.id)
    .eq("is_enabled", true)
    .order("sort_order");
  const sections = new Map(
    (sectionRows ?? []).map((row) => [row.section_key as SectionKey, { ...row, content: readSectionContent(row.content) }])
  );
  const section = (key: SectionKey) => sections.get(key);
  const localized = (key: SectionKey, field: string) => {
    const row = section(key);
    if (!row || (SECTION_DEFINITIONS[key].requiresApproval && !row.is_approved)) return "";
    return row.content[locale]?.[field] ?? row.content.tg?.[field] ?? row.content.ru?.[field] ?? row.content.en?.[field] ?? "";
  };
  const heroTitle = localized("hero", "title");
  const heroBody = localized("hero", "body");
  const introTitle = localized("intro", "title");
  const introBody = localized("intro", "body");
  const approvedIdentity = school.officialName && section("identity")?.is_approved;
  const schoolName = approvedIdentity ? pickText(school.officialName, locale) : "";
  const photoUrl = approvedIdentity ? school.photoUrl : null;

  return (
    <div>
      <section className="border-b border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:py-16 lg:grid-cols-[1fr_0.8fr] lg:items-center">
          <div className="border-l-4 border-brand-600 pl-5 sm:pl-7">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-text">{t("schoolSite")}</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-5xl">{schoolName || t("ownerTextPending")}</h1>
            {heroTitle ? <p className="mt-5 text-xl font-medium text-ink">{heroTitle}</p> : null}
            <div className="mt-4 max-w-2xl text-base leading-7 text-ink-secondary">
              {heroBody ? <Markdown source={heroBody} /> : <p>{t("schoolDescription")}</p>}
            </div>
            {!schoolName ? <p className="mt-4 text-sm text-ink-secondary">{t("officialPending")}</p> : null}
          </div>
          <div className="flex min-h-64 items-center justify-center border border-line bg-canvas text-center text-sm text-ink-secondary">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- owner-supplied school image URL
              <img src={photoUrl} alt={school.fullName} className="h-full max-h-80 w-full object-cover" />
            ) : (
              t("ownerImagePending")
            )}
          </div>
        </div>
      </section>

      {introTitle || introBody ? (
        <section className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
          {introTitle ? <h2 className="text-2xl font-semibold text-ink">{introTitle}</h2> : null}
          {introBody ? <div className="mt-4 leading-7 text-ink-secondary"><Markdown source={introBody} /></div> : null}
        </section>
      ) : null}

      <NewsHighlights articles={news} schoolSlug={school.slug} />
      <EventHighlights events={events} schoolSlug={school.slug} />

      <section className="border-t border-line bg-canvas">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{t("sections")}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Link className="border border-line bg-surface p-5 font-semibold text-ink hover:border-brand-600 hover:text-brand-text" href={`/s/${school.slug}/news`}>
              {t("news")}
            </Link>
            <Link className="border border-line bg-surface p-5 font-semibold text-ink hover:border-brand-600 hover:text-brand-text" href={`/s/${school.slug}/events`}>
              {t("events")}
            </Link>
            <Link className="border border-line bg-surface p-5 font-semibold text-ink hover:border-brand-600 hover:text-brand-text" href={`/s/${school.slug}/documents`}>
              {t("documents")}
            </Link>
          </div>
          {school.address || school.phone || school.email ? (
            <address className="mt-8 grid gap-1 border-t border-line pt-6 text-sm not-italic text-ink-secondary sm:grid-cols-3">
              {school.address ? <span>{school.address}</span> : null}
              {school.phone ? <a className="hover:text-brand-text hover:underline" href={`tel:${school.phone}`}>{school.phone}</a> : null}
              {school.email ? <a className="hover:text-brand-text hover:underline" href={`mailto:${school.email}`}>{school.email}</a> : null}
            </address>
          ) : null}

          {/* Who built the portal belongs here, on the page about the school and
              its people, rather than under every screen a child opens. */}
          {attribution ? (
            <p className="mt-6 border-t border-line pt-6 text-sm text-ink-muted">
              {t("developedBy")} <span className="text-ink-secondary">{attribution}</span>
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
