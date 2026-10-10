"use client";

import { useEffect, useRef } from "react";
import { useFormError } from "@/components/ui/action-form";

/** A short sideways nudge — long enough to notice, over before it annoys. */
const SHAKE: Keyframe[] = [
  { transform: "translateX(0)" },
  { transform: "translateX(-6px)" },
  { transform: "translateX(6px)" },
  { transform: "translateX(-4px)" },
  { transform: "translateX(4px)" },
  { transform: "translateX(0)" },
];

/**
 * The school's mark at the top of an authentication card. On a rejected submit
 * it nudges sideways once, carrying the failure before anyone has read the
 * alert. The form's result object is the dependency, so two identical failures
 * in a row are both shown.
 */
export function AuthMark({ alt, src }: { alt: string; src?: string | null }) {
  const { message, token } = useFormError();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!message || !ref.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    ref.current.animate(SHAKE, { duration: 420, easing: "cubic-bezier(0.36, 0.07, 0.19, 0.97)" });
  }, [message, token]);

  return (
    <div className="mb-5 flex justify-center">
      <span
        ref={ref}
        className="relative inline-flex size-[68px] items-center justify-center rounded-full bg-surface ring-1 ring-line shadow-[0_8px_24px_-8px_rgb(16_24_40_/_0.3)]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- small static mark, already circular */}
        <img src={src || "/images/school-mark.webp"} alt={alt} className="size-[60px] rounded-full object-cover" />
      </span>
    </div>
  );
}
