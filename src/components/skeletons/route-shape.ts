/**
 * Which loading shape a page gets, from its address alone.
 *
 * The portal and the office each have one loading boundary, right under the
 * shell, so every page shows its loading screen in the same place. What that
 * screen looks like follows the page about to arrive: a profile's round photo
 * and the rows under it, a class's tiles, a journal's grid.
 *
 * Pure, so it is tested without a browser.
 */
export type RouteShape =
  | "dashboard"
  | "teach"
  | "roll"
  | "journal"
  | "table"
  | "directory"
  | "detail"
  | "form"
  | "import"
  | "profile"
  | "account"
  | "pupil"
  | "people"
  | "tiles"
  | "classroom"
  | "week"
  | "marks"
  | "stats"
  | "children"
  | "child"
  | "shelf"
  | "book"
  | "feed"
  | "article"
  | "files"
  | "list";

const ID = "[^/]+";

/** First match wins: the more particular addresses come before the general ones. */
const RULES: Array<[RegExp, RouteShape]> = [
  [/^\/dashboard$/, "dashboard"],
  [/^\/admin$/, "stats"],

  // Teaching.
  [/^\/teach$/, "teach"],
  [/^\/teach\/attendance$/, "roll"],
  [new RegExp(`^/teach/gradebook/${ID}$`), "journal"],
  [/^\/teach\/gradebook$/, "list"],
  [/^\/teach\/homework\/new$/, "form"],
  [new RegExp(`^/teach/homework/${ID}$`), "detail"],
  [/^\/teach\/homework$/, "table"],
  [new RegExp(`^/teach/pupils/${ID}$`), "pupil"],

  // A class teacher's own class.
  [/^\/my-class\/import$/, "import"],
  [/^\/my-class\/new$/, "form"],
  [new RegExp(`^/my-class/${ID}$`), "account"],
  [/^\/my-class$/, "people"],

  // A pupil's and a parent's day.
  [/^\/schedule$/, "week"],
  [/^\/grades$/, "marks"],
  [/^\/attendance$/, "stats"],
  [new RegExp(`^/homework/${ID}$`), "detail"],
  [/^\/homework$/, "table"],
  [new RegExp(`^/children/${ID}$`), "child"],
  [/^\/children$/, "children"],

  // Reading.
  [new RegExp(`^/library/${ID}$`), "book"],
  [/^\/library$/, "shelf"],
  [/^\/news\/(new|edit\/[^/]+)$/, "form"],
  [/^\/news\/mine$/, "table"],
  [new RegExp(`^/news/${ID}$`), "article"],
  [/^\/(updates|news|announcements|events)$/, "feed"],
  [/^\/documents$/, "files"],

  // People.
  [/^\/support\/contact$/, "form"],
  [/^\/friends$/, "people"],
  [/^\/notifications$/, "list"],
  [/^\/settings$/, "form"],
  [/^\/(profile|u)(\/[^/]+)?$/, "profile"],

  // The office.
  [/^\/admin\/(students|staff|subjects|timetable)\/import$/, "import"],
  [/^\/admin\/[^/]+\/new$/, "form"],
  [/^\/admin\/(accounts(\/parents)?|users|students|staff|guardians|parents)$/, "directory"],
  [new RegExp(`^/admin/(accounts|users|students|staff)/${ID}$`), "account"],
  [/^\/admin\/classes$/, "tiles"],
  [new RegExp(`^/admin/classes/${ID}$`), "classroom"],
  [/^\/admin\/timetable$/, "week"],
  [/^\/admin\/(settings|school|system)$/, "form"],
  [/^\/admin\/(analytics|reports)$/, "stats"],
  [/^\/admin\/media$/, "shelf"],
  [new RegExp(`^/admin/(news|announcements|library|roles)/${ID}$`), "form"],
  [/^\/admin\/.+$/, "table"],
];

export function routeShape(pathname: string | null | undefined): RouteShape {
  const path = (pathname ?? "/").replace(/\/+$/, "") || "/";
  for (const [pattern, shape] of RULES) {
    if (pattern.test(path)) return shape;
  }
  return "list";
}
