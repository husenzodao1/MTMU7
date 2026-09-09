import { getBookDetail } from "./actions";
import { BookDetailView } from "./book-detail";
import { ErrorState } from "@/components/ui/error-state";
import { getTranslations } from "next-intl/server";

export default async function BookDetailPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const t = await getTranslations("library");

  const book = await getBookDetail(itemId);

  if (!book) {
    return (
      <div className="py-12">
        <ErrorState
          title={t("noBooks")}
          description={t("noBooksDesc")}
        />
      </div>
    );
  }

  return <BookDetailView book={book} />;
}
