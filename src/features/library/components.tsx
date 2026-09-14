import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface BookCardItem {
  id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  file_type: string | null;
  publication_year: number | null;
  is_featured: boolean;
  available_quantity: number;
  quantity: number;
}

export async function BookGrid({ items }: { items: BookCardItem[] }) {
  const t = await getTranslations("portal.library");
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((book) => (
        <li key={book.id}>
          <Link href={`/library/${book.id}`} className="group flex h-full flex-col rounded-xl border border-line bg-surface p-3 shadow-xs hover:border-brand-300 focus-visible:border-brand-600">
            <div className="mb-3 flex aspect-[3/4] items-center justify-center overflow-hidden rounded-md bg-surface-muted">
              {book.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- cover served through a short-lived signed URL
                <img src={`/files/covers/${book.id}`} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <BookOpen className="size-10 text-ink-muted" aria-hidden />
              )}
            </div>
            <p className="line-clamp-2 font-medium leading-snug text-ink group-hover:text-brand-700">{book.title}</p>
            {book.author ? <p className="mt-0.5 line-clamp-1 text-sm text-ink-secondary">{book.author}</p> : null}
            <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
              {book.file_type ? <Badge tone="brand">{t(`fileTypes.${book.file_type}`)}</Badge> : null}
              {book.quantity > 0 ? (
                <Badge tone={book.available_quantity > 0 ? "success" : "neutral"}>
                  {book.available_quantity > 0 ? t("onShelf") : t("allOnLoan")}
                </Badge>
              ) : null}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
