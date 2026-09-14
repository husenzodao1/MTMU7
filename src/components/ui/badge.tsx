import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

const tones = {
  neutral: "bg-surface-muted text-ink-secondary border-line",
  brand: "bg-brand-50 text-brand-700 border-brand-200",
  success: "bg-success-50 text-success-700 border-success-600/25",
  warning: "bg-warning-50 text-warning-700 border-warning-600/25",
  danger: "bg-danger-50 text-danger-700 border-danger-600/25",
} as const;

export type BadgeTone = keyof typeof tones;

export function Badge({ tone = "neutral", children, className, dot }: { tone?: BadgeTone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium", tones[tone], className)}>
      {dot ? <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Status → tone mapping. The visible label always carries the meaning (never colour alone). */
const STATUS_TONES: Record<string, BadgeTone> = {
  active: "success",
  published: "success",
  approved: "success",
  present: "success",
  sent: "success",
  completed: "neutral",
  graduated: "brand",
  reviewed: "success",
  confirmed: "success",
  action_taken: "success",
  draft: "neutral",
  planned: "neutral",
  scheduled: "brand",
  review: "warning",
  submitted: "brand",
  pending: "warning",
  late: "warning",
  on_leave: "warning",
  returned: "warning",
  open: "warning",
  excused: "brand",
  inactive: "neutral",
  archived: "neutral",
  transferred: "neutral",
  withdrawn: "neutral",
  closed: "neutral",
  dismissed: "neutral",
  cancelled: "neutral",
  blocked: "danger",
  rejected: "danger",
  absent: "danger",
  missing: "danger",
  critical: "danger",
  important: "warning",
  normal: "neutral",
};

export function StatusBadge({ status, label, className }: { status: string; label: string; className?: string }) {
  return (
    <Badge tone={STATUS_TONES[status] ?? "neutral"} dot className={className}>
      {label}
    </Badge>
  );
}
