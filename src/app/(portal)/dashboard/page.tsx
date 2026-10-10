import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { AttendanceSummary, GradeList, HomeworkDueList, LessonList } from "@/features/academic/components";
import { RegistrationNotice } from "@/features/auth/registration-notice";
import { getMyChildren, getStudentOverview, getTeacherToday } from "@/features/academic/queries";
import { getAdminDashboard } from "@/features/admin/dashboard-query";
import { SetupGuide } from "@/features/admin/setup-guide";
import { getSchoolFaces } from "@/features/dashboard/faces";
import { FacesRibbon } from "@/features/dashboard/faces-ribbon";
import { GreetingCard } from "@/features/dashboard/greeting-card";
import { Showcase, type ShowcaseCard } from "@/features/dashboard/showcase";
import { getLatestNews, getUpcomingEvents, getVisibleAnnouncements, publicMediaUrl } from "@/features/content/queries";
import { splitLeadImage } from "@/components/ui/misc";
import { markdownToPlainText } from "@/lib/content/markdown";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Alert, Card, CardBody, CardHeader, Metric } from "@/components/ui/surface";
import { can, canAny, canEnterAdmin, hasModule, hasRole } from "@/lib/auth/access";
import { getPortalSession } from "@/lib/auth/guards";
import { dayPart, formatDate, todayIso } from "@/lib/i18n/format";
import { pickText, type Locale } from "@/lib/i18n/text";
import { firstValue, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("dashboard") };
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await getPortalSession();
  const t = await getTranslations("portal.dashboard");

  // An unconfirmed address is a step, not a state to explain: there is one
  // screen for it and it is the only thing this person can usefully do.
  if (session.stage === "email_unconfirmed") redirect("/confirm-email");

  // An account left over from the days of self-registration still reaches this
  // page: the banner explains what is missing instead of bouncing the visitor
  // between forms that no longer exist.
  if (session.stage !== "member" || !session.access) {
    const supabase = await createClient();
    const { data: request } = await supabase
      .from("registration_requests")
      .select("status, rejection_reason, first_name")
      .eq("auth_user_id", session.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const stage: "profile_missing" | "pending" | "rejected" =
      session.stage === "member"
        ? "profile_missing"
        : session.stage === "profile_missing" && request && request.status !== "rejected"
          ? "pending"
          : session.stage;
    const name = session.access?.firstName ?? request?.first_name ?? "";
    return (
      <>
        <GreetingCard name={name} initialPart={dayPart()} />
        <RegistrationNotice stage={stage} rejectionReason={request?.rejection_reason} />
      </>
    );
  }

  const access = session.access;
  const locale = (await getLocale()) as Locale;
  const schoolId = access.school!.id;
  const today = todayIso(access.school?.timezone);
  const welcome = firstValue((await searchParams).welcome) === "1";

  const isStudent = hasRole(access, "student");
  const isParent = hasRole(access, "parent");
  const isTeaching = canAny(access, ["grades.enter", "attendance.mark"]);
  const showAdminSummary = canEnterAdmin(access) && canAny(access, ["students.view", "users.view", "reports.view"]) && !isTeaching;

  const showAnnouncements = hasModule(access, "announcements") && can(access, "announcements.view");
  const showNews = hasModule(access, "news") && can(access, "news.view");
  const [teacher, student, children, admin, announcements, events, news, faces] = await Promise.all([
    isTeaching ? getTeacherToday(today) : Promise.resolve(null),
    isStudent ? getStudentOverview(undefined, today) : Promise.resolve(null),
    isParent ? getMyChildren() : Promise.resolve([]),
    showAdminSummary ? getAdminDashboard() : Promise.resolve(null),
    showAnnouncements ? getVisibleAnnouncements(schoolId, 8) : Promise.resolve([]),
    hasModule(access, "events") && can(access, "events.view") ? getUpcomingEvents(schoolId, 8) : Promise.resolve([]),
    showNews ? getLatestNews(schoolId, 8) : Promise.resolve([]),
    getSchoolFaces(),
  ]);

  const firstChild = children[0];
  const childOverview = isParent && firstChild ? await getStudentOverview(firstChild.id, today) : null;
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay() || 7;
  const tc = await getTranslations("common");
  const tg = await getTranslations("portal.guardians");
  const { data: myGuardians, error: guardiansError } = student ? await (await createClient()).rpc("my_guardians") : { data: null, error: null };
  const guardiansMissing = Boolean(student) && !guardiansError && (myGuardians ?? []).length === 0;

  // The notice board's cards: the picture an announcement leads with (or the
  // first one in it), a news story's cover, the first words of each.
  const announcementCards: ShowcaseCard[] = announcements.map((item) => ({
    id: item.id,
    title: item.title,
    excerpt: markdownToPlainText(item.body, 140),
    image: splitLeadImage(item.body).lead?.src ?? null,
    href: `/announcements#a-${item.id}`,
    date: formatDate(item.publishAt, locale),
    tone: item.priority === "normal" ? null : item.priority,
  }));
  const newsCards: ShowcaseCard[] = news.map((item) => ({
    id: item.id,
    title: item.title,
    excerpt: item.summary?.trim() || markdownToPlainText(item.content, 140),
    image: item.coverImageUrl ?? splitLeadImage(item.content).lead?.src ?? null,
    href: `/news/${item.slug}`,
    date: item.publishAt ? formatDate(item.publishAt, locale) : "",
    tone: null,
  }));
  const eventCards: ShowcaseCard[] = events.map((item) => ({
    id: item.id,
    title: item.title,
    excerpt: [item.location, item.description ? markdownToPlainText(item.description, 120) : null].filter(Boolean).join(" · "),
    image: publicMediaUrl(item.imagePath),
    href: `/updates?type=event#e-${item.id}`,
    date: formatDate(item.startsAt, locale),
    tone: null,
  }));

  return (
    <>
      {faces && (faces.active.length > 0 || faces.graduates.length > 0) ? (
        <FacesRibbon
          active={faces.active}
          graduates={faces.graduates}
          labels={{ title: t("faces.title"), active: t("faces.active"), graduates: t("faces.graduates") }}
        />
      ) : null}

      <GreetingCard
        name={access.firstName}
        timeZone={access.school?.timezone}
        initialPart={dayPart(access.school?.timezone)}
        dateLine={`${tc(`weekdays.${weekday}`)}, ${formatDate(today, locale)}`}
        actions={
          canEnterAdmin(access) ? (
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/25 backdrop-blur-sm transition-colors hover:bg-white/20"
            >
              {t("openAdmin")}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : null
        }
      />

      {welcome ? <Alert tone="success" className="mb-5">{t("welcome")}</Alert> : null}

      {/* A pupil who has not named their parents yet is asked to (00081). */}
      {student && guardiansMissing ? (
        <Alert tone="warning" className="mb-4" actions={<Link href="/profile#guardians" className={buttonClasses("secondary", "sm")}>{tg("add")}</Link>}>
          {tg("missing")}
        </Alert>
      ) : null}

      {announcementCards.length > 0 || newsCards.length > 0 || eventCards.length > 0 ? (
        <Showcase announcements={announcementCards} news={newsCards} events={eventCards} />
      ) : null}

      {/* The side column is a pupil's attendance; without it the main column takes the width. */}
      <div className={student ? "grid gap-5 xl:grid-cols-3" : "grid gap-5"}>
        <div className={student ? "space-y-5 xl:col-span-2" : "space-y-5"}>
          {teacher ? (
            <Card>
              <CardHeader
                title={t("teacher.title")}
                description={t("teacher.description", { count: teacher.lessons.length })}
                actions={<Link href="/teach" className={buttonClasses("secondary", "sm")}>{t("teacher.open")}</Link>}
              />
              <CardBody>
                {teacher.homeroom_classes.filter((c) => !c.daily_attendance_marked).map((c) => (
                  <Alert key={c.class_id} tone="warning" className="mb-3" actions={
                    <Link href={`/teach/attendance?class=${c.class_id}&date=${today}`} className={buttonClasses("secondary", "sm")}>
                      {t("teacher.markDaily")}
                    </Link>
                  }>
                    {t("teacher.dailyPending", { className: c.class_name })}
                  </Alert>
                ))}
                {teacher.lessons.length === 0 ? (
                  <p className="text-sm text-ink-muted">{t("teacher.noLessons")}</p>
                ) : (
                  <ol className="divide-y divide-line">
                    {teacher.lessons.map((lesson) => (
                      <li key={lesson.timetable_entry_id} className="flex flex-wrap items-center gap-3 py-2.5">
                        <span className="w-10 text-sm font-semibold tabular">{lesson.period_number}</span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">
                            {lesson.class_name} · {pickText({ tg: lesson.subject_tg, ru: lesson.subject_ru, en: lesson.subject_en }, locale)}
                          </p>
                          <p className="text-sm text-ink-muted">
                            {[lesson.start_time?.slice(0, 5), lesson.room].filter(Boolean).join(" · ")}
                            {lesson.is_substitution ? ` · ${t("teacher.substitution")}` : ""}
                          </p>
                        </div>
                        {lesson.cancelled_for_me ? (
                          <Badge>{t("teacher.covered")}</Badge>
                        ) : lesson.attendance_marked ? (
                          <Badge tone="success" dot>{t("teacher.marked")}</Badge>
                        ) : (
                          <Link
                            href={`/teach/attendance?classSubject=${lesson.class_subject_id}&date=${today}&period=${lesson.period_number}`}
                            className={buttonClasses("primary", "sm")}
                          >
                            <ClipboardCheck aria-hidden />
                            {t("teacher.mark")}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
                {teacher.submissions_to_review > 0 ? (
                  <p className="mt-3 text-sm">
                    <Link href="/teach/homework" className="font-medium text-brand-text hover:underline">
                      {t("teacher.toReview", { count: teacher.submissions_to_review })}
                    </Link>
                  </p>
                ) : null}
              </CardBody>
            </Card>
          ) : null}

          {student ? (
            <>
              <Card>
                <CardHeader title={t("student.today")} description={student.student.class_name ?? undefined} />
                <CardBody>
                  <LessonList lessons={student.lessons} emptyLabel={t("student.noLessons")} />
                </CardBody>
              </Card>
              <div className="grid gap-5 lg:grid-cols-2">
                <Card>
                  <CardHeader title={t("student.homework")} actions={<Link href="/homework" className="text-sm font-medium text-brand-text hover:underline">{t("all")}</Link>} />
                  <CardBody><HomeworkDueList items={student.homework_due.slice(0, 5)} /></CardBody>
                </Card>
                <Card>
                  <CardHeader title={t("student.grades")} actions={<Link href="/grades" className="text-sm font-medium text-brand-text hover:underline">{t("all")}</Link>} />
                  <CardBody><GradeList grades={student.latest_grades.slice(0, 5)} /></CardBody>
                </Card>
              </div>
            </>
          ) : null}

          {isParent ? (
            <Card>
              <CardHeader title={t("parent.title")} actions={<Link href="/children" className="text-sm font-medium text-brand-text hover:underline">{t("all")}</Link>} />
              <CardBody>
                {children.length === 0 ? (
                  <p className="text-sm text-ink-muted">{t("parent.noChildren")}</p>
                ) : (
                  <>
                    <ul className="mb-4 flex flex-wrap gap-2">
                      {children.map((child) => (
                        <li key={child.id}>
                          <Link href={`/children/${child.id}`} className={buttonClasses("secondary", "sm")}>
                            {child.firstName} {child.lastName}
                            {child.className ? <span className="text-ink-muted">· {child.className}</span> : null}
                          </Link>
                        </li>
                      ))}
                    </ul>
                    {childOverview ? (
                      <div className="grid gap-5 lg:grid-cols-2">
                        <div>
                          <h3 className="mb-1 text-sm font-semibold">{t("parent.latestGrades", { name: childOverview.student.first_name })}</h3>
                          <GradeList grades={childOverview.latest_grades.slice(0, 4)} />
                        </div>
                        <div>
                          <h3 className="mb-1 text-sm font-semibold">{t("parent.attendance")}</h3>
                          <AttendanceSummary summary={childOverview.attendance_term} />
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </CardBody>
            </Card>
          ) : null}

          {admin ? <SetupGuide data={admin} /> : null}

          {admin ? (
            <Card>
              <CardHeader title={t("admin.title")} description={admin.academic_year ? t("admin.year", { year: admin.academic_year.name }) : undefined}
                actions={<Link href="/admin" className={buttonClasses("secondary", "sm")}>{t("openAdmin")}</Link>} />
              <CardBody>
                <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Metric label={t("admin.students")} value={admin.counts.students_active} href="/admin/accounts?category=students" />
                  <Metric label={t("admin.teachers")} value={admin.counts.teachers_active} href="/admin/accounts?category=teachers" />
                  <Metric label={t("admin.classes")} value={admin.counts.classes_active} href="/admin/classes" />
                  {/* Registration requests went with self-registration (00045). */}
                  <Metric label={t("admin.accounts")} value={admin.counts.accounts_active} href="/admin/accounts" />
                </dl>
              </CardBody>
            </Card>
          ) : null}
        </div>

        {student ? (
          <div className="space-y-5">
            <Card>
              <CardHeader title={t("student.attendance")} />
              <CardBody><AttendanceSummary summary={student.attendance_term} /></CardBody>
            </Card>
          </div>
        ) : null}
      </div>
    </>
  );
}
