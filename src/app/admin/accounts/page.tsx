import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminBreadcrumb } from "@/features/admin/breadcrumb";
import { getClassOptions } from "@/features/admin/queries";
import { allowedKinds } from "@/features/accounts/access";
import { AccountsView } from "@/features/accounts/accounts-view";
import { AccountsToolbar } from "@/features/accounts/list-parts";
import { loadDirectory, PAGE_SIZE } from "@/features/accounts/queries";
import { ACCOUNT_CATEGORIES, type AccountCategory } from "@/features/accounts/types";
import { TabNav } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requirePermission } from "@/lib/auth/guards";
import { parseListParams, type SearchParams } from "@/lib/list-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("accounts");
  return { title: t("title") };
}

/** Every account in the school: find, filter, open, add, import and export. */
export default async function AccountsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("users.view");
  const t = await getTranslations("accounts");
  const params = await searchParams;
  const list = parseListParams(params, {
    sorts: ["name"],
    defaultSort: "name",
    filters: { category: ACCOUNT_CATEGORIES, class: "uuid" },
    pageSize: PAGE_SIZE,
  });
  const category = (list.filters.category ?? "all") as AccountCategory;
  const [directory, classes] = await Promise.all([
    loadDirectory({ category, query: list.query, classId: list.filters.class ?? null, page: list.page }),
    getClassOptions(access.school!.id),
  ]);

  return (
    <>
      <PageHeader
        breadcrumb={<AdminBreadcrumb items={[{ label: t("title") }]} />}
        title={t("title")}
        description={t("description")}
        actions={
          <AccountsToolbar
            basePath="/admin/accounts"
            canCreate={allowedKinds(access, "school").length > 0}
            canImport={can(access, "students.import") || can(access, "staff.create")}
            exportKinds={["students", "teachers", "parents", "staff", "all"]}
            newLabel={t("new")}
          />
        }
      />
      <TabNav
        label={t("title")}
        items={[
          { href: "/admin/accounts", label: t("tabs.accounts"), active: true },
          { href: "/admin/accounts/parents", label: t("tabs.parents"), active: false },
        ]}
      />
      <AccountsView
        directory={directory}
        basePath="/admin/accounts"
        category={category}
        classes={classes}
        searchParams={params}
        page={list.page}
        pageSize={PAGE_SIZE}
        canMessage={can(access, "messages.use")}
      />
    </>
  );
}
