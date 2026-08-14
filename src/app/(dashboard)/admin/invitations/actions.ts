"use server";

import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i]! % chars.length];
  }
  return code;
}

const createInvitationSchema = z.object({
  roleId: z.string().uuid(),
  maxUses: z.coerce.number().int().min(1).max(1000),
  expiresInDays: z.coerce.number().int().min(1).max(365).optional(),
});

export async function createInvitationAction(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const user = await requireAdmin();

  const parsed = createInvitationSchema.safeParse({
    roleId: formData.get("roleId"),
    maxUses: formData.get("maxUses"),
    expiresInDays: formData.get("expiresInDays") || undefined,
  });

  if (!parsed.success) {
    return { error: "invalidData" };
  }

  const supabase = await createServerClient();

  const expiresAt = parsed.data.expiresInDays
    ? new Date(Date.now() + parsed.data.expiresInDays * 86400000).toISOString()
    : null;

  const { error } = await supabase
    .from("invitation_codes" as never)
    .insert({
      school_id: user.schoolId,
      role_id: parsed.data.roleId,
      code: generateCode(),
      max_uses: parsed.data.maxUses,
      expires_at: expiresAt,
      created_by: user.id,
    } as never);

  if (error) {
    if (error.message?.includes("admin-level")) {
      return { error: "cannotGrantAdmin" };
    }
    return { error: "saveFailed" };
  }

  revalidatePath("/admin/invitations");
  return { error: null };
}

export async function deleteInvitationAction(id: string) {
  const user = await requireAdmin();

  const supabase = await createServerClient();
  await supabase
    .from("invitation_codes" as never)
    .update({ is_active: false } as never)
    .eq("id" as never, id)
    .eq("school_id" as never, user.schoolId);

  revalidatePath("/admin/invitations");
}

export async function getInvitationsAction() {
  const user = await requireAdmin();

  const supabase = await createServerClient();
  const { data } = await supabase
    .from("invitation_codes" as never)
    .select("*, roles:role_id(slug, name_tg, name_ru)" as never)
    .eq("school_id" as never, user.schoolId)
    .eq("is_active" as never, true)
    .order("created_at" as never, { ascending: false });

  return (data ?? []) as Array<Record<string, unknown>>;
}

export async function getRolesForInvitationAction() {
  const user = await requireAdmin();

  const supabase = await createServerClient();
  const { data } = await supabase
    .from("roles" as never)
    .select("id, slug, name_tg, name_ru, level" as never)
    .eq("school_id" as never, user.schoolId)
    .eq("is_active" as never, true)
    .gt("level" as never, 1)
    .order("level" as never, { ascending: true });

  return (data ?? []) as Array<Record<string, unknown>>;
}
