"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Heart, FileText, Headphones, Image, File } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toggleFavoriteAction } from "./actions";
import type { LibraryItem } from "./actions";

interface BookCardProps {
  item: LibraryItem;
}

function fileTypeIcon(type: string) {
  switch (type) {
    case "pdf":
      return <FileText className="h-10 w-10 text-rose-500" />;
    case "epub":
      return <FileText className="h-10 w-10 text-blue-500" />;
    case "audio":
      return <Headphones className="h-10 w-10 text-purple-500" />;
    case "image":
      return <Image className="h-10 w-10 text-emerald-500" />;
    default:
      return <File className="h-10 w-10 text-neutral-500" />;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BookCard({ item }: BookCardProps) {
  const t = useTranslations("library");

  return (
    <Card className="group relative overflow-hidden rounded-[24px] border border-neutral-200/70 bg-white/90 shadow-card transition-all duration-[var(--duration-normal)] hover:shadow-lg press-scale">
      <Link href={`/library/${item.id}`} className="block">
        <div className="relative flex h-48 items-center justify-center overflow-hidden bg-gradient-to-br from-[#EEF2F8] to-[#E2E8F0]">
          {item.coverUrl ? (
            <img
              src={item.coverUrl}
              alt={item.title}
              className="h-full w-full object-cover transition-transform duration-[var(--duration-slow)] group-hover:scale-105"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/90 shadow-2xs">
              {fileTypeIcon(item.fileType)}
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
        </div>

        <div className="p-4">
          <h3 className="line-clamp-2 text-sm font-bold text-neutral-900 tracking-tight leading-snug group-hover:text-primary-600 transition-colors">
            {item.title}
          </h3>
          {item.author && (
            <p className="mt-1 text-xs font-medium text-neutral-500 truncate">{item.author}</p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Badge variant="pill" className="text-[10px] font-bold">
              {t(item.fileType as "pdf" | "epub" | "audio" | "image" | "document")}
            </Badge>
            {item.categoryName && (
              <Badge variant="secondary" className="text-[10px] font-medium">
                {item.categoryName}
              </Badge>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-2 text-[11px] font-medium text-neutral-400">
            <span>{formatFileSize(item.fileSize)}</span>
            {item.language && <span className="uppercase text-[10px] font-bold text-neutral-500">{item.language}</span>}
          </div>
        </div>
      </Link>

      <form
        action={toggleFavoriteAction.bind(null, item.id, item.isFavorite)}
        className="absolute right-3 top-3 z-10"
      >
        <button
          type="submit"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur-md transition-all duration-[var(--duration-fast)] hover:scale-110 hover:bg-white press-scale cursor-pointer"
          aria-label={
            item.isFavorite ? t("removeFromFavorites") : t("addToFavorites")
          }
        >
          <Heart
            className={`h-4 w-4 transition-colors ${
              item.isFavorite
                ? "fill-rose-500 text-rose-500"
                : "text-neutral-400 hover:text-neutral-600"
            }`}
          />
        </button>
      </form>
    </Card>
  );
}
