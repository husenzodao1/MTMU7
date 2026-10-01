import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/surface";
import type { PortalStage } from "@/lib/auth/guards";

/**
 * Banner for an account that predates the school issuing logins itself.
 *
 * Nobody signs themselves up any more, so these states can only be left over
 * from the time when they did: a session whose account row was never written, a
 * request still waiting, a request that was refused. There is no form to send
 * them to — the school office issues the login — so the banner says what is
 * wrong and stops there.
 */
export async function RegistrationNotice({
  stage,
  rejectionReason,
}: {
  stage: Exclude<PortalStage, "member" | "email_unconfirmed">;
  rejectionReason?: string | null;
}) {
  const t = await getTranslations("portal.dashboard.incomplete");

  if (stage === "profile_missing") {
    return (
      <Alert tone="warning" title={t("profileTitle")} className="mb-5">
        {t("profileBody")}
      </Alert>
    );
  }

  if (stage === "rejected") {
    return (
      <Alert tone="danger" title={t("rejectedTitle")} className="mb-5">
        {rejectionReason || t("rejectedBody")}
      </Alert>
    );
  }

  return (
    <Alert tone="info" title={t("pendingTitle")} className="mb-5">
      {t("pendingBody")}
    </Alert>
  );
}
