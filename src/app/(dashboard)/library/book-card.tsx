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
      return <FileText className="h-8 w-8 text-red-400" />;
    case "epub":
      return <FileText className="h-8 w-8 text-blue-400" />;
    case "audio":
      return <Headphones className="h-8 w-8 text-purple-400" />;
    case "image":
      return <Image className="h-8 w-8 text-green-400" />;
    default:
      return <File className="h-8 w-8 text-neutral-400" />;
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
    <Card className="group relative overflow-hidden transition-shadow hover:shadow-md press-scale">
      <Link href={`/library/${item.id}`} className="block">
        <div className="flex h-40 items-center justify-center bg-neutral-50">
          {item.coverUrl ? (
            <img
              src={item.coverUrl}
              alt={item.title}
              className="h-full w-full object-cover"
            />
          ) : (
            fileTypeIcon(item.fileType)
          )}
        </div>
        <div className="p-3">
          <h3 className="line-clamp-2 text-sm font-medium text-neutral-800">
            {item.title}
          </h3>
          {item.author && (
            <p className="mt-0.5 text-xs text-neutral-500">{item.author}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            <Badge variant="secondary" className="text-[10px]">
              {t(item.fileType as "pdf" | "epub" | "audio" | "image" | "document")}
            </Badge>
            {item.categoryName && (
              <Badge variant="outline" className="text-[10px]">
                {item.categoryName}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-[10px] text-neutral-400">
            {formatFileSize(item.fileSize)}
          </p>
        </div>
      </Link>
      <form
        action={toggleFavoriteAction.bind(null, item.id, item.isFavorite)}
        className="absolute right-2 top-2"
      >
        <button
          type="submit"
          className="rounded-full bg-white/80 p-1.5 backdrop-blur-sm transition-colors hover:bg-white"
          aria-label={
            item.isFavorite ? t("removeFromFavorites") : t("addToFavorites")
          }
        >
          <Heart
            className={`h-4 w-4 transition-colors ${
              item.isFavorite
                ? "fill-red-500 text-red-500"
                : "text-neutral-400"
            }`}
          />
        </button>
      </form>
    </Card>
  );
}
