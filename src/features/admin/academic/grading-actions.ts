"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuid } from "@/lib/validation/uuid";
import { mapDbError } from "@/lib/actions/errors";
import { done, failure, formDataToObject, parseInput, success, type FormState } from "@/lib/actions/result";
import { can, getAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";


/** Approves recorded grades; the grade trigger requires grades.approve and records who approved. */
export async function approveGradesAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!can(access, "grades.approve")) return done(failure("errors.forbidden"));
  const ids = z.array(uuid).min(1).max(500).safeParse(formData.getAll("gradeId"));
  if (!ids.success) return done(failure("admin.gradebook.selectGrades"));
  const decision = formData.get("decision") === "revoke" ? "recorded" : "approved";
  const supabase = await createClient();
  const { error, count } = await supabase.from("grades").update({ status: decision }, { count: "exact" }).in("id", ids.data);
  if (error) return done(mapDbError(error));
  if (!count) return done(failure("errors.forbidden"));
  revalidatePath("/admin/gradebook");
  revalidatePath("/admin", "layout");
  return done(success(decision === "approved" ? "admin.gradebook.approved" : "admin.gradebook.revoked"));
}

const assessmentSchema = z.object({
  id: uuid.optional().or(z.literal("")).transform((v) => v || null),
  code: z.string().trim().toLowerCase().min(2, "validation.too_small").max(32, "validation.too_big").regex(/^[a-z0-9_]+$/, "validation.code"),
  nameTg: z.string().trim().min(1, "validation.required").max(100, "validation.too_big"),
  nameRu: z.string().trim().max(100).optional().transform((v) => v || null),
  nameEn: z.string().trim().max(100).optional().transform((v) => v || null),
  weight: z.string().transform((v) => Number(v.replace(",", "."))).refine((v) => Number.isFinite(v) && v >= 0 && v <= 100, "validation.invalid_value"),
  maxScore: z.string().transform((v) => Number(v.replace(",", "."))).refine((v) => Number.isFinite(v) && v > 0 && v <= 1000, "validation.invalid_value"),
  isFinal: z.string().optional().transform((v) => v === "on"),
  isActive: z.string().optional().transform((v) => v === "on"),
  sortOrder: z.coerce.number().int().min(0).max(100).default(0),
});

export async function saveAssessmentTypeAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!can(access, "assessments.manage")) return done(failure("errors.forbidden"));
  const input = parseInput(assessmentSchema, formDataToObject(formData));
  if (!input.ok) return done(input.result);
  const v = input.data;
  const supabase = await createClient();
  const row = {
    code: v.code,
    name_tg: v.nameTg,
    name_ru: v.nameRu,
    name_en: v.nameEn,
    weight: v.weight,
    max_score: v.maxScore,
    is_final: v.isFinal,
    is_active: v.id ? v.isActive : true,
    sort_order: v.sortOrder,
  };
  const { error } = v.id
    ? await supabase.from("assessment_types").update(row).eq("id", v.id)
    : await supabase.from("assessment_types").insert({ ...row, school_id: access.school.id });
  if (error) return done(error.code === "23505" ? failure("errors.validation", { code: ["validation.duplicateName"] }) : mapDbError(error));
  revalidatePath("/admin/gradebook");
  return done(success(v.id ? "common.saved" : "common.created"));
}
