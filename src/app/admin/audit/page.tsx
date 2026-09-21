import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ScrollText } from "lucide-react";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { getSchoolRoles } from "@/features/admin/queries";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/fields";
import { Pagination } from "@/components/ui/pagination";
import { Card, CardBody, EmptyState, PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/i18n/format";
import { pickText, type Locale } from "@/lib/i18n/text";
import { localDayRangeIso } from "@/lib/i18n/zoned";
import { firstValue, parseListParams, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("audit") };
}

const SAFE_KEY = /^[a-z_]{1,50}$/;

function summarize(values: unknown): string {
  if (!values || typeof values !== "object") return "";
  return Object.entries(values as Record<string, unknown>)
    .filter(([key]) => !/password|token|secret|content|body/i.test(key))
    .slice(0, 6)
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value)?.slice(0, 60) : String(value).slice(0, 60)}`)
    .join(" · ");
}

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("audit.view");
  const t = await getTranslations("admin.audit");
  const ta = await getTranslations("admin.audit.actions");
  const locale = (await getLocale()) as Locale;
  const timeZone = access.school!.timezone;
  const params = await searchParams;
  const list = parseListParams(params, { sorts: ["recent"], defaultSort: "recent", pageSize: 50, filters: { from: "date", to: "date" } });
  const action = firstValue(params.action);
  const entity = firstValue(params.entity);
  const supabase = await createClient();

  let query = supabase
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, old_values, new_values, metadata, created_at, actor_role, user_public_id, users:user_id(first_name, last_name)", { count: "exact" })
    .eq("school_id", access.school!.id)
    .order("created_at", { ascending: false })
    .range(list.offset, list.offset + list.pageSize - 1);
  if (action && SAFE_KEY.test(action)) query = query.eq("action", action);
  if (entity && SAFE_KEY.test(entity)) query = query.eq("entity_type", entity);
  // The filter dates are the school's calendar days, not UTC days.
  const range = localDayRangeIso(list.filters.from, list.filters.to, timeZone);
  if (range.start) query = query.gte("created_at", range.start);
  if (range.end) query = query.lt("created_at", range.end);
  const [{ data, count }, roles] = await Promise.all([query, getSchoolRoles(access.school!.id)]);
  const roleNames = new Map(roles.map((role) => [role.slug, pickText({ tg: role.name_tg, ru: role.name_ru, en: role.name_en }, locale)]));

  return (
    <>
      <PageHeader breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />} title={t("title")} description={t("description")} />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <TextField name="action" label={t("action")} defaultValue={action ?? ""} placeholder="update" maxLength={50} />
        <TextField name="entity" label={t("entity")} defaultValue={entity ?? ""} placeholder="grade" maxLength={50} />
        <TextField name="from" type="date" label={t("from")} defaultValue={list.filters.from ?? ""} />
        <TextField name="to" type="date" label={t("to")} defaultValue={list.filters.to ?? ""} />
        <Button type="submit" variant="secondary">{t("filter")}</Button>
      </form>
      {!data || data.length === 0 ? (
        <Card as="div"><EmptyState icon={<ScrollText />} title={t("empty")} description={t("emptyHint")} /></Card>
      ) : (
        <Card as="div">
          <CardBody className="p-0">
            <ol className="divide-y divide-line">
              {data.map((entry) => {
                const actor = entry.users as unknown as { first_name: string; last_name: string } | null;
                const details = [summarize(entry.new_values), summarize(entry.metadata)].filter(Boolean).join(" · ");
                return (
                  <li key={entry.id} className="grid gap-1 px-5 py-3 sm:grid-cols-[11rem_1fr]">
                    <time dateTime={entry.created_at} className="text-sm text-ink-muted tabular">{formatDateTime(entry.created_at, locale, timeZone)}</time>
                    <div className="min-w-0">
                      <p className="text-sm">
                        <span className="font-medium">{actor ? `${actor.last_name} ${actor.first_name}` : t("system")}</span>
                        {entry.actor_role ? <span className="text-ink-muted"> ({roleNames.get(entry.actor_role) || entry.actor_role})</span> : null}{" "}
                        <span>{ta.has(entry.action) ? ta(entry.action) : entry.action}</span>{" "}
                        <span className="font-mono text-ink-secondary">{entry.entity_type}</span>
                      </p>
                      {details ? <p className="truncate font-mono text-xs text-ink-muted" title={details}>{details}</p> : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </CardBody>
        </Card>
      )}
      <Pagination pathname="/admin/audit" searchParams={params} page={list.page} pageSize={list.pageSize} total={count ?? 0} />
    </>
  );
}
