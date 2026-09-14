import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AttendanceSummary, GradeList, HomeworkDueList, LessonList } from "@/features/academic/components";
import { getMyChildren, getStudentOverview } from "@/features/academic/queries";
import { Breadcrumb, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/surface";
import { buttonClasses } from "@/components/ui/button";
import { requireAccess } from "@/lib/auth/guards";
import { todayIso } from "@/lib/i18n/format";

export const metadata: Metadata = { robots: { index: false } };

export default async function ChildPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireAccess();
  const { id } = await params;
  const children = await getMyChildren();
  const child = children.find((c) => c.id === id);
  if (!child) notFound();

  const t = await getTranslations("portal.children");
  const td = await getTranslations("portal.dashboard");
  const overview = await getStudentOverview(child.id, todayIso(access.school?.timezone));
  if (!overview) notFound();
  const q = `?child=${child.id}`;

  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumb label={t("breadcrumb")} items={[{ label: t("title"), href: "/children" }, { label: `${child.firstName} ${child.lastName}` }]} />}
        title={`${child.firstName} ${child.lastName}`}
        description={child.className ? t("class", { name: child.className }) : t("noClass")}
        actions={
          <>
            <Link className={buttonClasses("secondary", "sm")} href={`/grades${q}`}>{t("allGrades")}</Link>
            <Link className={buttonClasses("secondary", "sm")} href={`/attendance${q}`}>{t("allAttendance")}</Link>
            <Link className={buttonClasses("secondary", "sm")} href={`/homework${q}`}>{t("allHomework")}</Link>
          </>
        }
      />
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader title={td("student.today")} />
            <CardBody><LessonList lessons={overview.lessons} emptyLabel={td("student.noLessons")} /></CardBody>
          </Card>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title={td("student.homework")} />
              <CardBody><HomeworkDueList items={overview.homework_due} hrefBase="/homework" /></CardBody>
            </Card>
            <Card>
              <CardHeader title={td("student.grades")} />
              <CardBody><GradeList grades={overview.latest_grades} /></CardBody>
            </Card>
          </div>
        </div>
        <Card>
          <CardHeader title={td("student.attendance")} />
          <CardBody><AttendanceSummary summary={overview.attendance_term} /></CardBody>
        </Card>
      </div>
    </>
  );
}
