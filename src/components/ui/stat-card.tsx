import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
  variant?: "default" | "hero" | "subtle";
  className?: string;
}

export function StatCard({ label, value, icon, subtitle, variant = "default", className }: StatCardProps) {
  if (variant === "hero") {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-[24px] border border-indigo-100/80 bg-gradient-to-br from-[#E8EEFB] via-[#EEF2FC] to-[#E2EAFD] p-6 shadow-sm transition-all duration-[var(--duration-normal)] ease-[var(--ease-default)] hover:shadow-md press-scale",
          className
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{label}</p>
            <p className="mt-2 text-3xl font-extrabold tracking-tight text-neutral-900">{value}</p>
            {subtitle && <p className="mt-1 text-xs text-neutral-500 font-medium">{subtitle}</p>}
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/90 text-neutral-900 shadow-sm">
            {icon}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-[20px] border border-neutral-200/70 bg-white p-5 shadow-card transition-all duration-[var(--duration-normal)] ease-[var(--ease-default)] hover:shadow-md press-scale",
        variant === "subtle" && "bg-[#F1F4F9] border-neutral-200/40",
        className
      )}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-neutral-100/80 text-neutral-800 transition-colors">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-neutral-500">{label}</p>
        <p className="text-2xl font-bold tracking-tight text-neutral-900">{value}</p>
        {subtitle && <p className="text-[11px] text-neutral-400 font-medium">{subtitle}</p>}
      </div>
    </div>
  );
}
