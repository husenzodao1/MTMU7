"use client";

import { forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "cva";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva({
  base: "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all duration-[var(--duration-fast)] ease-[var(--ease-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] cursor-pointer select-none",
  variants: {
    variant: {
      default: "bg-neutral-900 text-white hover:bg-neutral-800 shadow-sm hover:shadow-md",
      primary: "bg-primary-600 text-white hover:bg-primary-700 shadow-sm hover:shadow-md",
      destructive: "bg-error-500 text-white hover:bg-error-600 shadow-sm",
      outline: "border border-neutral-200/80 bg-white/90 text-neutral-800 hover:bg-neutral-50 hover:border-neutral-300 shadow-xs",
      secondary: "bg-neutral-100/90 text-neutral-800 hover:bg-neutral-200/80",
      subtle: "bg-[#EEF2F8] text-neutral-700 hover:bg-[#E2E8F0] hover:text-neutral-900",
      ghost: "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
      link: "text-primary-600 underline-offset-4 hover:underline rounded-none p-0 h-auto",
    },
    size: {
      default: "h-10 px-5 py-2",
      sm: "h-8 px-3.5 text-xs",
      lg: "h-12 px-7 text-base font-semibold",
      icon: "h-10 w-10 p-0 rounded-full",
      "icon-sm": "h-8 w-8 p-0 rounded-full",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {asChild ? children : (
          <>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {children}
          </>
        )}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
