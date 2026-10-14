import { NextResponse } from "next/server";
import { adminNavigation, portalNavigation, showAdminLink } from "@/components/shell/navigation";
import { myHomeroomClasses } from "@/features/accounts/queries";
import { getMyChildren } from "@/features/academic/queries";
import { getMyClassSubjects } from "@/features/teach/queries";
import { getAccess, can, hasRole } from "@/lib/auth/access";
import { BUILD } from "@/lib/build";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Enough for a whole office; a list longer than this is a school, not a person. */
const MOST = 120;

/**
 * Every page this person can open, for the phone to install at once after
 * signing in (page-installer.tsx): the menu, the office if they have one,
 * and the pages a tap away from it — each journal of a teacher, each child
 * of a parent. With `build`, so a phone holding an older version of the
 * site knows to take the new one.
 */
export async function GET() {
  const access = await getAccess();
  if (!access) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const pages: string[] = [];
  const add = (href: string) => {
    if (!pages.includes(href) && pages.length < MOST) pages.push(href);
  };

  // The menu first: what is tapped most is there soonest.
  for (const item of portalNavigation(access)) add(item.href);
  add("/notifications");
  add("/profile");
  add("/settings");

  const teaches = can(access, "grades.enter") || can(access, "attendance.mark") || can(access, "homework.create");
  const [classSubjects, homeroom, children] = await Promise.all([
    teaches ? getMyClassSubjects(access.userId, "tg").catch(() => []) : Promise.resolve([]),
    teaches ? myHomeroomClasses(access).catch(() => []) : Promise.resolve([]),
    hasRole(access, "parent") ? getMyChildren().catch(() => []) : Promise.resolve([]),
  ]);
  if (teaches) {
    add("/teach/gradebook");
    add("/teach/attendance");
    add("/teach/homework");
    for (const cs of classSubjects) add(`/teach/gradebook/${cs.id}`);
  }
  if (homeroom.length > 0) add("/my-class");
  for (const child of children) add(`/children/${child.id}`);

  if (showAdminLink(access)) {
    for (const group of adminNavigation(access)) for (const item of group.items) add(item.href);
  }

  return NextResponse.json({ build: BUILD, pages }, { headers: { "Cache-Control": "no-store" } });
}
