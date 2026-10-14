import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MessagesSquare } from "lucide-react";
import { EmptyState } from "@/components/ui/surface";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("messages") };
}

export default async function MessagesIndexPage() {
  const t = await getTranslations("portal.messages");
  return (
    <div className="flex flex-1 items-center justify-center">
      <EmptyState icon={<MessagesSquare />} title={t("selectConversation")} description={t("selectConversationHint")} />
    </div>
  );
}
