import { z } from "zod";

const name = z.string().trim().min(1, "validation.required").max(100, "validation.too_big");
const optionalText = (max: number) => z.string().trim().max(max, "validation.too_big").optional().transform((v) => v || null);
const optionalDate = z
  .string()
  .optional()
  .transform((v) => v || null)
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "validation.date");
const phone = z.string().trim().max(50).regex(/^[+0-9 ()-]*$/, "validation.phone").optional().transform((v) => v || null);

export const personNameSchema = {
  lastName: name,
  firstName: name,
  middleName: optionalText(100),
};

export const studentSchema = z.object({
  ...personNameSchema,
  gender: z.enum(["male", "female"]).optional().or(z.literal("")).transform((v) => v || null),
  dateOfBirth: optionalDate,
  studentNumber: z.string().trim().max(32, "validation.too_big").optional().transform((v) => v || null),
  admissionDate: optionalDate,
  phone,
  address: optionalText(500),
  notes: optionalText(2000),
  classId: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
});

export const STAFF_TYPES = ["teacher", "director", "vice_principal", "librarian", "administrator", "support", "other"] as const;
export const STAFF_STATUSES = ["active", "on_leave", "inactive", "archived"] as const;
export const STUDENT_STATUSES = ["active", "inactive", "transferred", "graduated", "archived"] as const;
export const GUARDIAN_RELATIONSHIPS = ["mother", "father", "guardian", "grandparent", "sibling", "other"] as const;

export const staffSchema = z.object({
  ...personNameSchema,
  gender: z.enum(["male", "female"]).optional().or(z.literal("")).transform((v) => v || null),
  dateOfBirth: optionalDate,
  staffType: z.enum(STAFF_TYPES),
  position: optionalText(200),
  qualification: optionalText(2000),
  employeeNumber: z.string().trim().max(32, "validation.too_big").optional().transform((v) => v || null),
  hireDate: optionalDate,
  phone,
  email: z.string().trim().toLowerCase().max(255).email("validation.email").optional().or(z.literal("")).transform((v) => v || null),
  maxWeeklyHours: z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? Number(v.replace(",", ".")) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v > 0 && v <= 60), "validation.hours"),
});

export const guardianSchema = z.object({
  ...personNameSchema,
  phone,
  email: z.string().trim().toLowerCase().max(255).email("validation.email").optional().or(z.literal("")).transform((v) => v || null),
  address: optionalText(500),
});
