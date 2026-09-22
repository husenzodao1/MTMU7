"use client";

import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { useFieldError, useFieldValue } from "@/components/ui/action-form";
import { describedBy, FormField, Input, Select, Textarea } from "@/components/ui/form-controls";
import { cn } from "@/lib/utils/cn";

interface BaseProps {
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
}

/** Text input wired to ActionForm field errors. */
export function TextField({ name, label, hint, required, className, ...props }: BaseProps & Omit<InputHTMLAttributes<HTMLInputElement>, "name">) {
  const error = useFieldError(name);
  const submitted = useFieldValue(name);
  const t = useTranslations("common");
  const [revealed, setRevealed] = useState(false);
  const id = props.id ?? `f-${name}`;
  const isPassword = props.type === "password";

  const input = (
    <Input
      id={id}
      name={name}
      required={required}
      defaultValue={props.defaultValue ?? submitted}
      {...describedBy(id, { hint, error })}
      {...props}
      type={isPassword && revealed ? "text" : props.type}
      className={cn(isPassword && "pr-10")}
    />
  );

  return (
    <FormField label={label} htmlFor={id} hint={hint} error={error} required={required} className={className}>
      {isPassword ? (
        // Typing a password you cannot see is where most sign-in failures start.
        <div className="relative">
          {input}
          <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            aria-pressed={revealed}
            aria-controls={id}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-ink-muted transition-colors hover:text-ink"
          >
            {revealed ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
            <span className="sr-only">{revealed ? t("hidePassword") : t("showPassword")}</span>
          </button>
        </div>
      ) : (
        input
      )}
    </FormField>
  );
}

export function TextAreaField({ name, label, hint, required, className, ...props }: BaseProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "name">) {
  const error = useFieldError(name);
  const id = props.id ?? `f-${name}`;
  return (
    <FormField label={label} htmlFor={id} hint={hint} error={error} required={required} className={className}>
      <Textarea id={id} name={name} required={required} {...describedBy(id, { hint, error })} {...props} />
    </FormField>
  );
}

export function SelectField({
  name,
  label,
  hint,
  required,
  className,
  options,
  placeholder,
  ...props
}: BaseProps &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, "name"> & {
    options: Array<{ value: string; label: string; disabled?: boolean }>;
    placeholder?: string;
  }) {
  const error = useFieldError(name);
  const submitted = useFieldValue(name);
  const id = props.id ?? `f-${name}`;
  return (
    <FormField label={label} htmlFor={id} hint={hint} error={error} required={required} className={className}>
      <Select
        id={id}
        name={name}
        required={required}
        defaultValue={props.defaultValue ?? submitted}
        {...describedBy(id, { hint, error })}
        {...props}
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </Select>
    </FormField>
  );
}

export function FieldError({ name }: { name: string }) {
  const error = useFieldError(name);
  return error ? (
    <p className="text-sm font-medium text-danger-700" role="alert">
      {error}
    </p>
  ) : null;
}
