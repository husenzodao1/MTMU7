import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { signOutAction } from "@/app/actions/session";
import { buttonClasses } from "@/components/ui/button";
import { SignInForm } from "@/features/auth/forms";
import { ChangeSchool, hasChosenSchool, listAuthSchools, SchoolPicker } from "@/features/auth/school-picker";
import { Alert, Card, CardBody } from "@/components/ui/surface";
import { firstValue, type SearchParams } from "@/lib/list-params";
import { getAuthSchool } from "@/lib/site/auth-school";
import { safeRedirectPath } from "@/lib/security/redirect";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.login");
  return { title: t("title"), robots: { index: false } };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const t = await getTranslations("auth.login");
  const tn = await getTranslations("nav");
  const params = await searchParams;
  const reason = firstValue(params.reason);
  const nextRaw = firstValue(params.next);
  const next = nextRaw ? safeRedirectPath(nextRaw) : undefined;

  // With several schools on the platform, the first thing to settle is whose
  // sign-in this is; the card, its background and the footer follow from it.
  const schools = await listAuthSchools();
  if (schools.length > 1 && !(await hasChosenSchool())) {
    return <SchoolPicker schools={schools} next="/login" />;
  }
  const school = await getAuthSchool();

  return (
    <>
      <Card as="div">
        <CardBody className="space-y-5 p-6 sm:p-8">
          {reason === "inactive" ? (
            <Alert
              tone="warning"
              // The visitor still holds the session the portal just refused, so
              // the way out is offered here rather than left to be guessed.
              actions={
                <form action={signOutAction}>
                  <button type="submit" className={buttonClasses("secondary", "sm")}>
                    {tn("signOut")}
                  </button>
                </form>
              }
            >
              {t("inactive")}
            </Alert>
          ) : null}
          {reason === "password-updated" ? <Alert tone="success">{t("passwordUpdated")}</Alert> : null}
          {reason === "link-invalid" ? <Alert tone="warning">{t("linkInvalid")}</Alert> : null}
          {/* Google recognised the person, the school did not recognise the
              address. Said plainly, with the way to the desk right there. */}
          {reason === "google-unknown" ? (
            <Alert
              tone="warning"
              actions={
                <Link href="/support" className={buttonClasses("secondary", "sm")}>
                  {t("contactUs")}
                </Link>
              }
            >
              {t("googleUnknown")}
            </Alert>
          ) : null}
          {reason === "google-failed" ? <Alert tone="warning">{t("googleFailed")}</Alert> : null}
          {reason === "google-inactive" ? <Alert tone="warning">{t("inactive")}</Alert> : null}
          <SignInForm next={next} markUrl={school?.logoUrl ?? school?.photoUrl ?? null} />
          {/* There is no self-service door: logins come from the school. The
              card says so rather than offering a form that no longer exists. */}
          <p className="border-t border-line pt-4 text-center text-sm text-ink-secondary">{t("noAccount")}</p>
        </CardBody>
      </Card>
      {schools.length > 1 ? <ChangeSchool next="/login" /> : null}
    </>
  );
}
