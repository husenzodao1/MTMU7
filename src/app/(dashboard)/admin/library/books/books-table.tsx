"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  FileText,
  Headphones,
  Image,
  File,
  Eye,
  EyeOff,
  Trash2,
  Plus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { togglePublishAction, deleteBookAction } from "./actions";
import type { AdminBook } from "./actions";

interface BooksTableProps {
  books: AdminBook[];
}

function fileTypeIcon(type: string) {
  switch (type) {
    case "pdf":
      return <FileText className="h-4 w-4 text-red-400" />;
    case "epub":
      return <FileText className="h-4 w-4 text-blue-400" />;
    case "audio":
      return <Headphones className="h-4 w-4 text-purple-400" />;
    case "image":
      return <Image className="h-4 w-4 text-green-400" />;
    default:
      return <File className="h-4 w-4 text-neutral-400" />;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BooksTable({ books }: BooksTableProps) {
  const t = useTranslations("library");

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t("manageBooks")}</CardTitle>
        <Button size="sm" asChild>
          <Link href="/admin/library/books/new">
            <Plus className="h-4 w-4" />
            {t("addBook")}
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {books.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-10 w-10" />}
            title={t("noBooks")}
            description={t("noBooksDesc")}
          />
        ) : (
          <>
            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {books.map((book) => (
                <div key={book.id} className="rounded-lg border border-neutral-200 p-3">
                  <div className="flex items-start gap-2">
                    {fileTypeIcon(book.fileType)}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-neutral-800">{book.title}</p>
                      <p className="text-xs text-neutral-500">{book.author ?? "—"}</p>
                    </div>
                    {!book.isPublished && (
                      <Badge variant="warning" className="shrink-0 text-[10px]">{t("unpublished")}</Badge>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="text-[10px]">{book.fileType.toUpperCase()}</Badge>
                    {book.categoryName && <Badge variant="outline" className="text-[10px]">{book.categoryName}</Badge>}
                    <span className="text-xs text-neutral-400">{formatFileSize(book.fileSize)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    <form action={togglePublishAction.bind(null, book.id, book.isPublished)}>
                      <button type="submit" className="rounded p-2 text-neutral-400 hover:bg-neutral-100">
                        {book.isPublished ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </form>
                    <form action={deleteBookAction.bind(null, book.id)}>
                      <button type="submit" className="rounded p-2 text-neutral-400 hover:bg-red-50 hover:text-red-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                    <th className="pb-3 pr-4 font-medium">{t("title")}</th>
                    <th className="pb-3 pr-4 font-medium">{t("author")}</th>
                    <th className="pb-3 pr-4 font-medium">{t("format")}</th>
                    <th className="pb-3 pr-4 font-medium">{t("category")}</th>
                    <th className="pb-3 pr-4 font-medium">{t("visibility")}</th>
                    <th className="pb-3 pr-4 font-medium">{t("fileSize")}</th>
                    <th className="pb-3 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {books.map((book) => (
                    <tr key={book.id} className="group">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          {fileTypeIcon(book.fileType)}
                          <span className="max-w-[200px] truncate font-medium text-neutral-800">
                            {book.title}
                          </span>
                          {!book.isPublished && (
                            <Badge variant="warning" className="text-[10px]">{t("unpublished")}</Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-neutral-500">{book.author ?? "—"}</td>
                      <td className="py-3 pr-4">
                        <Badge variant="secondary" className="text-[10px]">{book.fileType.toUpperCase()}</Badge>
                      </td>
                      <td className="py-3 pr-4 text-neutral-500">{book.categoryName ?? "—"}</td>
                      <td className="py-3 pr-4">
                        <Badge variant="outline" className="text-[10px]">
                          {t(`visibility${book.visibility.charAt(0).toUpperCase()}${book.visibility.slice(1)}` as "visibilityAll")}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-neutral-400">{formatFileSize(book.fileSize)}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <form action={togglePublishAction.bind(null, book.id, book.isPublished)}>
                            <button type="submit" className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                              title={book.isPublished ? t("unpublished") : t("published")}>
                              {book.isPublished ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </form>
                          <form action={deleteBookAction.bind(null, book.id)}>
                            <button type="submit" className="rounded p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-500"
                              title={t("deleteBook")}>
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
