"use client";

import { useId, useState } from "react";
import { useFieldError, useFieldValue } from "@/components/ui/action-form";
import { FormField, Input } from "@/components/ui/form-controls";

/** Tajik subscriber numbers are nine digits, read in 2-3-4 groups. */
const LOCAL_DIGITS = 9;
const DIAL_CODE = "+992";

function digitsOf(raw: string) {
  return raw.replace(/\D/g, "").replace(/^992/, "").slice(0, 12);
}

/** 929475028 -> "92 947 5028"; anything longer stays grouped so it stays readable. */
function group(digits: string) {
  const parts = [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5)].filter(Boolean);
  return parts.join(" ");
}

/**
 * Phone entry with the country's dialling code fixed in front of the box, so
 * nobody has to know or type it. The visible field holds the local number,
 * spaced as it is read aloud; a hidden field carries the full number.
 */
export function PhoneField({ label, invalidMessage }: { label: string; invalidMessage: string }) {
  const serverError = useFieldError("phone");
  const submitted = useFieldValue("phone");
  const [digits, setDigits] = useState(() => digitsOf(submitted ?? ""));
  const id = useId();

  const tooLong = digits.length > LOCAL_DIGITS;
  const tooShort = digits.length > 0 && digits.length < LOCAL_DIGITS;
  const error = serverError ?? (tooLong || tooShort ? invalidMessage : undefined);

  return (
    <FormField label={label} htmlFor={id} error={error}>
      <div className="flex">
        <span
          className="inline-flex shrink-0 items-center gap-1.5 rounded-l-md border border-r-0 border-line-strong bg-surface-muted px-2.5 text-sm text-ink-secondary"
          aria-hidden
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- static 1KB flag */}
          <img src="/flags/tj.svg" alt="" width={18} height={12} className="h-3 w-[18px] rounded-[2px] object-cover ring-1 ring-line" />
          {DIAL_CODE}
        </span>
        <Input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          className="rounded-l-none"
          value={group(digits)}
          onChange={(event) => setDigits(digitsOf(event.target.value))}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          placeholder="92 947 5028"
        />
      </div>
      <input type="hidden" name="phone" value={digits ? `${DIAL_CODE}${digits}` : ""} />
    </FormField>
  );
}
