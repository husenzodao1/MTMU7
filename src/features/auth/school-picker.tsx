import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { setAuthSchoolAction, clearAuthSchoolAction } from "@/app/actions/session";
import { Card, CardBody } from "@/components/ui/surface";
import { safeImageUrl } from "@/lib/site/auth-school";
import { createClient } from "@/lib/supabase/server";

export interface AuthSchool {
  slug: string;
  name: string;
  photoUrl: string | null;
  logoUrl: string | null;
}

/** Active schools, for the sign-in and registration chooser. */
export async function listAuthSchools(): Promise<AuthSchool[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_public_schools");
  return (data ?? [])
    .filter((s): s is typeof s & { slug: string; short_name: string } => Boolean(s.slug && s.short_name))
    .map((s) => ({
      slug: s.slug,
      name: s.full_name ?? s.short_name,
      photoUrl: safeImageUrl(s.photo_url),
      logoUrl: safeImageUrl(s.logo_url),
    }));
}

/** True once the visitor has picked a school for themselves. */
export async function hasChosenSchool(): Promise<boolean> {
  return Boolean((await cookies()).get("school")?.value);
}

/**
 * The first screen of signing in or registering when the platform serves more
 * than one school: pick yours, and the card, its background and the footer's
 * accounts become that school's.
 */
export async function SchoolPicker({ schools, next }: { schools: AuthSchool[]; next: "/login" }) {
  const t = await getTranslations("auth.school");

  return (
    <Card as="div">
      <CardBody className="p-6 sm:p-8">
        <h1 className="text-center text-2xl font-semibold">{t("chooseTitle")}</h1>
        <p className="mb-5 mt-1 text-center text-sm text-ink-secondary">{t("chooseSubtitle")}</p>
        <ul className="space-y-2">
          {schools.map((school) => (
            <li key={school.slug}>
              <form action={setAuthSchoolAction}>
                <input type="hidden" name="school" value={school.slug} />
                <input type="hidden" name="next" value={next} />
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface p-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- owner-supplied artwork at its own URL */}
                  <img
                    src={school.logoUrl || school.photoUrl || "/images/school-mark.webp"}
                    alt=""
                    aria-hidden
                    className="size-11 shrink-0 rounded-full object-cover ring-1 ring-line"
                  />
                  <span className="min-w-0 flex-1 text-sm font-medium text-ink">{school.name}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

/** A way back to the list, shown once a school has been chosen. */
export async function ChangeSchool({ next }: { next: "/login" }) {
  const t = await getTranslations("auth.school");
  return (
    <form action={clearAuthSchoolAction} className="mt-4 text-center">
      <input type="hidden" name="next" value={next} />
      <button
        type="submit"
        className="inline-flex items-center gap-1 text-xs text-ink-muted transition-colors hover:text-ink-secondary"
      >
        <ChevronLeft className="size-3.5" aria-hidden />
        {t("change")}
      </button>
    </form>
  );
}
