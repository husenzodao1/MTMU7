"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

const LOCALES = [
  { code: "tg", label: "Тҷ" },
  { code: "ru", label: "Ру" },
  { code: "en", label: "En" },
] as const;

export function LocaleSwitcher({ current }: { current: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleChange = (locale: string) => {
    startTransition(() => {
      document.cookie = `NEXT_LOCALE=${locale};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-1 rounded-full border border-neutral-200/80 bg-white/90 p-1 shadow-2xs">
      <div className="pl-1.5 pr-0.5 text-neutral-400">
        <Globe className="h-3.5 w-3.5" />
      </div>
      {LOCALES.map(({ code, label }) => (
        <button
          key={code}
          type="button"
          disabled={isPending}
          onClick={() => handleChange(code)}
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-bold transition-all duration-[var(--duration-fast)] ease-[var(--ease-default)] press-scale cursor-pointer select-none",
            current === code
              ? "bg-neutral-900 text-white shadow-2xs"
              : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
