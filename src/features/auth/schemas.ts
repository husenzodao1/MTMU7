import { z } from "zod";
import { uuid } from "@/lib/validation/uuid";

export const emailSchema = z.string().trim().toLowerCase().max(254).email("validation.email");

export const passwordSchema = z
  .string()
  .min(10, "validation.passwordWeak")
  .max(128, "validation.too_big")
  .regex(/[A-Za-zА-Яа-яЁёҲҳҶҷҚқҒғӢӣӮӯ]/, "validation.passwordWeak")
  .regex(/[0-9]/, "validation.passwordWeak");

export const otpSchema = z
  .string()
  .trim()
  .regex(/^\d{6,10}$/, "errors.invalid_code");

const nameSchema = z.string().trim().min(1, "validation.required").max(100, "validation.too_big");

export const registrationDetailsSchema = z
  .object({
    schoolSlug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "errors.invalid_school"),
    invitationCode: z
      .string()
      .trim()
      .toUpperCase()
      .max(16)
      .regex(/^[A-Z0-9]*$/, "errors.invalid_invitation")
      .optional()
      .transform((v) => v || undefined),
    roleSlug: z.string().max(40).optional().transform((v) => v || undefined),
    classId: uuid.optional().or(z.literal("")).transform((v) => v || undefined),
    firstName: nameSchema,
    lastName: nameSchema,
    middleName: z.string().trim().max(100).optional().transform((v) => v || undefined),
    phone: z
      .string()
      .trim()
      .max(30)
      .regex(/^[+0-9 ()-]*$/, "validation.phone")
      .optional()
      .transform((v) => v || undefined),
    email: emailSchema,
  })
  .refine((v) => Boolean(v.invitationCode) || Boolean(v.roleSlug), { path: ["roleSlug"], message: "validation.required" });

export type RegistrationDraft = z.infer<typeof registrationDetailsSchema>;

export const passwordPairSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "validation.passwordMismatch" });
