import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { AdminNav } from "../admin-nav";
import { SchoolSettingsForm } from "./school-settings-form";

async function getSchoolData() {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("schools" as never)
    .select(
      "short_name, full_name, address, phone, email, website, id_prefix, logo_url" as never
    )
    .single();

  const row = data as Record<string, unknown> | null;
  if (!row) return null;

  return {
    shortName: row.short_name as string,
    fullName: row.full_name as string,
    address: (row.address as string) ?? null,
    phone: (row.phone as string) ?? null,
    email: (row.email as string) ?? null,
    website: (row.website as string) ?? null,
    idPrefix: row.id_prefix as string,
    logoUrl: (row.logo_url as string | null) ?? null,
  };
}

export default async function SchoolSettingsPage() {
  await requireAdmin();
  const t = await getTranslations("admin");
  const school = await getSchoolData();

  if (!school) {
    return <div>School data not found</div>;
  }

  return (
    <div>
      <AdminNav />
      <div className="animate-in">
        <h1 className="mb-6 text-2xl font-bold text-neutral-900">
          {t("schoolSettings")}
        </h1>
        <SchoolSettingsForm school={school} />
      </div>
    </div>
  );
}
