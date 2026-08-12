import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const t = await getTranslations("auth");
  const { redirect } = await searchParams;

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
        <LoginForm redirect={redirect} />
      </CardContent>
    </Card>
  );
}
