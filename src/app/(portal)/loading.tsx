import { getTranslations } from "next-intl/server";
import { LoadingState } from "@/components/ui/surface";

export default async function Loading() {
  const t = await getTranslations("common");
  return <LoadingState label={t("loading")} />;
}
