import { isModuleAccessible } from "@/lib/modules/check";
import { ErrorState } from "@/components/ui/error-state";
import { getTranslations } from "next-intl/server";

export default async function LibraryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const accessible = await isModuleAccessible("library");

  if (!accessible) {
    const t = await getTranslations("library");
    return (
      <ErrorState
        title={t("moduleDisabled")}
        description={t("noAccess")}
      />
    );
  }

  return <>{children}</>;
}
