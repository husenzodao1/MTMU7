import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

const controlBase =
  "block w-full rounded-md border border-line-strong bg-surface px-3 text-base sm:text-sm text-ink placeholder:text-ink-muted " +
  "transition-colors hover:border-ink-muted focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20 " +
  "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-muted aria-[invalid=true]:border-danger-600";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(controlBase, "h-10", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 4, ...props },
  ref
) {
  return <textarea ref={ref} rows={rows} className={cn(controlBase, "py-2 leading-relaxed", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref
) {
  return (
    <select
      ref={ref}
      className={cn(
        controlBase,
        "h-10 appearance-none bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-9",
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%235e6670%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')]",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
});

export function Checkbox({ label, description, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 py-1", props.disabled && "cursor-not-allowed opacity-60", className)}>
      <input
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 rounded border-line-strong text-brand-600 accent-brand-600 focus-visible:outline-2"
        {...props}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description ? <span className="block text-sm text-ink-muted">{description}</span> : null}
      </span>
    </label>
  );
}

export function Radio({ label, description, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 py-1", className)}>
      <input type="radio" className="mt-0.5 size-4 shrink-0 accent-brand-600" {...props} />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description ? <span className="block text-sm text-ink-muted">{description}</span> : null}
      </span>
    </label>
  );
}

export function Label({ htmlFor, children, required, className }: { htmlFor?: string; children: ReactNode; required?: boolean; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("block text-sm font-medium text-ink", className)}>
      {children}
      {required ? (
        <span className="ms-0.5 text-danger-600" aria-hidden>
          *
        </span>
      ) : null}
    </label>
  );
}

/**
 * Label + control + hint + error with aria wiring. Pass the control's id as
 * `htmlFor`; the control should reference `${htmlFor}-hint` / `${htmlFor}-error`
 * through aria-describedby (FieldControl helpers below do this).
 */
export function FormField({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      {hint && !error ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-sm font-medium text-danger-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function describedBy(id: string, opts: { hint?: unknown; error?: unknown }) {
  const ids = [opts.error ? `${id}-error` : null, !opts.error && opts.hint ? `${id}-hint` : null].filter(Boolean);
  return { "aria-describedby": ids.length ? ids.join(" ") : undefined, "aria-invalid": opts.error ? true : undefined };
}

export function Fieldset({ legend, description, children, className }: { legend: ReactNode; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cn("rounded-lg border border-line bg-surface p-4 sm:p-5", className)}>
      <legend className="px-1 text-sm font-semibold text-ink">{legend}</legend>
      {description ? <p className="mb-3 text-sm text-ink-muted">{description}</p> : null}
      <div className="space-y-4">{children}</div>
    </fieldset>
  );
}
