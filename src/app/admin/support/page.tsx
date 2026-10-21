import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Inbox } from "lucide-react";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { DecidePermissionButtons, ResolveRequestButton } from "@/features/support/request-actions";
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
  const tc = await getTranslations("common.support");
  const locale = (await getLocale()) as Locale;
  const view = firstValue((await searchParams).view);
  const tab: "notes" | "done" | "permissions" = view === "done" ? "done" : view === "permissions" ? "permissions" : "notes";
  const supabase = await createClient();
  const timeZone = access.school!.timezone;

  const [{ data: notes }, { data: permissions }] = await Promise.all([
    supabase
      .from("support_requests")
      .select("id, name, contact, message, status, created_at, handled_at")
      .eq("school_id", access.school!.id)
      .eq("status", tab === "done" ? "done" : "open")
      .order("created_at", { ascending: tab !== "done" })
      .limit(200),
    // Pupils asking to reach a girl of another class (00101): the waiting ones
    // first, then the last answered.
    supabase
      .from("contact_permissions")
      .select(
        "id, status, created_at, decided_at, requester:users!contact_permissions_requester_id_fkey(first_name, last_name), target:users!contact_permissions_target_id_fkey(first_name, last_name)"
      )
      .eq("school_id", access.school!.id)
      .order("status", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const waiting = (permissions ?? []).filter((p) => p.status === "pending").length;
  const person = (value: unknown) => {
    const p = value as { first_name: string; last_name: string } | null;
    return p ? `${p.last_name} ${p.first_name}` : "—";
  };

  return (
    <>
      <PageHeader breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />} title={t("title")} description={t("description")} />
      <TabNav
        label={t("views")}
        items={[
          { href: "/admin/support", label: t("notes"), active: tab === "notes" },
          { href: "/admin/support?view=permissions", label: t("permissions"), active: tab === "permissions", count: waiting || undefined },
          { href: "/admin/support?view=done", label: t("done"), active: tab === "done" },
        ]}
      />

      {tab === "permissions" ? (
        (permissions ?? []).length === 0 ? (
          <EmptyState icon={<Inbox />} title={t("emptyPermissions")} />
        ) : (
          <ul className="space-y-3">
            {(permissions ?? []).map((p) => (
              <li key={p.id} className="rounded-xl border border-line bg-surface p-4" data-status={p.status}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{t("permissionAsk", { requester: person(p.requester), target: person(p.target) })}</p>
                    <p className="text-sm text-ink-muted">{formatDateTime(p.created_at, locale, timeZone)}</p>
                  </div>
                  {p.status === "pending" ? (
                    <DecidePermissionButtons id={p.id} />
                  ) : (
                    <span className="text-sm font-medium text-ink-secondary">{tc(p.status === "approved" ? "approved" : "declined")}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === "permissions" ? null : (notes ?? []).length === 0 ? (
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
