import { cva, type VariantProps } from "cva";
import { cn } from "@/lib/utils";

const badgeVariants = cva({
  base: "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-[var(--duration-fast)] tracking-tight select-none",
  variants: {
    variant: {
      default: "bg-neutral-900 text-white shadow-2xs",
      secondary: "bg-neutral-100 text-neutral-800 border border-neutral-200/60",
      primary: "bg-primary-50 text-primary-700 border border-primary-200/60",
      success: "bg-emerald-50 text-emerald-700 border border-emerald-200/60",
      warning: "bg-amber-50 text-amber-800 border border-amber-200/60",
      destructive: "bg-rose-50 text-rose-700 border border-rose-200/60",
      outline: "border border-neutral-200/90 text-neutral-700 bg-white/80",
      pill: "bg-[#EEF2F8] text-neutral-700 border border-neutral-200/40",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

function Badge({ className, variant, dot = false, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            variant === "success" && "bg-emerald-500",
            variant === "warning" && "bg-amber-500",
            variant === "destructive" && "bg-rose-500",
            variant === "primary" && "bg-primary-500",
            (!variant || variant === "default") && "bg-white",
            (variant === "secondary" || variant === "outline" || variant === "pill") && "bg-neutral-400"
          )}
        />
      )}
      {children}
    </div>
  );
}

export { Badge, badgeVariants };
