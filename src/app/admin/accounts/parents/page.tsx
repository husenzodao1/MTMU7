import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Download, Send, UsersRound } from "lucide-react";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { getClassOptions } from "@/features/admin/queries";
import { AccountsToolbar } from "@/features/accounts/list-parts";
import { loadDirectory, PAGE_SIZE } from "@/features/accounts/queries";
import { buttonClasses } from "@/components/ui/button";
import { SelectField } from "@/components/ui/fields";
import { FilterBar } from "@/components/ui/filters";
import { TabNav } from "@/components/ui/misc";
import { ListBox, Pagination } from "@/components/ui/pagination";
import { Alert, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import { parseListParams, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("accounts");
  return { title: t("parents.title") };
}

interface ParentLink {
  student_id: string;
  relationship: string;
  guardians: { id: string; first_name: string; last_name: string; phone: string | null; user_id: string | null } | null;
}

/**
 * The parents and their bot, together: each pupil with the parents the school
 * knows, whether they have an account, and whether anybody follows the pupil
 * in Telegram — and, beside it, the codes a class's parents type into the bot.
 */
export default async function ParentsTelegramPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("users.view");
  const t = await getTranslations("accounts");
  const tp = await getTranslations("admin.parents");
  const params = await searchParams;
  const list = parseListParams(params, { sorts: ["name"], defaultSort: "name", filters: { class: "uuid" }, pageSize: PAGE_SIZE });
  const [directory, classes] = await Promise.all([
    loadDirectory({ category: "students", query: list.query, classId: list.filters.class ?? null, page: list.page }),
    getClassOptions(access.school!.id),
  ]);
  const pupils = directory?.rows ?? [];

  const supabase = await createClient();
  const { data: students } = pupils.length
    ? await supabase.from("students").select("id, user_id").in("user_id", pupils.map((p) => p.id))
    : { data: [] as Array<{ id: string; user_id: string | null }> };
  const studentOf = new Map((students ?? []).map((s) => [s.user_id, s.id]));
  const { data: links } = students?.length
    ? await supabase
        .from("student_guardians")
        .select("student_id, relationship, guardians(id, first_name, last_name, phone, user_id)")
        .in("student_id", students.map((s) => s.id))
    : { data: [] };
  const parentsOf = new Map<string, ParentLink[]>();
  for (const link of (links ?? []) as unknown as ParentLink[]) {
    parentsOf.set(link.student_id, [...(parentsOf.get(link.student_id) ?? []), link]);
  }
  const onTelegram = pupils.filter((p) => (p.telegram ?? 0) > 0).length;

  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title"), href: "/admin/accounts" }, { label: t("parents.title") }]} />}
        title={t("parents.title")}
        description={t("parents.description")}
        actions={
          <AccountsToolbar basePath="/admin/accounts" canCreate={false} canImport={false} exportKinds={["parents", "students"]} newLabel={t("new")} />
        }
      />
      <TabNav
        label={t("title")}
        items={[
          { href: "/admin/accounts", label: t("tabs.accounts"), active: false },
          { href: "/admin/accounts/parents", label: t("tabs.parents"), active: true },
        ]}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <FilterBar
            searchLabel={t("search")}
            searchPlaceholder={t("search")}
            filters={[{ name: "class", label: t("fields.class_id"), emptyLabel: t("allClasses"), options: classes.map((c) => ({ value: c.value, label: c.label })) }]}
          />
          <p className="text-sm text-ink-muted">{t("parents.summary", { parents: (links ?? []).length, linked: onTelegram })}</p>
          <ListBox>
            {pupils.length === 0 ? (
              <EmptyState icon={<UsersRound />} title={t("parents.empty")} description={t("parents.emptyHint")} />
            ) : (
              <ul className="grid gap-2">
                {pupils.map((pupil) => {
                  const studentId = studentOf.get(pupil.id);
                  const parents = studentId ? (parentsOf.get(studentId) ?? []) : [];
                  const telegram = pupil.telegram ?? 0;
                  return (
                    <li key={pupil.id} className="rounded-2xl border border-line bg-surface p-3 shadow-xs">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <Link href={`/admin/accounts/${pupil.id}`} className="font-semibold text-ink hover:text-brand-text hover:underline">
                            {pupil.last_name} {pupil.first_name}
                          </Link>
                          <p className="text-xs text-ink-muted">{pupil.class_name ?? "—"} · <span className="font-mono">{pupil.public_id}</span></p>
                        </div>
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                            telegram ? "bg-[#229ed9]/12 text-[#1b85b8]" : "bg-surface-muted text-ink-muted"
                          )}
                        >
                          <Send className="size-3.5" aria-hidden />
                          {telegram ? `${t("parents.linked")} · ${telegram}` : t("parents.notLinked")}
                        </span>
                      </div>
                      {parents.length > 0 ? (
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {parents.map((link) => (
                            <li key={link.guardians?.id ?? link.relationship} className="rounded-xl bg-surface-muted/60 px-3 py-1.5 text-sm">
                              <span className="font-medium text-ink">{link.guardians?.last_name} {link.guardians?.first_name}</span>
                              <span className="text-ink-muted"> · {t(`relationships.${link.relationship}` as "relationships.mother")}</span>
                              {link.guardians?.phone ? <span className="text-ink-muted"> · {link.guardians.phone}</span> : null}
                              <span className={cn("ms-1.5 text-xs", link.guardians?.user_id ? "text-success-700" : "text-ink-muted")}>
                                ({link.guardians?.user_id ? t("parents.withAccount") : t("parents.noAccount")})
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm text-warning-700">{t("row.noParents")}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <Pagination pathname="/admin/accounts/parents" searchParams={params} page={list.page} pageSize={PAGE_SIZE} total={directory?.total ?? 0} />
          </ListBox>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader title={t("parents.codesTitle")} description={t("parents.codesHint")} />
            <CardBody>
              {can(access, "students.update") && classes.length > 0 ? (
                <form action="/admin/parents/codes" method="post" className="space-y-3">
                  <SelectField name="classId" label={tp("class")} options={classes.map(({ value, label }) => ({ value, label }))} required />
                  <Alert tone="warning">{tp("reissueBody")}</Alert>
                  <button type="submit" className={buttonClasses("primary", "md", "w-full")}>
                    <Download aria-hidden />
                    {tp("download")}
                  </button>
                </form>
              ) : (
                <p className="text-sm text-ink-muted">{tp("noClassesHint")}</p>
              )}
            </CardBody>
          </Card>
          <Alert tone="info" title={tp("botTitle")}>{tp("botHint")}</Alert>
        </aside>
      </div>
    </>
  );
}
