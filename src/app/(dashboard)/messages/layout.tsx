import { isModuleAccessible } from "@/lib/modules/check";
import { ErrorState } from "@/components/ui/error-state";
import { getTranslations } from "next-intl/server";

export default async function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const accessible = await isModuleAccessible("messages");

  if (!accessible) {
    const t = await getTranslations("messages");
    return (
      <ErrorState
        title={t("moduleDisabled")}
        description={t("noAccess")}
      />
    );
  }

  return <>{children}</>;
}
