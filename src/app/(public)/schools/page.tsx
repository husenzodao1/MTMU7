import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { setAuthSchoolAction } from "@/app/actions/session";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

type PublicSchoolRow = {
  slug: string | null;
  short_name: string | null;
  full_name: string | null;
  address: string | null;
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("site.public");
  return {
    title: t("directoryTitle"),
    description: t("directoryDescription"),
    alternates: { canonical: "/schools" },
    openGraph: { title: t("directoryTitle"), description: t("directoryDescription"), type: "website" },
  };
}

export default async function SchoolsPage() {
  const t = await getTranslations("site.public");
  let schools: PublicSchoolRow[] = [];

  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("list_public_schools");
    schools = (data ?? []) as PublicSchoolRow[];
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:py-16">
      <div className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-text">{t("schoolSite")}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{t("directoryTitle")}</h1>
        <p className="mt-4 text-base leading-7 text-ink-secondary">{t("directoryDescription")}</p>
      </div>
      {schools.length ? (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {schools.map((school) => (
            <li key={school.slug ?? school.full_name} className="border border-line bg-surface p-5">
              <h2 className="text-lg font-semibold text-ink">{school.short_name ?? school.full_name ?? t("schoolSite")}</h2>
              {school.address ? <p className="mt-2 text-sm text-ink-secondary">{school.address}</p> : null}
              {school.slug ? (
                // Straight to this school's sign-in.
                <form action={setAuthSchoolAction} className="mt-4">
                  <input type="hidden" name="school" value={school.slug} />
                  <input type="hidden" name="next" value="/login" />
                  <button type="submit" className="text-xs font-semibold text-brand-text hover:underline">
                    {t("portalEntry")}
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-8 border border-dashed border-line bg-surface px-5 py-8 text-sm text-ink-secondary">{t("emptyDirectory")}</p>
      )}
    </section>
  );
}
