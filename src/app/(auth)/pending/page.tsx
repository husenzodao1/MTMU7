import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Clock3, XCircle } from "lucide-react";
import { signOutAction } from "@/app/actions/session";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardBody } from "@/components/ui/surface";
import { getAccess, getAuthUserId } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.pending");
  return { title: t("title"), robots: { index: false } };
}

export default async function PendingPage() {
  // A self-service registration creates a request, not an account: the profile
  // row appears only when an administrator approves it. This page therefore
  // has to work for a signed-in visitor who has no profile yet — otherwise the
  // applicant is bounced back into the registration form.
  const [access, authUserId] = await Promise.all([getAccess(), getAuthUserId()]);
  if (!access && !authUserId) redirect("/login");
  if (access && (access.status === "active" || access.status === "graduated")) redirect("/dashboard");

  const t = await getTranslations("auth.pending");
  const supabase = await createClient();
  const { data: request } = await supabase
    .from("registration_requests")
    .select("status, rejection_reason, created_at, first_name")
    .eq("auth_user_id", authUserId ?? access!.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // No account and no request: registration was never completed.
  if (!access && !request) redirect("/register?step=profile");

  const rejected = access?.status === "rejected" || request?.status === "rejected";
  const name = access?.firstName ?? request?.first_name ?? "";
  const school = access?.school?.shortName ?? "";

  return (
    <Card as="div">
      <CardBody className="space-y-4 p-6 text-center sm:p-8">
        <div className={`mx-auto flex size-12 items-center justify-center rounded-full ${rejected ? "bg-danger-50 text-danger-600" : "bg-warning-50 text-warning-700"}`}>
          {rejected ? <XCircle className="size-6" aria-hidden /> : <Clock3 className="size-6" aria-hidden />}
        </div>
        <h1 className="text-2xl font-semibold">{rejected ? t("rejectedTitle") : t("title")}</h1>
        <p className="text-sm text-ink-secondary">
          {rejected ? t("rejectedDescription") : t("description", { name, school })}
        </p>
        {rejected && request?.rejection_reason ? (
          <Alert tone="danger" title={t("reason")} className="text-left">
            {request.rejection_reason}
          </Alert>
        ) : null}
        <form action={signOutAction}>
          <Button type="submit" variant="secondary">
            {t("signOut")}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
