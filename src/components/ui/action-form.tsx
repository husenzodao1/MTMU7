"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { createContext, useActionState, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";
import * as Overlay from "@/components/ui/overlay";
import { Alert } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { IDLE, type ActionResult, type FormState } from "@/lib/actions/result";

type ServerAction<T> = (state: FormState<T>, formData: FormData) => Promise<FormState<T>>;

const FieldErrorsContext = createContext<Record<string, string[]>>({});

/** Translated error for a field inside the nearest ActionForm. */
export function useFieldError(name: string): string | undefined {
  const errors = useContext(FieldErrorsContext);
  const t = useTranslations();
  const key = errors[name]?.[0];
  return key ? t(key) : undefined;
}

/**
 * Progressive-enhancement form bound to a Server Action returning FormState.
 * Shows field errors inline, the form-level error in an alert, and a toast on
 * success. Works without JavaScript (the action still runs).
 */
export function ActionForm<T>({
  action,
  children,
  className,
  successRedirect,
  onSuccess,
  resetOnSuccess,
  showSuccessToast = true,
}: {
  action: ServerAction<T>;
  children: ReactNode;
  className?: string;
  successRedirect?: string;
  onSuccess?: (result: ActionResult<T>) => void;
  resetOnSuccess?: boolean;
  showSuccessToast?: boolean;
}) {
  const t = useTranslations();
  const toast = useToast();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(action, IDLE as FormState<T>);
  const [handled, setHandled] = useState<FormState<T> | null>(null);

  useEffect(() => {
    if (state.status !== "done" || handled === state) return;
    setHandled(state);
    if (state.ok) {
      if (showSuccessToast && state.message) toast("success", t(state.message));
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.(state);
      if (successRedirect) router.push(successRedirect);
    } else if (!state.fieldErrors) {
      toast("danger", t(state.message));
    }
  }, [state, handled, toast, t, onSuccess, successRedirect, router, resetOnSuccess, showSuccessToast]);

  const fieldErrors = state.status === "done" && !state.ok ? state.fieldErrors ?? {} : {};
  const formError = state.status === "done" && !state.ok && state.fieldErrors ? state.message : null;

  return (
    <form ref={formRef} action={formAction} className={className} noValidate>
      <FieldErrorsContext.Provider value={fieldErrors}>
        {formError ? (
          <Alert tone="danger" className="mb-4">
            {t(formError)}
          </Alert>
        ) : null}
        {children}
      </FieldErrorsContext.Provider>
    </form>
  );
}

export function SubmitButton({ children, ...props }: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} {...props}>
      {children}
    </Button>
  );
}

/** A dialog containing a small form bound to a Server Action; closes on success. */
export function FormDialog<T>({
  action,
  trigger,
  title,
  description,
  submitLabel,
  tone = "primary",
  size = "sm",
  children,
}: {
  action: ServerAction<T>;
  trigger: ReactNode;
  title: string;
  description?: string;
  submitLabel: string;
  tone?: "danger" | "primary";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  return (
    <Overlay.Dialog open={open} onOpenChange={setOpen}>
      <Overlay.DialogTrigger asChild>{trigger}</Overlay.DialogTrigger>
      <Overlay.DialogContent title={title} description={description} closeLabel={t("close")} size={size}>
        <ActionForm action={action} onSuccess={() => setOpen(false)} className="space-y-4">
          {children}
          <div className="flex flex-wrap justify-end gap-2">
            <Overlay.DialogClose asChild>
              <Button variant="secondary">{t("cancel")}</Button>
            </Overlay.DialogClose>
            <SubmitButton variant={tone === "danger" ? "danger" : "primary"}>{submitLabel}</SubmitButton>
          </div>
        </ActionForm>
      </Overlay.DialogContent>
    </Overlay.Dialog>
  );
}

/**
 * A button that runs a destructive or important Server Action after an
 * explicit confirmation dialog (spec §45, §62).
 */
export function ConfirmAction<T>({
  action,
  fields,
  trigger,
  title,
  description,
  confirmLabel,
  tone = "danger",
  requireReason,
  reasonLabel,
}: {
  action: ServerAction<T>;
  fields: Record<string, string>;
  trigger: ReactNode;
  title: string;
  description?: string;
  confirmLabel: string;
  tone?: "danger" | "primary";
  requireReason?: boolean;
  reasonLabel?: string;
}) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  return (
    <Overlay.Dialog open={open} onOpenChange={setOpen}>
      <Overlay.DialogTrigger asChild>{trigger}</Overlay.DialogTrigger>
      <Overlay.DialogContent title={title} description={description} closeLabel={t("close")} size="sm">
        <ActionForm action={action} onSuccess={() => setOpen(false)}>
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          {requireReason ? (
            <div className="mb-4 space-y-1.5">
              <label htmlFor="confirm-reason" className="block text-sm font-medium text-ink">
                {reasonLabel}
              </label>
              <textarea
                id="confirm-reason"
                name="reason"
                required
                maxLength={500}
                rows={3}
                className="block w-full rounded-md border border-line-strong px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
              />
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Overlay.DialogClose asChild>
              <Button variant="secondary">{t("cancel")}</Button>
            </Overlay.DialogClose>
            <SubmitButton variant={tone === "danger" ? "danger" : "primary"}>{confirmLabel}</SubmitButton>
          </div>
        </ActionForm>
      </Overlay.DialogContent>
    </Overlay.Dialog>
  );
}
