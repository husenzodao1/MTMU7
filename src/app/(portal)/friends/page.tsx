import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Users } from "lucide-react";
import { respondFriendRequestAction, sendFriendRequestAction } from "@/features/profile/actions";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { FilterBar } from "@/components/ui/filters";
import { Avatar, TabNav } from "@/components/ui/misc";
import { Card, CardBody, EmptyState, PageHeader } from "@/components/ui/surface";
import { requireModule } from "@/lib/auth/guards";
import { firstValue, ilikeAny, type SearchParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

const VIEWS = ["friends", "incoming", "outgoing", "find"] as const;
type View = (typeof VIEWS)[number];

interface Person {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("contacts") };
}

export default async function FriendsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requireModule("friends");
  const t = await getTranslations("portal.friends");
  const params = await searchParams;
  const viewRaw = firstValue(params.view);
  const view: View = VIEWS.includes(viewRaw as View) ? (viewRaw as View) : "friends";
  const query = (firstValue(params.q) ?? "").trim().slice(0, 60);
  const supabase = await createClient();

  const { data: requests } = await supabase
    .from("friend_requests")
    .select("id, sender_id, receiver_id, status, sender:users!friend_requests_sender_id_fkey(id, first_name, last_name, avatar_url), receiver:users!friend_requests_receiver_id_fkey(id, first_name, last_name, avatar_url)")
    .in("status", ["pending", "accepted"])
    .order("updated_at", { ascending: false })
    .limit(500);

  const rows = (requests ?? []).map((r) => {
    const mine = r.sender_id === access.userId;
    return { id: r.id, status: r.status, mine, person: (mine ? r.receiver : r.sender) as unknown as Person | null };
  });
  const friends = rows.filter((r) => r.status === "accepted");
  const incoming = rows.filter((r) => r.status === "pending" && !r.mine);
  const outgoing = rows.filter((r) => r.status === "pending" && r.mine);
  const related = new Set(rows.map((r) => r.person?.id));

  let found: Person[] = [];
  if (view === "find") {
    const search = ilikeAny(["first_name", "last_name"], query);
    if (search && query.length >= 2) {
      const { data } = await supabase
        .from("users")
        .select("id, first_name, last_name, avatar_url")
        .eq("school_id", access.school!.id)
        .eq("is_active", true)
        .eq("status", "active")
        .neq("id", access.userId)
        .or(search)
        .order("last_name")
        .limit(30);
      found = data ?? [];
    }
  }

  const list = { friends, incoming, outgoing }[view as "friends" | "incoming" | "outgoing"] ?? [];

  const personLine = (person: Person | null) => (
    <Link href={person ? `/profile/${person.id}` : "#"} className="flex min-w-0 flex-1 items-center gap-3 hover:underline">
      <Avatar name={person ? `${person.first_name} ${person.last_name}` : "?"} src={person?.avatar_url} />
      <span className="truncate font-medium text-ink">{person ? `${person.last_name} ${person.first_name}` : t("unknown")}</span>
    </Link>
  );

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <TabNav
        label={t("views")}
        items={VIEWS.map((v) => ({
          href: v === "friends" ? "/friends" : `/friends?view=${v}`,
          label: t(`view.${v}`),
          active: v === view,
          count: v === "incoming" ? incoming.length : v === "friends" ? friends.length : undefined,
        }))}
      />

      {view === "find" ? (
        <>
          <FilterBar searchLabel={t("search")} />
          {query.length < 2 ? (
            <Card as="div"><EmptyState icon={<Users />} title={t("searchHint")} /></Card>
          ) : found.length === 0 ? (
            <Card as="div"><EmptyState icon={<Users />} title={t("noResults")} /></Card>
          ) : (
            <Card as="div">
              <ul className="divide-y divide-line">
                {found.map((person) => (
                  <li key={person.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    {personLine(person)}
                    {related.has(person.id) ? (
                      <span className="text-sm text-ink-muted">{t("alreadyConnected")}</span>
                    ) : (
                      <ActionForm action={sendFriendRequestAction}>
                        <input type="hidden" name="userId" value={person.id} />
                        <SubmitButton size="sm" variant="secondary">{t("add")}</SubmitButton>
                      </ActionForm>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      ) : list.length === 0 ? (
        <Card as="div">
          <EmptyState icon={<Users />} title={t(`empty.${view}`)} />
        </Card>
      ) : (
        <Card as="div">
          <CardBody className="p-0">
            <ul className="divide-y divide-line">
              {list.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  {personLine(row.person)}
                  <div className="flex gap-2">
                    {view === "incoming" ? (
                      <>
                        <ActionForm action={respondFriendRequestAction}>
                          <input type="hidden" name="requestId" value={row.id} />
                          <input type="hidden" name="decision" value="accept" />
                          <SubmitButton size="sm">{t("accept")}</SubmitButton>
                        </ActionForm>
                        <ActionForm action={respondFriendRequestAction}>
                          <input type="hidden" name="requestId" value={row.id} />
                          <input type="hidden" name="decision" value="reject" />
                          <SubmitButton size="sm" variant="secondary">{t("decline")}</SubmitButton>
                        </ActionForm>
                      </>
                    ) : (
                      <ActionForm action={respondFriendRequestAction}>
                        <input type="hidden" name="requestId" value={row.id} />
                        <input type="hidden" name="decision" value={view === "outgoing" ? "cancel" : "remove"} />
                        <SubmitButton size="sm" variant="ghost">{view === "outgoing" ? t("cancelRequest") : t("remove")}</SubmitButton>
                      </ActionForm>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </>
  );
}
