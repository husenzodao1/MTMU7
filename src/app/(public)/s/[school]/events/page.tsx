import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarDays, MapPin } from "lucide-react";
import { NothingPublished, PublicSection, SchoolNotFound } from "@/features/site/public-shell";
import { publicSchoolTitle } from "@/features/site/metadata";
import { getPublicSchoolBySlug } from "@/lib/site/identity";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";

type Props = { params: Promise<{ school: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [t, school] = await Promise.all([getTranslations("site.public"), publicSchoolTitle((await params).school)]);
  return { title: `${t("events")} · ${school}` };
}

export default async function PublicEventsPage({ params }: Props) {
  const { school: slug } = await params;
  const [school, localeValue, t, schoolName] = await Promise.all([
    getPublicSchoolBySlug(slug),
    getLocale(),
    getTranslations("site.public"),
    publicSchoolTitle(slug),
  ]);
  if (!school) return <SchoolNotFound />;
  const locale = localeValue as Locale;

  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("id, title, description, starts_at, ends_at, all_day, location")
    .eq("school_id", school.id)
    .eq("status", "published")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at")
    .limit(50);

  return (
    <PublicSection title={t("events")} schoolSlug={school.slug} schoolName={schoolName}>
      {data?.length ? (
        <ul className="space-y-4">
          {data.map((event) => (
            <li key={event.id} className="border border-line bg-surface p-5 sm:p-6">
              <h2 className="text-xl font-semibold text-ink">{event.title}</h2>
              <p className="mt-2 flex items-center gap-2 text-sm text-ink-muted">
                <CalendarDays className="size-4 shrink-0" aria-hidden />
                <time dateTime={event.starts_at}>{formatDateTime(event.starts_at, locale)}</time>
                {event.ends_at ? <span>– {formatDateTime(event.ends_at, locale)}</span> : null}
              </p>
              {event.location ? (
                <p className="mt-1 flex items-center gap-2 text-sm text-ink-secondary">
                  <MapPin className="size-4 shrink-0" aria-hidden />
                  {event.location}
                </p>
              ) : null}
              {event.description ? <p className="mt-3 leading-7 text-ink-secondary">{event.description}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <NothingPublished />
      )}
    </PublicSection>
  );
}
