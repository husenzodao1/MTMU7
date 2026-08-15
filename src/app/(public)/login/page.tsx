import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; message?: string; error?: string }>;
}) {
  const t = await getTranslations("auth");
  const { redirect, message, error } = await searchParams;

  return (
    <Card className="w-full max-w-md animate-in">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 text-2xl font-bold text-primary-600">
          МТМУ №7
        </div>
        <CardTitle>{t("loginTitle")}</CardTitle>
        <CardDescription>{t("loginDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        {error === "noProfile" && (
          <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
            {t("noProfile")}
          </div>
        )}
        {message === "passwordReset" && (
          <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
            {t("passwordReset")}
          </div>
        )}
        <LoginForm redirect={redirect} />
      </CardContent>
    </Card>
  );
}
