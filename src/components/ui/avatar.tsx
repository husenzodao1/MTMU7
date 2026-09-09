"use client";

import { forwardRef, useState } from "react";
import { cn } from "@/lib/utils";

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  fallback: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  status?: "online" | "busy" | "offline";
}

const sizeClasses = {
  xs: "h-7 w-7 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-lg",
  "2xl": "h-20 w-20 text-xl font-bold",
};

const statusClasses = {
  online: "bg-emerald-500",
  busy: "bg-amber-500",
  offline: "bg-neutral-400",
};

const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, src, alt, fallback, size = "md", status, ...props }, ref) => {
    const [imageError, setImageError] = useState(false);
    const initials = fallback.slice(0, 2).toUpperCase();

    return (
      <div className="relative inline-block shrink-0">
        <div
          ref={ref}
          className={cn(
            "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-black/[0.06] bg-gradient-to-br from-neutral-100 to-neutral-200/90 text-neutral-800 font-semibold shadow-2xs select-none",
            sizeClasses[size],
            className
          )}
          {...props}
        >
          {src && !imageError ? (
            <img
              src={src}
              alt={alt ?? fallback}
              className="h-full w-full object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <span className="tracking-tight">{initials}</span>
          )}
        </div>
        {status && (
          <span
            className={cn(
              "absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-white",
              statusClasses[status]
            )}
          />
        )}
      </div>
    );
  }
);
Avatar.displayName = "Avatar";

export { Avatar };
