"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useFieldError, useFieldValue } from "@/components/ui/action-form";
import { describedBy, FormField, Input, Select, Textarea } from "@/components/ui/form-controls";

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
  const id = props.id ?? `f-${name}`;
  return (
    <FormField label={label} htmlFor={id} hint={hint} error={error} required={required} className={className}>
      <Input
        id={id}
        name={name}
        required={required}
        defaultValue={props.defaultValue ?? submitted}
        {...describedBy(id, { hint, error })}
        {...props}
      />
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
