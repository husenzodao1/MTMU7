import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/guard";
import { AdminNav } from "../admin-nav";
import { getLandingBlocksAction } from "./actions";
import { LandingEditor } from "./landing-editor";

export default async function AdminLandingPage() {
  await requireAdmin();
  const t = await getTranslations("admin");
  const blocks = await getLandingBlocksAction();

  return (
    <div>
      <AdminNav />
      <div className="space-y-6 animate-in">
        <h1 className="text-2xl font-bold text-neutral-900">{t("landingEditor")}</h1>
        <LandingEditor blocks={blocks} />
      </div>
    </div>
  );
}
