"use client";

import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import { ChevronRight, Download } from "lucide-react";
import Link from "next/link";
import type { AppPlatform } from "@/lib/native/downloads";
import { cn } from "@/lib/utils/cn";

export function AndroidIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path
        fill="currentColor"
        d="M17.6 9.48 19.44 6.3a.38.38 0 0 0-.66-.38l-1.87 3.23a11.46 11.46 0 0 0-9.82 0L5.22 5.92a.38.38 0 1 0-.66.38L6.4 9.48A10.78 10.78 0 0 0 1 18h22a10.78 10.78 0 0 0-5.4-8.52ZM7 15.25a1.25 1.25 0 1 1 1.25-1.25A1.25 1.25 0 0 1 7 15.25Zm10 0A1.25 1.25 0 1 1 18.25 14 1.25 1.25 0 0 1 17 15.25Z"
      />
    </svg>
  );
}

export function AppleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path
        fill="currentColor"
        d="M16.37 12.6c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.77-3.32-1.8-1.41-.14-2.76.83-3.47.83-.72 0-1.82-.81-2.99-.79-1.54.02-2.96.9-3.75 2.27-1.6 2.77-.41 6.87 1.15 9.12.76 1.1 1.67 2.33 2.86 2.29 1.15-.05 1.58-.74 2.97-.74s1.78.74 2.99.72c1.24-.02 2.02-1.12 2.77-2.23.88-1.28 1.24-2.52 1.26-2.58-.03-.01-2.4-.92-2.43-3.63ZM14.1 5.84c.63-.77 1.06-1.83.94-2.89-.91.04-2.02.61-2.67 1.37-.58.67-1.1 1.76-.96 2.8 1.02.08 2.06-.52 2.69-1.28Z"
      />
    </svg>
  );
}

export function WindowsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path fill="currentColor" d="M3 5.1 10.4 4v7.2H3V5.1Zm0 13.8 7.4 1.1v-7.1H3v6Zm8.2 1.2L21 21.5v-8.6h-9.8v7.2Zm0-16.2v7.3H21V2.5l-9.8 1.4Z" />
    </svg>
  );
}

const ICON: Record<AppPlatform, typeof AndroidIcon> = { android: AndroidIcon, ios: AppleIcon, windows: WindowsIcon };
const TINT: Record<AppPlatform, string> = {
  android: "bg-[#3ddc84]/15 text-[#16a34a]",
  ios: "bg-ink/10 text-ink",
  windows: "bg-[#0078d4]/12 text-[#0078d4]",
};

export interface DownloadLabels {
  button: string;
  title: string;
  subtitle: string;
  more: string;
  platforms: Record<AppPlatform, { name: string; hint: string }>;
}

const TRIGGER = {
  // The front page's second button, the twin of "Get started".
  hero: "home-button home-button-quiet",
  // A link among the footer's links.
  footer: "inline-flex items-center gap-1 rounded-sm text-[11px] text-ink-muted transition-colors hover:text-ink",
} as const;

/**
 * The three apps, behind one button: on the front page next to "Get started",
 * and in the footer of every page. The visitor's own device comes first, and
 * the other two stay one tap away for whoever is fetching the app for
 * somebody else.
 */
export function DownloadApp({
  labels,
  recommended,
  variant = "hero",
  text,
}: {
  labels: DownloadLabels;
  recommended: AppPlatform | null;
  variant?: keyof typeof TRIGGER;
  /** The button's words, when they are not the menu's own. */
  text?: string;
}) {
  const order: AppPlatform[] = recommended
    ? [recommended, ...(["android", "ios", "windows"] as AppPlatform[]).filter((p) => p !== recommended)]
    : ["android", "ios", "windows"];

  return (
    <DropdownPrimitive.Root modal={false}>
      <DropdownPrimitive.Trigger asChild>
        <button type="button" className={TRIGGER[variant]} aria-label={labels.title}>
          <Download className={variant === "footer" ? "size-3" : "size-3.5"} aria-hidden />
          <span>{text ?? labels.button}</span>
        </button>
      </DropdownPrimitive.Trigger>
      <DropdownPrimitive.Portal>
        <DropdownPrimitive.Content
          align={variant === "hero" ? "center" : "end"}
          side={variant === "footer" ? "top" : "bottom"}
          sideOffset={10}
          collisionPadding={12}
          className="z-50 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-line bg-surface p-2 shadow-overlay data-[state=open]:animate-fade"
        >
          <div className="px-2.5 pb-2 pt-1.5">
            <p className="text-sm font-semibold text-ink">{labels.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{labels.subtitle}</p>
          </div>
          {order.map((platform, index) => {
            const Icon = ICON[platform];
            return (
              <DropdownPrimitive.Item key={platform} asChild>
                <a
                  href={`/download/${platform}`}
                  // The APK comes from this site: saved straight into the
                  // phone's downloads instead of opening a page.
                  download={platform === "android" ? "MTMU7.apk" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-2.5 py-2.5 outline-none transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted",
                    index === 0 && recommended && "bg-surface-muted/70"
                  )}
                >
                  <span className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-xl", TINT[platform])}>
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{labels.platforms[platform].name}</span>
                    <span className="block truncate text-xs text-ink-muted">{labels.platforms[platform].hint}</span>
                  </span>
                  <Download className="size-4 shrink-0 text-ink-muted" aria-hidden />
                </a>
              </DropdownPrimitive.Item>
            );
          })}
          <DropdownPrimitive.Item asChild>
            <Link
              href="/app"
              className="mt-1 flex items-center justify-center gap-1 rounded-xl px-2.5 py-2 text-xs font-medium text-brand-text outline-none hover:bg-surface-muted focus-visible:bg-surface-muted"
            >
              {labels.more}
              <ChevronRight className="size-3.5" aria-hidden />
            </Link>
          </DropdownPrimitive.Item>
        </DropdownPrimitive.Content>
      </DropdownPrimitive.Portal>
    </DropdownPrimitive.Root>
  );
}
