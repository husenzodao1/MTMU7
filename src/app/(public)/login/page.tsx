import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; message?: string; error?: string; registered?: string }>;
}) {
  const t = await getTranslations("auth");
  const { redirect, message, error, registered } = await searchParams;

  return (
    <Card className="w-full rounded-[28px] border border-neutral-200/80 bg-white/90 shadow-xl backdrop-blur-md animate-in">
      <CardHeader className="text-center pb-2">
        <div className="mx-auto mb-4 h-28 w-28 overflow-hidden rounded-full shadow-lg">
          <img
            src="/school.png"
            alt="МТМУ №7"
            className="h-full w-full object-cover"
          />
        </div>
        <CardTitle className="text-xl font-extrabold tracking-tight text-neutral-900">{t("loginTitle")}</CardTitle>
        <CardDescription className="text-sm text-neutral-500">{t("loginDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="pt-2">
        {error === "noProfile" && (
          <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200/70 p-3 text-sm text-amber-700">
            {t("noProfile")}
          </div>
        )}
        {registered === "true" && (
          <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200/70 p-3 text-sm text-emerald-700">
            {t("registrationSuccess")}
          </div>
        )}
        {message === "passwordReset" && (
          <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200/70 p-3 text-sm text-emerald-700">
            {t("passwordReset")}
          </div>
        )}
        <LoginForm redirect={redirect} />
      </CardContent>
    </Card>
  );
}
