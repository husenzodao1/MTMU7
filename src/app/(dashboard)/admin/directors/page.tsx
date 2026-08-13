import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/guard";
import { AdminNav } from "../admin-nav";
import { getDirectorsAction } from "./actions";
import { DirectorsList } from "./directors-list";
import { DirectorForm } from "./director-form";

export default async function DirectorsPage() {
  await requireAdmin();
  const t = await getTranslations("admin");
  const directors = await getDirectorsAction();

  return (
    <div>
      <AdminNav />
      <div className="space-y-6 animate-in">
        <h1 className="text-2xl font-bold text-neutral-900">{t("directors")}</h1>
        <DirectorForm />
        <DirectorsList directors={directors} />
      </div>
    </div>
  );
}
