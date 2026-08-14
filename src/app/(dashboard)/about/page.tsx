import { getTranslations } from "next-intl/server";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Mail, Info } from "lucide-react";

const developers = [
  "Носирзода Меҳровар",
  "Ҷураев Илес",
  "Ҳусейнзода Руслан",
];

const supportEmail = "mtmuraqami7@gmail.com";

export default async function AboutPage() {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const t = await getTranslations("about");
  const tc = await getTranslations("common");

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6 animate-in">
      <h1 className="text-2xl font-bold text-neutral-900">{t("title")}</h1>

      {/* System Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50">
              <Info className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <CardTitle>{tc("appName")}</CardTitle>
              <p className="mt-0.5 text-sm text-neutral-500">
                {t("version")} 1.0.0
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-600">{t("systemDescription")}</p>
          <p className="mt-2 text-sm text-neutral-500">{tc("appFullName")}</p>
        </CardContent>
      </Card>

      {/* Developers */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50">
              <Users className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <CardTitle>{t("developers")}</CardTitle>
              <p className="mt-0.5 text-sm text-neutral-500">
                {t("developedBy")}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {developers.map((name, i) => (
              <li
                key={name}
                className="flex items-center gap-3 animate-list-item"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">
                  {name.charAt(0)}
                </div>
                <span className="text-sm font-medium text-neutral-800">
                  {name}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Support */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50">
              <Mail className="h-5 w-5 text-primary-600" />
            </div>
            <CardTitle>{t("support")}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-neutral-600">{t("supportDescription")}</p>
          <div className="flex items-center gap-3 rounded-lg bg-neutral-50 px-4 py-3">
            <Mail className="h-4 w-4 shrink-0 text-neutral-400" />
            <span className="text-sm font-medium text-neutral-700">
              {supportEmail}
            </span>
          </div>
          <a href={`mailto:${supportEmail}`}>
            <Button className="w-full press-scale">{t("contactSupport")}</Button>
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
