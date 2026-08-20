import { cookies } from "next/headers";
import { LocaleSwitcher } from "@/components/locale-switcher";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const locale = cookieStore.get("NEXT_LOCALE")?.value ?? "tg";

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="absolute right-4 top-4">
        <LocaleSwitcher current={locale} />
      </div>
      {children}
    </div>
  );
}
