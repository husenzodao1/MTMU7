"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuid } from "@/lib/validation/uuid";
import { mapDbError } from "@/lib/actions/errors";
import { done, failure, success, type FormState } from "@/lib/actions/result";
import { can, getAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { generateInvitationCode } from "@/features/admin/people/invitation-code";


export async function setUserStatusAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const parsed = z
    .object({ userId: uuid, status: z.enum(["active", "blocked"]), reason: z.string().trim().max(500).optional() })
    .safeParse({ userId: formData.get("userId"), status: formData.get("status"), reason: formData.get("reason") ?? undefined });
  if (!parsed.success) return done(failure("errors.invalid"));
  if (parsed.data.status === "blocked" && !parsed.data.reason) return done(failure("errors.validation", { reason: ["validation.required"] }));
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_user_status", {
    p_user_id: parsed.data.userId,
    p_status: parsed.data.status,
    p_reason: parsed.data.reason || undefined,
  });
  if (error) return done(mapDbError(error));
  revalidatePath(`/admin/users/${parsed.data.userId}`);
  revalidatePath("/admin/users");
  return done(success(parsed.data.status === "blocked" ? "admin.users.blocked" : "admin.users.unblocked"));
}

export async function setUserRolesAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const parsed = z
    .object({ userId: uuid, roleIds: z.array(uuid).min(1, "admin.users.oneRoleRequired").max(20) })
    .safeParse({ userId: formData.get("userId"), roleIds: formData.getAll("roleId") });
  if (!parsed.success) return done(failure(parsed.error.issues[0]?.message === "admin.users.oneRoleRequired" ? "admin.users.oneRoleRequired" : "errors.invalid"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_user_roles", { p_user_id: parsed.data.userId, p_role_ids: parsed.data.roleIds });
  if (error) return done(mapDbError(error));
  revalidatePath(`/admin/users/${parsed.data.userId}`);
  revalidatePath("/admin/users");
  return done(success("admin.users.rolesSaved"));
}

export async function reviewRegistrationAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const parsed = z
    .object({
      requestId: uuid,
      decision: z.enum(["approve", "reject"]),
      roleId: uuid.optional().or(z.literal("")).transform((v) => v || undefined),
      classId: uuid.optional().or(z.literal("")).transform((v) => v || undefined),
      reason: z.string().trim().max(500).optional(),
    })
    .safeParse({
      requestId: formData.get("requestId"),
      decision: formData.get("decision"),
      roleId: formData.get("roleId") ?? "",
      classId: formData.get("classId") ?? "",
      reason: formData.get("reason") ?? undefined,
    });
  if (!parsed.success) return done(failure("errors.invalid"));
  const v = parsed.data;
  if (v.decision === "reject" && !v.reason) return done(failure("errors.validation", { reason: ["validation.required"] }));
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_registration", {
    p_request_id: v.requestId,
    p_approve: v.decision === "approve",
    p_role_id: v.roleId,
    p_class_id: v.classId,
    p_reason: v.reason || undefined,
  });
  if (error) return done(mapDbError(error));
  revalidatePath("/admin/approvals");
  revalidatePath("/admin", "layout");
  return done(success(v.decision === "approve" ? "admin.approvals.approved" : "admin.approvals.rejected"));
}

export async function createInvitationAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!can(access, "invitations.manage")) return done(failure("errors.forbidden"));
  const parsed = z
    .object({
      roleId: uuid,
      maxUses: z.coerce.number().int().min(1).max(1000),
      validDays: z.coerce.number().int().min(1).max(365),
      classId: uuid.optional().or(z.literal("")).transform((v) => v || null),
      note: z.string().trim().max(200).optional().transform((v) => v || null),
    })
    .safeParse({
      roleId: formData.get("roleId"),
      maxUses: formData.get("maxUses"),
      validDays: formData.get("validDays"),
      classId: formData.get("classId") ?? "",
      note: formData.get("note") ?? undefined,
    });
  if (!parsed.success) return done(failure("errors.validation", Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), ["validation.invalid_value"]]))));
  const v = parsed.data;
  const supabase = await createClient();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { error } = await supabase.from("invitation_codes").insert({
      school_id: access.school.id,
      role_id: v.roleId,
      code: generateInvitationCode(),
      max_uses: v.maxUses,
      expires_at: new Date(Date.now() + v.validDays * 86_400_000).toISOString(),
      created_by: access.userId,
      class_id: v.classId,
      note: v.note,
    });
    if (!error) {
      revalidatePath("/admin/invitations");
      return done(success("admin.invitations.created"));
    }
    if (error.code !== "23505") return done(mapDbError(error));
  }
  return done(failure("errors.unexpected"));
}

export async function deactivateInvitationAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return done(failure("errors.invalid"));
  const supabase = await createClient();
  const { error, count } = await supabase.from("invitation_codes").update({ is_active: false }, { count: "exact" }).eq("id", id.data);
  if (error) return done(mapDbError(error));
  if (!count) return done(failure("errors.forbidden"));
  revalidatePath("/admin/invitations", "layout");
  return done(success("admin.invitations.deactivated"));
}
