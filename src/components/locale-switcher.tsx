"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";

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
    <div className="flex items-center gap-1">
      <Globe className="h-4 w-4 text-neutral-400" />
      {LOCALES.map(({ code, label }) => (
        <button
          key={code}
          type="button"
          disabled={isPending}
          onClick={() => handleChange(code)}
          className={`rounded px-1.5 py-0.5 text-xs font-medium transition-colors ${
            current === code
              ? "bg-primary-100 text-primary-700"
              : "text-neutral-500 hover:text-neutral-700"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
