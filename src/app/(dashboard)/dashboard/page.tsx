import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardPage() {
  const t = await getTranslations("nav");

  return (
    <div className="space-y-6 animate-in">
      <h1 className="text-2xl font-bold text-neutral-900">{t("dashboard")}</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="hover:shadow-md">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-neutral-500">
                --
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">--</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
