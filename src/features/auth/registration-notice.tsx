import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonClasses } from "@/components/ui/button";
import { Alert } from "@/components/ui/surface";
import type { PortalStage } from "@/lib/auth/guards";

/**
 * Banner for a visitor whose registration is not finished. They are allowed
 * into the dashboard — being thrown back to a form explains nothing — and this
 * says exactly what is still missing and where to finish it.
 */
export async function RegistrationNotice({ stage, rejectionReason }: { stage: Exclude<PortalStage, "member">; rejectionReason?: string | null }) {
  const t = await getTranslations("portal.dashboard.incomplete");

  if (stage === "profile_missing") {
    return (
      <Alert
        tone="warning"
        title={t("profileTitle")}
        className="mb-5"
        actions={
          <Link href="/register?step=profile" className={buttonClasses("primary", "sm")}>
            {t("profileCta")}
          </Link>
        }
      >
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
    <Alert
      tone="info"
      title={t("pendingTitle")}
      className="mb-5"
      actions={
        <Link href="/pending" className={buttonClasses("secondary", "sm")}>
          {t("pendingCta")}
        </Link>
      }
    >
      {t("pendingBody")}
    </Alert>
  );
}
