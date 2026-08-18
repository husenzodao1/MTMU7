import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CreateArticleForm } from "./create-article-form";

export default async function CreateArticlePage() {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const t = await getTranslations();

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-in">
      <h1 className="text-2xl font-bold text-neutral-900">{t("news.createArticle")}</h1>
      <CreateArticleForm />
    </div>
  );
}
