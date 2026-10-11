"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { routeShape, type RouteShape } from "@/components/skeletons/route-shape";
import { cn } from "@/lib/utils/cn";

/*
 * The loading screen of every page, in the shape of the page about to
 * arrive (route-shape.ts picks which). Built from a handful of pieces that
 * are the real page's pieces with the words taken out: the same cards, the
 * same rows, round where a photo goes. One light passes over all of them
 * (.bone in globals.css).
 */

const widths = ["w-2/5", "w-1/3", "w-1/2", "w-2/5", "w-3/5", "w-1/4", "w-1/2", "w-1/3"];
const pick = (i: number) => widths[i % widths.length]!;
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

function B({ className }: { className?: string }) {
  return <div className={cn("bone rounded-md", className)} aria-hidden />;
}

function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border border-line bg-surface shadow-xs", className)}>{children}</div>;
}

function Head({ crumbs = false, actions = 0, description = true }: { crumbs?: boolean; actions?: number; description?: boolean }) {
  return (
    <div className="mb-5 sm:mb-6">
      {crumbs ? <B className="mb-3 h-3 w-40" /> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <B className="h-6 w-44 sm:w-60" />
          {description ? <B className="h-3.5 w-56 max-w-[70vw] sm:w-80" /> : null}
        </div>
        {actions > 0 ? (
          <div className="flex gap-2">
            {range(actions).map((i) => (
              <B key={i} className="h-9 w-24 rounded-lg sm:w-32" />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CardHead({ action = false }: { action?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
      <B className="h-4 w-32" />
      {action ? <B className="h-8 w-20 rounded-lg" /> : null}
    </div>
  );
}

function Metrics({ n = 3 }: { n?: number }) {
  return (
    <div className={cn("grid gap-3", n === 4 ? "grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3")}>
      {range(n).map((i) => (
        <Frame key={i} className="p-4">
          <B className="h-3.5 w-24" />
          <B className="mt-3 h-7 w-12" />
        </Frame>
      ))}
    </div>
  );
}

function Rows({
  n = 6,
  lead,
  lines = 2,
  action = false,
}: {
  n?: number;
  lead?: "avatar" | "icon" | "number" | "time";
  lines?: 1 | 2;
  action?: boolean;
}) {
  return (
    <ul className="divide-y divide-line">
      {range(n).map((i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3 sm:px-5">
          {lead === "avatar" ? <B className="size-10 shrink-0 rounded-full" /> : null}
          {lead === "icon" ? <B className="size-9 shrink-0 rounded-lg" /> : null}
          {lead === "number" ? <B className="h-4 w-5 shrink-0" /> : null}
          {lead === "time" ? (
            <span className="w-[5.5rem] shrink-0 space-y-1.5">
              <B className="h-3.5 w-14" />
              <B className="h-3 w-20" />
            </span>
          ) : null}
          <span className="min-w-0 flex-1 space-y-2">
            <B className={cn("h-4", pick(i))} />
            {lines === 2 ? <B className={cn("h-3", pick(i + 3))} /> : null}
          </span>
          {action ? <B className="h-8 w-24 shrink-0 rounded-lg" /> : null}
        </li>
      ))}
    </ul>
  );
}

function ListCard({ n = 6, lead, lines = 2, action = false, head = true }: Parameters<typeof Rows>[0] & { head?: boolean }) {
  return (
    <Frame>
      {head ? <CardHead /> : null}
      <Rows n={n} lead={lead} lines={lines} action={action} />
    </Frame>
  );
}

function Table({ rows = 8, cols = 4, lead }: { rows?: number; cols?: number; lead?: "avatar" }) {
  return (
    <Frame className="overflow-hidden">
      <div className="flex gap-4 border-b border-line bg-surface-muted/60 px-4 py-3 sm:px-5">
        {range(cols).map((i) => (
          <B key={i} className={cn("h-3", i === 0 ? "w-28 flex-[2]" : "w-16 flex-1", i > 1 && "hidden sm:block")} />
        ))}
      </div>
      <ul className="divide-y divide-line">
        {range(rows).map((r) => (
          <li key={r} className="flex items-center gap-4 px-4 py-3.5 sm:px-5">
            <span className="flex flex-[2] items-center gap-3">
              {lead === "avatar" ? <B className="size-8 shrink-0 rounded-full" /> : null}
              <B className={cn("h-4", pick(r + 2))} />
            </span>
            {range(cols - 1).map((c) => (
              <B key={c} className={cn("h-3.5 flex-1", c > 0 && "hidden sm:block")} />
            ))}
          </li>
        ))}
      </ul>
    </Frame>
  );
}

function Chips({ n = 4 }: { n?: number }) {
  return (
    <div className="mb-4 flex gap-2 overflow-hidden">
      {range(n).map((i) => (
        <B key={i} className="h-8 w-20 shrink-0 rounded-full" />
      ))}
    </div>
  );
}

function Tabs({ n = 2 }: { n?: number }) {
  return (
    <div className="mb-4 flex gap-4 border-b border-line pb-2.5">
      {range(n).map((i) => (
        <B key={i} className="h-4 w-20" />
      ))}
    </div>
  );
}

function Form({ fields = 6, head = true }: { fields?: number; head?: boolean }) {
  return (
    <Frame className="max-w-3xl">
      {head ? <CardHead /> : null}
      <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
        {range(fields).map((i) => (
          <div key={i} className={cn("space-y-2", i % 3 === 2 && "sm:col-span-2")}>
            <B className="h-3.5 w-24" />
            <B className={cn("w-full rounded-lg", i % 3 === 2 ? "h-24" : "h-10")} />
          </div>
        ))}
        <B className="h-10 w-32 rounded-lg" />
      </div>
    </Frame>
  );
}

function Paragraphs({ n = 5 }: { n?: number }) {
  return (
    <div className="space-y-2.5">
      {range(n).map((i) => (
        <B key={i} className={cn("h-3.5", i === n - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

/** A person: the round photo, the name under it, and the line beneath. */
function PersonCard({ banner = false }: { banner?: boolean }) {
  return (
    <Frame className="overflow-hidden">
      {banner ? <B className="h-24 rounded-none sm:h-28" /> : null}
      <div className={cn("flex items-center gap-4 p-4 sm:p-5", banner && "-mt-12 items-end")}>
        <B className={cn("shrink-0 rounded-full", banner ? "size-24 ring-4 ring-surface" : "size-16")} />
        <span className="min-w-0 flex-1 space-y-2 pb-1">
          <B className="h-5 w-48 max-w-full" />
          <B className="h-3.5 w-28" />
        </span>
      </div>
    </Frame>
  );
}

function Dashboard() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        {range(2).map((card) => (
          <Frame key={card} className="overflow-hidden px-4 py-3">
            <B className="mx-auto h-2.5 w-28" />
            <div className="mt-3 flex justify-center gap-3 overflow-hidden">
              {range(8).map((i) => (
                <span key={i} className="flex shrink-0 flex-col items-center gap-1.5">
                  <B className="size-10 rounded-full" />
                  <B className="h-2 w-9" />
                </span>
              ))}
            </div>
          </Frame>
        ))}
      </div>
      <B className="h-44 rounded-2xl sm:h-56" />
      <ListCard n={5} lead="time" action />
    </div>
  );
}

function Teach() {
  return (
    <>
      <Head />
      <div className="space-y-5">
        <Metrics />
        <div className="grid gap-5 lg:grid-cols-2">
          <ListCard n={5} lead="time" action />
          <ListCard n={3} />
        </div>
        <ListCard n={6} lines={1} action />
      </div>
    </>
  );
}

function Roll() {
  return (
    <>
      <Head crumbs actions={1} />
      <div className="mb-3 flex items-center justify-between gap-3">
        <B className="h-3.5 w-64 max-w-[60%]" />
        <B className="h-8 w-40 rounded-lg" />
      </div>
      <Frame>
        <ul className="divide-y divide-line">
          {range(9).map((i) => (
            <li key={i} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
              <B className="h-4 w-5" />
              <B className={cn("h-4 min-w-32 flex-1", pick(i))} />
              <span className="grid w-full grid-cols-4 gap-1.5 sm:w-auto lg:w-[26rem]">
                {range(4).map((k) => (
                  <B key={k} className="h-10 rounded-md" />
                ))}
              </span>
            </li>
          ))}
        </ul>
      </Frame>
    </>
  );
}

function Journal() {
  return (
    <>
      <Head crumbs />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Frame>
          <CardHead />
          <div className="overflow-hidden p-4 sm:p-5">
            {range(12).map((r) => (
              <div key={r} className="flex items-center gap-1.5 border-b border-line py-1.5">
                <B className={cn("h-3.5 w-36 shrink-0", r === 0 && "h-10")} />
                {range(8).map((c) => (
                  <B key={c} className={cn("size-8 shrink-0 rounded", r === 0 && "h-10", c > 4 && "hidden sm:block")} />
                ))}
              </div>
            ))}
          </div>
        </Frame>
        <div className="space-y-5">
          <Form fields={3} />
          <Form fields={3} />
        </div>
      </div>
    </>
  );
}

function Detail() {
  return (
    <>
      <Head crumbs />
      <div className="grid gap-5 lg:grid-cols-3">
        <Frame className="lg:col-span-2">
          <CardHead />
          <div className="p-4 sm:p-5">
            <Paragraphs n={6} />
          </div>
        </Frame>
        <Frame>
          <CardHead />
          <div className="space-y-3 p-4 sm:p-5">
            <B className="h-4 w-1/2" />
            <B className="h-24 rounded-lg" />
            <B className="h-10 rounded-lg" />
          </div>
        </Frame>
      </div>
    </>
  );
}

function Import() {
  return (
    <>
      <Head crumbs />
      <Frame className="p-4 sm:p-5">
        <div className="mb-5 flex gap-2">
          {range(3).map((i) => (
            <B key={i} className="h-8 w-28 rounded-md" />
          ))}
        </div>
        <Paragraphs n={2} />
        <B className="mt-5 h-28 rounded-lg" />
        <div className="mt-5 flex gap-2">
          <B className="h-10 w-40 rounded-lg" />
          <B className="h-10 w-36 rounded-lg" />
        </div>
      </Frame>
    </>
  );
}

function Profile() {
  return (
    <>
      <div className="space-y-5">
        <PersonCard banner />
        <div className="grid gap-5 lg:grid-cols-2">
          <ListCard n={4} lines={2} />
          <Form fields={4} />
        </div>
      </div>
    </>
  );
}

/** An account in the office: the round photo first, then the cards under it. */
function Account() {
  return (
    <>
      <Head crumbs actions={2} />
      <div className="space-y-5">
        <PersonCard />
        <Frame className="p-4 sm:p-5">
          <B className="h-4 w-40" />
          <B className="mt-3 h-10 w-full rounded-lg" />
        </Frame>
        <Form fields={6} />
      </div>
    </>
  );
}

function Pupil() {
  return (
    <>
      <Head crumbs />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Frame>
          <CardHead />
          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
            {range(2).map((i) => (
              <div key={i} className="space-y-2 rounded-lg border border-line p-4">
                <B className="h-3 w-14" />
                <B className="h-4 w-3/4" />
                <B className="h-3.5 w-2/3" />
                <B className="h-3.5 w-1/2" />
              </div>
            ))}
          </div>
        </Frame>
        <Form fields={2} />
      </div>
    </>
  );
}

function People() {
  return (
    <>
      <Head actions={2} />
      <div className="space-y-5">
        <Metrics />
        <ListCard n={8} lead="avatar" action />
      </div>
    </>
  );
}

function Tiles() {
  return (
    <>
      <Head actions={1} />
      <div className="space-y-6">
        {range(4).map((g) => (
          <div key={g}>
            <B className="mb-2.5 h-3 w-20" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
              {range(g % 2 === 0 ? 2 : 3).map((i) => (
                <Frame key={i} className="space-y-3 p-3">
                  <div className="flex items-center justify-between">
                    <B className="h-6 w-10" />
                    <B className="h-3 w-8" />
                  </div>
                  <B className="h-3 w-4/5" />
                </Frame>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Classroom() {
  return (
    <>
      <Head crumbs actions={1} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <ListCard n={10} lead="number" lines={1} action />
        <div className="space-y-5">
          <Form fields={1} />
          <Form fields={1} />
          <ListCard n={4} />
        </div>
      </div>
    </>
  );
}

function Week() {
  return (
    <>
      <Head actions={1} />
      <Frame className="overflow-hidden p-3 sm:p-4">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {range(6).map((d) => (
            <div key={d} className={cn("space-y-2", d > 2 && "hidden sm:block")}>
              <B className="h-4 w-16" />
              {range(5).map((p) => (
                <B key={p} className="h-14 rounded-lg" />
              ))}
            </div>
          ))}
        </div>
      </Frame>
    </>
  );
}

function Marks() {
  return (
    <>
      <Head actions={1} />
      <Tabs n={1} />
      <div className="grid gap-4 lg:grid-cols-2">
        {range(4).map((i) => (
          <Frame key={i}>
            <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
              <span className="space-y-2">
                <B className={cn("h-4", i % 2 ? "w-32" : "w-40")} />
                <B className="h-3 w-36" />
              </span>
              <B className="h-6 w-24 rounded-md" />
            </div>
            <div className="flex flex-wrap gap-2 p-4">
              {range(5 - (i % 3)).map((k) => (
                <B key={k} className="h-14 w-12 rounded-lg" />
              ))}
            </div>
          </Frame>
        ))}
      </div>
    </>
  );
}

function Stats() {
  return (
    <>
      <Head />
      <div className="space-y-5">
        <Metrics n={4} />
        <div className="grid gap-5 lg:grid-cols-2">
          <Frame>
            <CardHead />
            <div className="flex h-48 items-end gap-2 p-5">
              {["h-2/5", "h-3/5", "h-1/2", "h-5/6", "h-3/5", "h-3/4", "h-2/5"].map((height, i) => (
                <B key={i} className={cn("flex-1 rounded-t-md rounded-b-none", height)} />
              ))}
            </div>
          </Frame>
          <ListCard n={5} />
        </div>
      </div>
    </>
  );
}

function Children() {
  return (
    <>
      <Head />
      <div className="grid gap-4 sm:grid-cols-2">
        {range(2).map((i) => (
          <Frame key={i} className="flex items-center gap-4 p-4">
            <B className="size-14 shrink-0 rounded-full" />
            <span className="flex-1 space-y-2">
              <B className="h-5 w-40" />
              <B className="h-3.5 w-20" />
            </span>
          </Frame>
        ))}
      </div>
    </>
  );
}

function Child() {
  return (
    <div className="space-y-5">
      <PersonCard />
      <Metrics n={4} />
      <div className="grid gap-5 lg:grid-cols-2">
        <ListCard n={5} lead="time" />
        <ListCard n={5} />
      </div>
    </div>
  );
}

function Shelf() {
  return (
    <>
      <Head />
      <B className="mb-5 h-10 w-full max-w-md rounded-lg" />
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {range(10).map((i) => (
          <li key={i} className="space-y-2">
            <B className="aspect-[3/4] rounded-lg" />
            <B className={cn("h-4", i % 2 ? "w-3/4" : "w-full")} />
            <B className="h-3 w-1/2" />
          </li>
        ))}
      </ul>
    </>
  );
}

function Book() {
  return (
    <>
      <Head crumbs description={false} />
      <div className="grid gap-6 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <B className="aspect-[3/4] w-40 rounded-lg sm:w-full" />
        <div className="space-y-3">
          <B className="h-6 w-3/4" />
          <B className="h-4 w-1/3" />
          <Paragraphs n={5} />
          <B className="h-10 w-40 rounded-lg" />
        </div>
      </div>
    </>
  );
}

function Feed() {
  return (
    <>
      <Head />
      <Chips n={4} />
      <div className="space-y-4">
        {range(4).map((i) => (
          <Frame key={i} className="flex gap-4 p-4">
            <B className="hidden size-24 shrink-0 rounded-lg sm:block" />
            <span className="min-w-0 flex-1 space-y-2.5">
              <B className="h-3 w-24" />
              <B className={cn("h-5", pick(i + 4))} />
              <B className="h-3.5 w-full" />
              <B className="h-3.5 w-2/3" />
            </span>
          </Frame>
        ))}
      </div>
    </>
  );
}

function Article() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <B className="h-3 w-40" />
      <B className="h-8 w-4/5" />
      <B className="h-3.5 w-1/3" />
      <B className="h-56 rounded-xl sm:h-72" />
      <Paragraphs n={8} />
    </div>
  );
}

function Chat() {
  return (
    <Frame className="flex h-[calc(100dvh-9.5rem)] min-h-[24rem] overflow-hidden lg:h-[calc(100dvh-7.5rem)]">
      <div className="w-full shrink-0 border-line md:w-80 md:border-e">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <B className="h-5 w-24" />
          <B className="size-8 rounded-full" />
        </div>
        <Rows n={7} lead="avatar" />
      </div>
      <div className="hidden min-w-0 flex-1 flex-col md:flex">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <B className="size-9 rounded-full" />
          <B className="h-4 w-36" />
        </div>
        <div className="flex-1 space-y-3 p-4">
          {range(6).map((i) => (
            <div key={i} className={cn("flex", i % 2 ? "justify-end" : "justify-start")}>
              <B className={cn("h-10 rounded-2xl", i % 3 === 0 ? "w-1/2" : i % 3 === 1 ? "w-1/3" : "w-2/5")} />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 border-t border-line p-3">
          <B className="h-10 flex-1 rounded-full" />
          <B className="size-10 rounded-full" />
        </div>
      </div>
    </Frame>
  );
}

const SHAPES: Record<RouteShape, () => ReactNode> = {
  dashboard: Dashboard,
  teach: Teach,
  roll: Roll,
  journal: Journal,
  table: () => (
    <>
      <Head actions={1} />
      <Tabs />
      <Table />
    </>
  ),
  directory: () => (
    <>
      <Head actions={2} />
      <Chips n={7} />
      <Table rows={9} lead="avatar" />
    </>
  ),
  detail: Detail,
  form: () => (
    <>
      <Head crumbs description={false} />
      <Form />
    </>
  ),
  import: Import,
  profile: Profile,
  account: Account,
  pupil: Pupil,
  people: People,
  tiles: Tiles,
  classroom: Classroom,
  week: Week,
  marks: Marks,
  stats: Stats,
  children: Children,
  child: Child,
  shelf: Shelf,
  book: Book,
  feed: Feed,
  article: Article,
  files: () => (
    <>
      <Head actions={1} />
      <ListCard n={7} lead="icon" head={false} />
    </>
  ),
  chat: Chat,
  list: () => (
    <>
      <Head />
      <ListCard n={7} lead="icon" />
    </>
  ),
};

/** The loading screen for whichever page is on its way. */
export function RouteSkeleton() {
  const pathname = usePathname();
  const t = useTranslations("common");
  const Shape = SHAPES[routeShape(pathname)];
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t("loading")}</span>
      <Shape />
    </div>
  );
}
