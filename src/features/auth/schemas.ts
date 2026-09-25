import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().max(254).email("validation.email");

export const passwordSchema = z
  .string()
  .min(10, "validation.passwordWeak")
  .max(128, "validation.too_big")
  .regex(/[A-Za-zА-Яа-яЁёҲҳҶҷҚқҒғӢӣӮӯ]/, "validation.passwordWeak")
  .regex(/[0-9]/, "validation.passwordWeak");

// Six digits, because that is what the account emails carry and what every
// screen promises. GoTrue will issue whatever length the project is set to, so
// the length is pinned here as well: a project quietly moved to eight would
// otherwise send codes this form accepts but no hint text explains.
export const otpSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "errors.invalid_code");

export const passwordPairSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "validation.passwordMismatch" });
