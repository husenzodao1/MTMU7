import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  pill?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, pill = false, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full border bg-white/90 px-4 py-2 text-sm text-neutral-900 shadow-2xs transition-all duration-[var(--duration-fast)] ease-[var(--ease-default)] file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
          pill ? "rounded-full px-5" : "rounded-xl",
          error
            ? "border-error-500 focus-visible:ring-error-500 bg-rose-50/20"
            : "border-neutral-200/80 hover:border-neutral-300 focus-visible:border-neutral-900",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
