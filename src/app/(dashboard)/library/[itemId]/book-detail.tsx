"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  Heart,
  FileText,
  Headphones,
  Image,
  File,
  Download,
  BookOpen,
  ArrowLeft,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toggleFavoriteAction } from "../actions";
import type { BookDetail as BookDetailType } from "./actions";

interface BookDetailProps {
  book: BookDetailType;
}

function fileTypeIcon(type: string) {
  switch (type) {
    case "pdf":
      return <FileText className="h-16 w-16 text-red-400" />;
    case "epub":
      return <FileText className="h-16 w-16 text-blue-400" />;
    case "audio":
      return <Headphones className="h-16 w-16 text-purple-400" />;
    case "image":
      return <Image className="h-16 w-16 text-green-400" />;
    default:
      return <File className="h-16 w-16 text-neutral-400" />;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const visibilityVariant: Record<string, "default" | "secondary" | "warning"> = {
  all: "default",
  teachers: "secondary",
  admin: "warning",
  specific: "warning",
};

export function BookDetailView({ book }: BookDetailProps) {
  const t = useTranslations("library");

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <Link
        href="/library"
        className="inline-flex items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-800"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("title")}
      </Link>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col gap-6 sm:flex-row">
            <div className="flex h-48 w-36 shrink-0 items-center justify-center self-center rounded-lg bg-neutral-50 sm:h-56 sm:w-40 sm:self-start">
              {book.coverUrl ? (
                <img
                  src={book.coverUrl}
                  alt={book.title}
                  className="h-full w-full rounded-lg object-cover"
                />
              ) : (
                fileTypeIcon(book.fileType)
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-4">
              <div>
                <h1 className="text-xl font-bold text-neutral-900 sm:text-2xl">
                  {book.title}
                </h1>
                {book.author && (
                  <p className="mt-1 text-neutral-500">{book.author}</p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {t(book.fileType as "pdf" | "epub" | "audio" | "image" | "document")}
                </Badge>
                {book.categoryName && (
                  <Badge variant="outline">{book.categoryName}</Badge>
                )}
                {book.subjectName && (
                  <Badge variant="outline">{book.subjectName}</Badge>
                )}
                <Badge variant={visibilityVariant[book.visibility] ?? "secondary"}>
                  {t(`visibility${book.visibility.charAt(0).toUpperCase()}${book.visibility.slice(1)}` as "visibilityAll")}
                </Badge>
              </div>

              {book.description && (
                <p className="text-sm leading-relaxed text-neutral-600">
                  {book.description}
                </p>
              )}

              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {book.publisher && (
                  <>
                    <dt className="text-neutral-400">{t("publisher")}</dt>
                    <dd className="text-neutral-700">{book.publisher}</dd>
                  </>
                )}
                {book.publicationYear && (
                  <>
                    <dt className="text-neutral-400">{t("year")}</dt>
                    <dd className="text-neutral-700">{book.publicationYear}</dd>
                  </>
                )}
                {book.gradeLevel && (
                  <>
                    <dt className="text-neutral-400">{t("grade")}</dt>
                    <dd className="text-neutral-700">{book.gradeLevel}</dd>
                  </>
                )}
                <dt className="text-neutral-400">{t("language")}</dt>
                <dd className="text-neutral-700">{book.language.toUpperCase()}</dd>
                <dt className="text-neutral-400">{t("fileSize")}</dt>
                <dd className="text-neutral-700">
                  {formatFileSize(book.fileSize)}
                </dd>
              </dl>

              {book.readingProgress && (
                <div className="rounded-lg bg-primary-50 p-3">
                  <p className="text-sm text-primary-700">
                    {t("lastRead")}: {t("page")} {book.readingProgress.lastPage}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-3 pt-2">
                <Button asChild>
                  <a href={book.fileUrl} target="_blank" rel="noopener noreferrer">
                    <BookOpen className="h-4 w-4" />
                    {book.readingProgress
                      ? t("continueReading")
                      : t("openBook")}
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <a href={book.fileUrl} download={book.fileName}>
                    <Download className="h-4 w-4" />
                    {t("downloadFile")}
                  </a>
                </Button>
                <form
                  action={toggleFavoriteAction.bind(
                    null,
                    book.id,
                    book.isFavorite
                  )}
                >
                  <Button
                    type="submit"
                    variant={book.isFavorite ? "secondary" : "ghost"}
                  >
                    <Heart
                      className={`h-4 w-4 ${
                        book.isFavorite
                          ? "fill-red-500 text-red-500"
                          : "text-neutral-400"
                      }`}
                    />
                    {book.isFavorite
                      ? t("removeFromFavorites")
                      : t("addToFavorites")}
                  </Button>
                </form>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
