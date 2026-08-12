import { useTranslations } from "next-intl";

export default function Home() {
  const t = useTranslations("common");
  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="text-3xl font-bold">{t("appName")}</h1>
    </main>
  );
}
