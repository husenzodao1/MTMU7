import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FileText } from "lucide-react";
import { NothingPublished, PublicSection, SchoolNotFound } from "@/features/site/public-shell";
import { publicSchoolTitle } from "@/features/site/metadata";
import { getPublicSchoolBySlug } from "@/lib/site/identity";
import { formatBytes } from "@/lib/storage/files";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ school: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [t, school] = await Promise.all([getTranslations("site.public"), publicSchoolTitle((await params).school)]);
  return { title: `${t("documents")} · ${school}` };
}

export default async function PublicDocumentsPage({ params }: Props) {
  const { school: slug } = await params;
  const [school, t, schoolName] = await Promise.all([
    getPublicSchoolBySlug(slug),
    getTranslations("site.public"),
    publicSchoolTitle(slug),
  ]);
  if (!school) return <SchoolNotFound />;

  const supabase = await createClient();
  const { data } = await supabase
    .from("documents")
    .select("id, title, description, file_name, mime_type, size_bytes")
    .eq("school_id", school.id)
    .eq("status", "published")
    .eq("access", "public")
    .order("title")
    .limit(100);

  return (
    <PublicSection title={t("documents")} schoolSlug={school.slug} schoolName={schoolName}>
      {data?.length ? (
        <ul className="divide-y divide-line border-y border-line">
          {data.map((document) => (
            <li key={document.id} className="flex flex-wrap items-start justify-between gap-4 py-4">
              <div className="flex min-w-0 gap-3">
                <FileText className="mt-0.5 size-5 shrink-0 text-ink-muted" aria-hidden />
                <div className="min-w-0">
                  <h2 className="font-semibold text-ink">{document.title}</h2>
                  {document.description ? <p className="mt-1 text-sm text-ink-secondary">{document.description}</p> : null}
                  <p className="mt-1 text-xs text-ink-muted">
                    {document.file_name}
                    {document.size_bytes ? ` · ${formatBytes(document.size_bytes)}` : ""}
                  </p>
                </div>
              </div>
              <Link className="shrink-0 text-sm font-semibold text-brand-text hover:underline" href={`/files/documents/${document.id}`} target="_blank">
                {t("download")}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <NothingPublished />
      )}
    </PublicSection>
  );
}
