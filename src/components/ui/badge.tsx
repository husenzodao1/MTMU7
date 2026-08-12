import { cva, type VariantProps } from "cva";
import { cn } from "@/lib/utils";

const badgeVariants = cva({
  base: "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors duration-[var(--duration-fast)]",
  variants: {
    variant: {
      default: "bg-primary-100 text-primary-700",
      secondary: "bg-neutral-100 text-neutral-700",
      success: "bg-green-100 text-green-700",
      warning: "bg-amber-100 text-amber-700",
      destructive: "bg-red-100 text-red-700",
      outline: "border border-neutral-300 text-neutral-600",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
