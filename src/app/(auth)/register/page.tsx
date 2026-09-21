import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { RegistrationDetailsForm, RegistrationPasswordForm, VerifyCodeForm } from "@/features/auth/forms";
import { readDraft } from "@/features/auth/draft";
import { restartRegistrationAction } from "@/features/auth/actions";
import { Card, CardBody } from "@/components/ui/surface";
import { getAccess } from "@/lib/auth/access";
import { firstValue, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.register");
  return { title: t("title"), robots: { index: false } };
}

async function loadSchools() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_public_schools");
  return (data ?? [])
    .filter((s): s is typeof s & { slug: string; short_name: string } => Boolean(s.slug && s.short_name))
    .map((s) => ({ slug: s.slug, name: s.full_name ?? s.short_name, registrationOpen: s.registration_open ?? true }));
}

function Steps({ current, labels }: { current: number; labels: string[] }) {
  return (
    <ol className="mb-5 grid grid-cols-3 gap-2" aria-label={labels.join(", ")}>
      {labels.map((label, index) => {
        const state = index < current ? "done" : index === current ? "current" : "todo";
        return (
          <li key={label} aria-current={state === "current" ? "step" : undefined} className="min-w-0">
            <span className={`block h-1 rounded-full ${state === "todo" ? "bg-surface-sunken" : "bg-brand-solid"}`} aria-hidden />
            <span className={`mt-1.5 block truncate text-xs ${state === "current" ? "font-semibold text-ink" : "text-ink-muted"}`}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const t = await getTranslations("auth.register");
  const step = firstValue((await searchParams).step) ?? "details";
  const labels = [t("steps.details"), t("steps.verify"), t("steps.password")];

  // A session may exist while the account has no profile row yet; that visitor
  // belongs on the profile step, and anyone with a profile belongs in the
  // portal. The proxy leaves this page alone so the two cannot bounce.
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const signedIn = Boolean(claims?.claims?.sub);
  if (signedIn && (await getAccess())) redirect("/dashboard");
  if (signedIn) {
    // A submitted request waits for approval; do not ask for the profile again.
    const { data: request } = await supabase
      .from("registration_requests")
      .select("status")
      .eq("auth_user_id", claims!.claims.sub)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (request && request.status !== "rejected") redirect("/pending");
    if (step !== "profile") redirect("/register?step=profile");
  }

  if (step === "profile") {
    if (!signedIn) redirect("/login");
    const email = typeof claims?.claims?.email === "string" ? claims.claims.email : "";
    return (
      <Card as="div">
        <CardBody className="p-6 sm:p-8">
          <h1 className="text-2xl font-semibold">{t("profileTitle")}</h1>
          <p className="mb-5 mt-1 text-sm text-ink-secondary">{t("profileSubtitle")}</p>
          <RegistrationDetailsForm schools={await loadSchools()} mode="profile" email={email} />
        </CardBody>
      </Card>
    );
  }

  const draft = await readDraft();

  if (step === "verify" || step === "password") {
    if (!draft) redirect("/register");
    return (
      <Card as="div">
        <CardBody className="p-6 sm:p-8">
          <Steps current={step === "verify" ? 1 : 2} labels={labels} />
          {step === "verify" ? (
            <>
              <h1 className="text-2xl font-semibold">{t("verifyTitle")}</h1>
              <p className="mb-5 mt-1 text-sm text-ink-secondary">{t("verifySubtitle", { email: draft.email })}</p>
              <VerifyCodeForm purpose="register" />
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold">{t("passwordTitle")}</h1>
              <p className="mb-5 mt-1 text-sm text-ink-secondary">{t("passwordSubtitle")}</p>
              <RegistrationPasswordForm />
            </>
          )}
          <form action={restartRegistrationAction} className="mt-4 text-center">
            <button type="submit" className="text-sm text-ink-muted hover:text-ink hover:underline">
              {t("restart")}
            </button>
          </form>
        </CardBody>
      </Card>
    );
  }

  const schools = await loadSchools();
  return (
    <Card as="div">
      <CardBody className="p-6 sm:p-8">
        <Steps current={0} labels={labels} />
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mb-5 mt-1 text-sm text-ink-secondary">{t("subtitle")}</p>
        {schools.length === 0 ? (
          <p className="text-sm text-ink-secondary">{t("noSchools")}</p>
        ) : (
          <RegistrationDetailsForm schools={schools} mode="start" />
        )}
        <p className="mt-5 border-t border-line pt-4 text-center text-sm text-ink-secondary">
          {t("haveAccount")}{" "}
          <Link href="/login" className="font-medium text-brand-text hover:underline">
            {t("signIn")}
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
