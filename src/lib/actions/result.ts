import type { z } from "zod";

/** Serializable result returned by every Server Action. `message` is an i18n key. */
export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]>; values?: Record<string, string> };

/** State shape for forms driven by useActionState. */
export type FormState<T = undefined> = { status: "idle" } | ({ status: "done" } & ActionResult<T>);

export const IDLE: FormState = { status: "idle" };

export function success<T>(message?: string, data?: T): ActionResult<T> {
  return { ok: true, message, data };
}

export function failure(
  message: string,
  fieldErrors?: Record<string, string[]>,
  values?: Record<string, string>
): ActionResult<never> {
  return { ok: false, message, fieldErrors, values };
}

/**
 * The text values of a submission, for redisplay after a rejected submit.
 * React resets a form once its action resolves, so without this a single bad
 * field would empty every other one. Secrets are never echoed: pass every
 * password, token and one-time code in `omit`.
 */
export function keepValues(formData: FormData, omit: readonly string[] = []): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION") || omit.includes(key)) continue;
    if (typeof value === "string" && value !== "") values[key] = value;
  }
  return values;
}

export function done<T>(result: ActionResult<T>): FormState<T> {
  return { status: "done", ...result };
}

/** Converts FormData to a plain object; repeated keys become arrays. */
export function formDataToObject(formData: FormData): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION")) continue;
    const normalized = typeof value === "string" ? value : value;
    if (key.endsWith("[]")) {
      const name = key.slice(0, -2);
      const list = (result[name] as unknown[] | undefined) ?? [];
      list.push(normalized);
      result[name] = list;
    } else if (key in result) {
      const existing = result[key];
      result[key] = Array.isArray(existing) ? [...existing, normalized] : [existing, normalized];
    } else {
      result[key] = normalized;
    }
  }
  return result;
}

/** Parses input with a Zod schema, mapping issues to field error i18n keys. */
export function parseInput<S extends z.ZodType>(
  schema: S,
  input: unknown,
  values?: Record<string, string>
): { ok: true; data: z.output<S> } | { ok: false; result: ActionResult<never> } {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) {
    const path = issue.path.join(".") || "_form";
    const key = typeof issue.message === "string" && issue.message.startsWith("validation.")
      ? issue.message
      : `validation.${issue.code}`;
    (fieldErrors[path] ??= []).push(key);
  }
  return { ok: false, result: failure("errors.validation", fieldErrors, values) };
}
