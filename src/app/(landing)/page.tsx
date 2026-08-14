import { createAnonClient } from "@/lib/supabase/anon";
import { getLocale, getTranslations } from "next-intl/server";
import { HeroSection } from "./sections/hero-section";
import { AboutSection } from "./sections/about-section";
import { DirectorsSection } from "./sections/directors-section";
import { EventsSection } from "./sections/events-section";
import { GallerySection } from "./sections/gallery-section";
import { ContactsSection } from "./sections/contacts-section";
import type { Locale } from "@/i18n/config";

function localized(row: Record<string, unknown>, field: string, locale: Locale): string {
  const localeField = `${field}_${locale}`;
  const value = row[localeField];
  if (value && typeof value === "string") return value;
  const tgValue = row[`${field}_tg`];
  return typeof tgValue === "string" ? tgValue : "";
}

const SCHOOL_ID = "00000000-0000-0000-0000-000000000001";

export default async function LandingPage() {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("landing");
  const supabase = createAnonClient();

  const [schoolRes, blocksRes, directorsRes] = await Promise.all([
    supabase
      .from("schools" as never)
      .select("*" as never)
      .eq("id" as never, SCHOOL_ID)
      .single(),
    supabase
      .from("content_blocks" as never)
      .select("*" as never)
      .eq("school_id" as never, SCHOOL_ID)
      .eq("is_visible" as never, true)
      .order("sort_order" as never, { ascending: true }),
    supabase
      .from("directors" as never)
      .select("*" as never)
      .eq("school_id" as never, SCHOOL_ID)
      .eq("is_visible" as never, true)
      .order("sort_order" as never, { ascending: true }),
  ]);

  const school = (schoolRes.data ?? {}) as Record<string, unknown>;
  const blocks = ((blocksRes.data ?? []) as Array<Record<string, unknown>>);
  const directors = ((directorsRes.data ?? []) as Array<Record<string, unknown>>);

  const getBlock = (section: string) => blocks.find((b) => b.section === section);
  const heroBlock = getBlock("hero");
  const aboutBlock = getBlock("about");
  const eventsBlock = getBlock("events");
  const galleryBlock = getBlock("gallery");
  const supportBlock = getBlock("support");

  const galleryImages: Array<{ url: string; alt?: string }> = [];
  if (galleryBlock?.metadata && typeof galleryBlock.metadata === "object") {
    const meta = galleryBlock.metadata as Record<string, unknown>;
    const imgs = meta.images;
    if (Array.isArray(imgs)) {
      for (const img of imgs) {
        if (typeof img === "object" && img && "url" in img) {
          galleryImages.push({ url: String((img as Record<string, unknown>).url), alt: String((img as Record<string, unknown>).alt ?? "") });
        }
      }
    }
  }

  return (
    <>
      {heroBlock && (
        <HeroSection
          title={localized(heroBlock, "title", locale)}
          description={localized(heroBlock, "body", locale)}
          imageUrl={heroBlock.image_url as string | null}
          ctaText={t("joinUs")}
        />
      )}
      {aboutBlock && (
        <AboutSection
          title={localized(aboutBlock, "title", locale)}
          body={localized(aboutBlock, "body", locale)}
        />
      )}
      {directors.length > 0 && (
        <DirectorsSection
          title={t("directorsTitle")}
          directors={directors.map((d) => ({
            fullName: localized(d, "full_name", locale),
            position: localized(d, "position", locale),
            photoUrl: d.photo_url as string | null,
            yearStart: Number(d.year_start),
            yearEnd: d.year_end ? Number(d.year_end) : null,
          }))}
        />
      )}
      {eventsBlock && (
        <EventsSection
          title={localized(eventsBlock, "title", locale)}
          body={localized(eventsBlock, "body", locale)}
        />
      )}
      {galleryImages.length > 0 && (
        <GallerySection title={t("galleryTitle")} images={galleryImages} />
      )}
      {supportBlock && (
        <ContactsSection
          title={localized(supportBlock, "title", locale)}
          body={localized(supportBlock, "body", locale)}
          school={{
            email: school.email as string | null,
            phone: school.phone as string | null,
            address: school.address as string | null,
          }}
        />
      )}
    </>
  );
}
