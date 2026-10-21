import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EventList } from "@/features/content/components";
import { getUpcomingEvents, mapEvent } from "@/features/content/queries";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requireModule } from "@/lib/auth/guards";
import { requestTimeMinus } from "@/lib/request-time";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("events") };
}

export default async function EventsPage() {
  const access = await requireModule("events");
  if (!can(access, "events.view")) redirect("/access-denied");
  const t = await getTranslations("portal.events");
  const schoolId = access.school!.id;
  const supabase = await createClient();

  const [upcoming, { data: past }] = await Promise.all([
    getUpcomingEvents(schoolId, 50),
    supabase
      .from("events")
      .select("id, title, description, category, starts_at, ends_at, all_day, location, audience, organizer, image_path, status")
      .eq("school_id", schoolId)
      .eq("status", "published")
      .lt("starts_at", requestTimeMinus(0))
      .gte("starts_at", requestTimeMinus(60 * 86400 * 1000))
      .order("starts_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("upcoming")} />
          <CardBody><EventList items={upcoming} /></CardBody>
        </Card>
        <Card>
          <CardHeader title={t("past")} />
          <CardBody><EventList items={(past ?? []).map(mapEvent)} /></CardBody>
        </Card>
      </div>
    </>
  );
}
