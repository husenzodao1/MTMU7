"use client";

import * as ToastPrimitive from "@radix-ui/react-toast";
import { CircleAlert, CircleCheck, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface ToastItem {
  id: number;
  tone: "success" | "danger";
  title: string;
}

const ToastContext = createContext<(tone: ToastItem["tone"], title: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("common");
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((tone: ToastItem["tone"], title: string) => {
    setItems((current) => [...current.slice(-2), { id: Date.now() + Math.random(), tone, title }]);
  }, []);
  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
        {children}
        {items.map((item) => (
          <ToastPrimitive.Root
            key={item.id}
            type={item.tone === "danger" ? "foreground" : "background"}
            onOpenChange={(open) => {
              if (!open) setItems((current) => current.filter((x) => x.id !== item.id));
            }}
            className={cn(
              "flex items-start gap-3 rounded-lg border bg-surface px-4 py-3 shadow-overlay data-[state=open]:animate-fade",
              item.tone === "danger" ? "border-danger-600/40" : "border-success-600/40"
            )}
          >
            {item.tone === "danger" ? (
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger-600" aria-hidden />
            ) : (
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-success-600" aria-hidden />
            )}
            <ToastPrimitive.Title className="flex-1 text-sm font-medium text-ink">{item.title}</ToastPrimitive.Title>
            <ToastPrimitive.Close className="rounded p-0.5 text-ink-muted hover:text-ink" aria-label={t("close")}>
              <X className="size-4" aria-hidden />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 outline-none max-sm:bottom-20" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
