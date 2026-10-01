import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { School } from "lucide-react";
import { AccountsView } from "@/features/accounts/accounts-view";
import { AccountsToolbar } from "@/features/accounts/list-parts";
import { loadDirectory, myHomeroomClasses, PAGE_SIZE } from "@/features/accounts/queries";
import { EmptyState, PageHeader } from "@/components/ui/surface";
import { can } from "@/lib/auth/access";
import { requireAccess } from "@/lib/auth/guards";
import { parseListParams, type SearchParams } from "@/lib/list-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("accounts");
  return { title: t("myClassTitle"), robots: { index: false } };
}

/**
 * The homeroom teacher's own class: its pupils, each a tap from their card,
 * and a new pupil a tap from the button. The database answers them for this
 * class and no other (00072).
 */
export default async function MyClassPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requireAccess();
  const t = await getTranslations("accounts");
  const classes = await myHomeroomClasses(access);
  if (classes.length === 0) {
    return (
      <>
        <PageHeader title={t("myClassTitle")} />
        <EmptyState icon={<School />} title={t("myClassTitle")} description={t("notHomeroom")} />
      </>
    );
  }
  const params = await searchParams;
  const list = parseListParams(params, { sorts: ["name"], defaultSort: "name", filters: { class: "uuid" }, pageSize: PAGE_SIZE });
  // Always one of their own classes, whatever the address says.
  const classId = classes.some((c) => c.value === list.filters.class) ? list.filters.class! : classes.length === 1 ? classes[0]!.value : null;
  const directory = await loadDirectory({ category: "students", query: list.query, classId, page: list.page });

  return (
    <>
      <PageHeader
        title={`${t("myClassTitle")} · ${classes.map((c) => c.label).join(", ")}`}
        description={t("myClassDescription")}
        actions={<AccountsToolbar basePath="/my-class" canCreate canImport={false} exportKinds={["students"]} newLabel={t("newPupil")} />}
      />
      <AccountsView
        directory={directory}
        basePath="/my-class"
        category="students"
        classes={classes}
        searchParams={params}
        page={list.page}
        pageSize={PAGE_SIZE}
        canMessage={can(access, "messages.use")}
      />
    </>
  );
}
