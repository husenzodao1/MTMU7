import { Slot } from "@radix-ui/react-slot";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

const variants = {
  primary: "brand-fill shadow-xs",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-muted shadow-xs",
  ghost: "text-ink-secondary hover:bg-surface-muted hover:text-ink",
  danger: "bg-danger-600 text-ink-inverse hover:bg-danger-700 shadow-xs",
  "danger-outline": "bg-surface text-danger-700 border border-danger-600/40 hover:bg-danger-50",
  link: "text-brand-text underline-offset-4 hover:underline px-0 h-auto",
} as const;

// A minimum height rather than a height: a label longer than a phone is wide
// wraps onto a second line inside the button instead of running out of it.
const sizes = {
  sm: "min-h-8 px-3 py-1 text-sm gap-1.5",
  md: "min-h-10 px-4 py-1.5 text-sm gap-2",
  lg: "min-h-11 px-5 py-2 text-base gap-2",
  icon: "h-10 w-10 p-0",
  "icon-sm": "h-8 w-8 p-0",
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
  loading?: boolean;
}

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(
    "inline-flex max-w-full shrink-0 items-center justify-center rounded-md text-center font-medium leading-tight transition-colors",
    "disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
    variants[variant],
    sizes[size],
    className
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", asChild, loading, className, children, disabled, type, ...props },
  ref
) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      ref={ref}
      type={asChild ? undefined : (type ?? "button")}
      className={buttonClasses(variant, size, className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && !asChild ? (
        <>
          <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />
          {children}
        </>
      ) : (
        children
      )}
    </Component>
  );
});
