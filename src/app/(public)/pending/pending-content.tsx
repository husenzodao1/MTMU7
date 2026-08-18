"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function PendingContent({
  status,
  rejectionReason,
}: {
  status: string;
  rejectionReason: string | null;
}) {
  const t = useTranslations("pending");
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const isRejected = status === "rejected";

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center animate-in">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary-50">
        {isRejected ? (
          <XCircle className="h-10 w-10 text-error-500" />
        ) : (
          <Clock className="h-10 w-10 text-primary-500" />
        )}
      </div>

      <Badge variant={isRejected ? "destructive" : "warning"} className="mb-4">
        {isRejected ? t("statusRejected") : t("statusPending")}
      </Badge>

      <h1 className="mb-2 text-2xl font-bold text-neutral-900">
        {isRejected ? t("statusRejected") : t("title")}
      </h1>

      <p className="mb-2 max-w-sm text-neutral-600">
        {isRejected ? t("rejectedMessage") : t("message")}
      </p>

      {!isRejected && (
        <p className="mb-6 max-w-sm text-sm text-neutral-500">
          {t("waitMessage")}
        </p>
      )}

      {isRejected && rejectionReason && (
        <div className="mb-6 max-w-sm rounded-lg bg-red-50 p-4 text-sm text-neutral-700">
          <span className="font-medium">{t("rejectionReason")}:</span>{" "}
          {rejectionReason}
        </div>
      )}

      <Button variant="outline" onClick={handleLogout}>
        {t("logoutButton")}
      </Button>
    </div>
  );
}
