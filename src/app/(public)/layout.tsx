import { cookies } from "next/headers";
import { LocaleSwitcher } from "@/components/locale-switcher";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const locale = cookieStore.get("NEXT_LOCALE")?.value ?? "tg";

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#F6F8FC] p-4">
      {/* Soft ambient background blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-32 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-gradient-to-br from-[#DDE6FC]/60 via-[#EBF0FB]/40 to-transparent blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-gradient-to-tl from-[#E8E4F8]/50 to-transparent blur-3xl" />
      </div>

      {/* Top bar */}
      <div className="relative z-10 mb-8 flex w-full max-w-md items-center justify-between">
        <div className="flex items-center gap-2">
          <img
            src="/school.png"
            alt="МТМУ №7"
            className="h-8 w-8 shrink-0 rounded-full object-cover shadow-sm ring-1 ring-neutral-200"
          />
          <span className="text-sm font-bold text-neutral-700 tracking-tight">МТМУ №7</span>
        </div>
        <LocaleSwitcher current={locale} />
      </div>

      {/* Content card */}
      <div className="relative z-10 w-full max-w-md">
        {children}
      </div>

      {/* Bottom ambient */}
      <p className="relative z-10 mt-8 text-[11px] font-medium text-neutral-400 text-center">
        Mehrovar Nosirzoda, Ilyos Juraev, Ruslan Huseinzoda
      </p>
    </div>
  );
}

