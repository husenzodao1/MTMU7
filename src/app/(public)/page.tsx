import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { DownloadApp } from "@/components/site/download-app";
import { OfficialStrip } from "@/components/site/official-header";
import { getDownloadMenu } from "@/components/site/download-labels";
import { FeatureTimeline, type FeatureKey } from "@/features/site/feature-timeline";
import { getPublicSchoolBySlug, resolveHomeSchoolSlug } from "@/lib/site/identity";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("site.home");
  const title = t("titlePlain");
  return { title, alternates: { canonical: "/" }, openGraph: { title, type: "website" } };
}

const FEATURES: FeatureKey[] = ["school", "parents", "chat", "support", "trust"];

/**
 * The front door, in two boxes on a quiet ground.
 *
 * The first says what this is — the school portal of Istaravshan — and holds
 * the only two things to do here: start, or take the app. The second is what
 * the system does, as a thread of five marks, each opening to its whole text.
 * Under it, outside any box, the makers' name and their line.
 */
export default async function HomePage() {
  const t = await getTranslations("site.home");
  const site = await getTranslations("site.public");
  const slug = await resolveHomeSchoolSlug();
  const school = slug ? await getPublicSchoolBySlug(slug) : null;
  const download = await getDownloadMenu();

  // Straight to this school's sign-in, or to the list when the platform
  // carries several — which is the same first question either way.
  const startHref = school ? "/login" : "/schools";

  return (
    <>
      <OfficialStrip />
      <div className="home-ground">
        <div aria-hidden className="home-aurora">
          <span />
          <span />
          <span />
        </div>

        <section className="mx-auto max-w-3xl px-4 pb-10 pt-12 sm:pt-16">
          <div className="home-box home-enter px-5 py-9 text-center sm:px-10 sm:py-11">
            <p className="home-kicker">{site("schoolSite")}</p>
            <h1 className="home-title">
              {t.rich("title", { city: (chunks) => <span className="home-city">{chunks}</span> })}
            </h1>
            <p className="home-lead">{t("lead")}</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <Link href={startHref} className="home-button">
                {t("start")}
                <ArrowRight aria-hidden />
              </Link>
              {download.offer ? (
                <DownloadApp labels={download.labels} recommended={download.recommended} variant="hero" text={t("download")} />
              ) : null}
            </div>
          </div>
        </section>

        <section aria-labelledby="features" className="mx-auto max-w-3xl px-4 pb-8">
          <h2 id="features" className="home-heading">
            {t("featuresTitle")}
          </h2>
          <div className="home-box home-enter-late px-4 py-6 sm:px-8 sm:py-8">
            <FeatureTimeline
              items={FEATURES.map((key) => ({ key, title: t(`features.${key}.title`), body: t(`features.${key}.body`) }))}
            />
          </div>
        </section>

        <div className="home-signature">
          <p className="home-brand">TOJVIBE</p>
          <p className="home-motto">{t("motto")}</p>
        </div>
      </div>
    </>
  );
}
