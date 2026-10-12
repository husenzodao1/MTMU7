import { ChevronRight, Send, UsersRound } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { FilterBar } from "@/components/ui/filters";
import { ListBox, Pagination } from "@/components/ui/pagination";
import { Alert, EmptyState } from "@/components/ui/surface";
import { ProfileAvatar } from "@/features/accounts/list-parts";
import { ACCOUNT_CATEGORIES, CATEGORY_OF_ROW, type AccountCategory, type AccountDirectory, type AccountRow } from "@/features/accounts/types";
import type { ClassOption } from "@/features/accounts/account-form";
import { pickName, type Locale } from "@/lib/i18n/text";
import { buildQueryString, type SearchParams } from "@/lib/list-params";
import { cn } from "@/lib/utils/cn";

const CATEGORY_TONE: Record<string, string> = {
  admin: "bg-[#7c3aed]/12 text-[#6d28d9] dark:text-[#c4b5fd]",
  director: "bg-[#0ea5e9]/12 text-[#0369a1] dark:text-[#7dd3fc]",
  teacher: "bg-brand-100 text-brand-text-strong",
  student: "bg-[#16a34a]/12 text-[#15803d] dark:text-[#86efac]",
  parent: "bg-[#f97316]/12 text-[#c2410c] dark:text-[#fdba74]",
  staff: "bg-surface-muted text-ink-secondary",
};

/**
 * The list of accounts, by kind, with a count on each chip. Each row opens the
 * account for editing; its face opens the person's profile card.
 */
export async function AccountsView({
  directory,
  basePath,
  category,
  classes,
  searchParams,
  page,
  pageSize,
  canMessage,
}: {
  directory: AccountDirectory | null;
  basePath: string;
  category: AccountCategory;
  classes: ClassOption[];
  searchParams: SearchParams;
  page: number;
  pageSize: number;
  canMessage: boolean;
}) {
  const t = await getTranslations("accounts");
  const tRoot = await getTranslations();
  const locale = (await getLocale()) as Locale;

  if (!directory) return <Alert tone="danger">{tRoot("errors.unexpected")}</Alert>;
  const counts = directory.counts;
  // Hidden accounts are counted on their own tab, not in "all".
  const total = Object.entries(counts).reduce((sum, [kind, n]) => (kind === "hidden" ? sum : sum + Number(n)), 0);
  // A class narrows pupils only, so it is kept for pupils and "all" and
  // dropped for every other kind.
  const chipHref = (next: AccountCategory) =>
    `${basePath}${buildQueryString(searchParams, {
      category: next === "all" ? null : next,
      page: null,
      ...(next === "students" || next === "all" ? {} : { class: null }),
    })}`;

  return (
    <div className="space-y-4">
      {directory.scope === "school" ? (
        <nav aria-label={t("title")} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {ACCOUNT_CATEGORIES.map((key) => {
            const count = key === "all" ? total : Number(counts[CATEGORY_OF_ROW[key]] ?? 0);
            const active = key === category;
            // The hidden tab appears once something is hidden.
            if (key === "hidden" && count === 0 && !active) return null;
            return (
              <Link
                key={key}
                href={chipHref(key)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "account-chip inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                  active ? "border-transparent bg-brand-solid text-brand-on-solid shadow-sm" : "border-line bg-surface text-ink-secondary hover:border-brand-300 hover:text-ink"
                )}
              >
                {t(`categories.${key}`)}
                <span className={cn("rounded-full px-1.5 text-xs tabular", active ? "bg-white/20" : "bg-surface-muted text-ink-muted")}>{count}</span>
              </Link>
            );
          })}
        </nav>
      ) : null}

      <FilterBar
        searchLabel={t("search")}
        searchPlaceholder={t("search")}
        filters={
          classes.length > 1 && (category === "all" || category === "students")
            ? [{ name: "class", label: t("fields.class_id"), emptyLabel: t("allClasses"), options: classes.map((c) => ({ value: c.value, label: c.label })) }]
            : []
        }
      />

      <ListBox>
        {directory.rows.length === 0 ? (
          <EmptyState icon={<UsersRound />} title={t("empty")} description={t("emptyHint")} />
        ) : (
          <ul className="grid gap-2">
            {directory.rows.map((row) => (
              <AccountRowItem key={row.id} row={row} basePath={basePath} locale={locale} canMessage={canMessage} t={t} />
            ))}
          </ul>
        )}

        <Pagination pathname={basePath} searchParams={searchParams} page={page} pageSize={pageSize} total={directory.total} />
      </ListBox>
    </div>
  );
}

function AccountRowItem({
  row,
  basePath,
  locale,
  canMessage,
  t,
}: {
  row: AccountRow;
  basePath: string;
  locale: Locale;
  canMessage: boolean;
  t: Awaited<ReturnType<typeof getTranslations<"accounts">>>;
}) {
  const name = [row.last_name, row.first_name, row.middle_name].filter(Boolean).join(" ");
  const detail =
    row.category === "student"
      ? row.class_name
      : row.category === "parent"
        ? row.children
        : row.homeroom
          ? t("row.homeroom", { name: row.homeroom })
          : null;
  const kindLabel = row.roles[0] ? pickName(row.roles[0], locale) : t(`kinds.${row.category === "director" ? "director" : "staff"}`);

  return (
    <li className="account-row group relative flex items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2.5 shadow-xs transition-all hover:-translate-y-px hover:border-brand-300 hover:shadow-sm">
      <ProfileAvatar userId={row.id} name={`${row.first_name} ${row.last_name}`} avatarUrl={row.avatar_url} canMessage={canMessage} />
      <div className="min-w-0 flex-1">
        <Link href={`${basePath}/${row.id}`} className="block truncate font-semibold text-ink after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none group-focus-within:text-brand-text">
          {name}
        </Link>
        <p className="truncate text-xs text-ink-muted">
          <span className="font-mono tracking-wide">{row.public_id}</span>
          {detail ? <span> · {detail}</span> : null}
          {row.phone ? <span className="hidden sm:inline"> · {row.phone}</span> : null}
        </p>
      </div>
      <div className="hidden shrink-0 flex-wrap items-center justify-end gap-1.5 sm:flex">
        {row.positions.map((position) => (
          <Badge key={position} tone="brand">{t(`positions.${position}`)}</Badge>
        ))}
        {row.category === "student" && row.grade_level !== null ? (
          row.parents === 0 ? (
            <Badge tone="warning">{t("row.noParents")}</Badge>
          ) : (
            <span
              title={row.telegram ? t("row.telegram", { count: row.telegram }) : t("row.noTelegram")}
              className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", row.telegram ? "bg-[#229ed9]/12 text-[#1b85b8]" : "bg-surface-muted text-ink-muted")}
            >
              <Send className="size-3" aria-hidden />
              {row.telegram ?? 0}
            </span>
          )
        ) : null}
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", CATEGORY_TONE[row.category] ?? CATEGORY_TONE.staff)}>{kindLabel}</span>
        {row.hidden ? (
          <Badge tone="neutral">{t("row.hidden")}</Badge>
        ) : row.status !== "active" ? (
          <Badge tone="danger">{row.status === "blocked" ? t("row.blocked") : row.status}</Badge>
        ) : null}
      </div>
      <ChevronRight className="size-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden />
    </li>
  );
}
