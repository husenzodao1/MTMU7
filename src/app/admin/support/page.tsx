import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Inbox } from "lucide-react";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { ResolveRequestButton } from "@/features/support/request-actions";
import { TabNav } from "@/components/ui/misc";
import { EmptyState, PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/text";
import { firstValue, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("support") };
}

/** The desk's inbox: notes from people who could not sign in, and from the portal's own support page. */
export default async function SupportInboxPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("messages.moderate");
  const t = await getTranslations("admin.support");
  const locale = (await getLocale()) as Locale;
  const view = firstValue((await searchParams).view);
  const tab: "notes" | "done" = view === "done" ? "done" : "notes";
  const supabase = await createClient();
  const timeZone = access.school!.timezone;

  const { data: notes } = await supabase
    .from("support_requests")
    .select("id, name, contact, message, status, created_at, handled_at")
    .eq("school_id", access.school!.id)
    .eq("status", tab === "done" ? "done" : "open")
    .order("created_at", { ascending: tab !== "done" })
    .limit(200);

  return (
    <>
      <PageHeader breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />} title={t("title")} description={t("description")} />
      <TabNav
        label={t("views")}
        items={[
          { href: "/admin/support", label: t("notes"), active: tab === "notes" },
          { href: "/admin/support?view=done", label: t("done"), active: tab === "done" },
        ]}
      />

      {(notes ?? []).length === 0 ? (
        <EmptyState icon={<Inbox />} title={tab === "done" ? t("emptyDone") : t("emptyNotes")} />
      ) : (
        <ul className="space-y-3">
          {(notes ?? []).map((n) => (
            <li key={n.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{n.name}</p>
                  <p className="text-sm text-ink-secondary">
                    <a
                      href={n.contact.includes("@") ? `mailto:${n.contact}` : `tel:${n.contact.replace(/[^\d+]/g, "")}`}
                      className="font-medium text-brand-text hover:underline"
                    >
                      {n.contact}
                    </a>
                    <span className="text-ink-muted"> · {formatDateTime(n.created_at, locale, timeZone)}</span>
                  </p>
                </div>
                <ResolveRequestButton id={n.id} done={n.status === "done"} />
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm text-ink">{n.message}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
