import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * Frame shared by the public school sections (news, events, documents): a way
 * back to the school, the section heading and the content column.
 */
export async function PublicSection({
  title,
  schoolSlug,
  schoolName,
  children,
}: {
  title: string;
  schoolSlug: string;
  schoolName: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
      <Link className="text-sm font-semibold text-brand-text hover:underline" href={`/s/${schoolSlug}`}>
        ← {schoolName}
      </Link>
      <h1 className="mt-4 border-b border-line pb-4 text-3xl font-semibold tracking-tight text-ink">{title}</h1>
      <div className="mt-8">{children}</div>
    </section>
  );
}

/** Shown when the slug in the address does not belong to a public school. */
export async function SchoolNotFound() {
  const t = await getTranslations("site.public");
  return (
    <section className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-semibold text-ink">{t("schoolNotFound")}</h1>
      <Link className="mt-6 inline-flex text-sm font-semibold text-brand-text hover:underline" href="/schools">
        {t("backToSchools")}
      </Link>
    </section>
  );
}

/** Uniform empty state for a section with nothing published yet. */
export async function NothingPublished() {
  const t = await getTranslations("site.public");
  return <p className="border border-dashed border-line bg-surface px-5 py-10 text-center text-sm text-ink-secondary">{t("noPublishedContent")}</p>;
}
