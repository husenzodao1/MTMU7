import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().max(254).email("validation.email");

export const passwordSchema = z
  .string()
  .min(10, "validation.passwordWeak")
  .max(128, "validation.too_big")
  .regex(/[A-Za-zА-Яа-яЁёҲҳҶҷҚқҒғӢӣӮӯ]/, "validation.passwordWeak")
  .regex(/[0-9]/, "validation.passwordWeak");

// Six digits is what the project is meant to send and what every screen
// promises, but the length is GoTrue's to decide and it can be changed in a
// dashboard without anybody touching this repository. Pinning it to six here
// locked people out: the code in their email was the right code, and the form
// refused it. Whatever arrives is passed to GoTrue, which is the only thing
// that can say whether a code is the right one.
export const otpSchema = z
  .string()
  .trim()
  .regex(/^\d{6,10}$/, "errors.invalid_code");

export const passwordPairSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "validation.passwordMismatch" });
