import { createServerClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { canPerformAction } from "@/lib/modules/check";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Clock, ArrowLeft, BookOpen } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

interface HistoryEntry {
  id: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  fileType: string;
  lastPage: number;
  updatedAt: string;
}

export default async function ReadingHistoryPage() {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const canRead = await canPerformAction("library", "library.read");
  if (!canRead) redirect("/library");

  const t = await getTranslations("library");
  const supabase = await createServerClient();

  const { data } = await supabase
    .from("library_reading_history" as never)
    .select(
      "last_page, updated_at, library_items!inner(id, title, author, cover_url, file_type)" as never
    )
    .eq("user_id" as never, user.id)
    .order("updated_at" as never, { ascending: false });

  const entries: HistoryEntry[] = (
    (data as Array<Record<string, unknown>>) ?? []
  ).map((h) => {
    const item = h.library_items as Record<string, unknown>;
    return {
      id: item.id as string,
      title: item.title as string,
      author: item.author as string | null,
      coverUrl: item.cover_url as string | null,
      fileType: item.file_type as string,
      lastPage: h.last_page as number,
      updatedAt: h.updated_at as string,
    };
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div className="flex items-center gap-3">
        <Link
          href="/library"
          className="inline-flex items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-800"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-2xl font-bold text-neutral-900">
          {t("readingHistory")}
        </h1>
      </div>

      {entries.length > 0 ? (
        <div className="space-y-3">
          {entries.map((entry) => (
            <Link key={entry.id} href={`/library/${entry.id}`}>
              <Card className="flex items-center gap-4 p-4 transition-shadow hover:shadow-md">
                <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded bg-neutral-100">
                  {entry.coverUrl ? (
                    <img
                      src={entry.coverUrl}
                      alt={entry.title}
                      className="h-full w-full rounded object-cover"
                    />
                  ) : (
                    <BookOpen className="h-5 w-5 text-neutral-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-800">
                    {entry.title}
                  </p>
                  {entry.author && (
                    <p className="text-xs text-neutral-500">{entry.author}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <Badge variant="secondary" className="text-[10px]">
                    {t("page")} {entry.lastPage}
                  </Badge>
                  <p className="mt-1 text-[10px] text-neutral-400">
                    {new Date(entry.updatedAt).toLocaleDateString()}
                  </p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Clock className="h-12 w-12" />}
          title={t("noHistory")}
          description={t("noHistoryDesc")}
        />
      )}
    </div>
  );
}
