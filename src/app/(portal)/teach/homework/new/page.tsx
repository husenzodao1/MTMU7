import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { AssignmentForm } from "@/features/teach/assignment-form";
import { getMyClassSubjects } from "@/features/teach/queries";
import { Breadcrumb, Card, CardBody, EmptyState, PageHeader } from "@/components/ui/surface";
import { requirePermission } from "@/lib/auth/guards";
import type { Locale } from "@/lib/i18n/text";
import { firstValue, type SearchParams } from "@/lib/list-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("teach.homework");
  return { title: t("new") };
}

export default async function NewAssignmentPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requirePermission("homework.create");
  const t = await getTranslations("teach.homework");
  const tt = await getTranslations("teach");
  const locale = (await getLocale()) as Locale;
  const classSubjects = await getMyClassSubjects(access.userId, locale);
  const preselected = firstValue((await searchParams).classSubject);

  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumb label={tt("breadcrumb")} items={[{ label: tt("title"), href: "/teach" }, { label: t("title"), href: "/teach/homework" }, { label: t("new") }]} />}
        title={t("new")}
      />
      <Card className="max-w-3xl">
        <CardBody>
          {classSubjects.length === 0 ? (
            <EmptyState title={tt("noClasses")} description={tt("noClassesHint")} />
          ) : (
            <AssignmentForm
              assignment={null}
              classSubjects={classSubjects.map((cs) => ({ value: cs.id, label: cs.label }))}
              defaultClassSubjectId={classSubjects.some((cs) => cs.id === preselected) ? preselected : undefined}
              uploadFolder={`${access.school!.id}/${access.userId}`}
            />
          )}
        </CardBody>
      </Card>
    </>
  );
}
