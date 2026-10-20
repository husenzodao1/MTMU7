"use server";

import { revalidatePath } from "next/cache";
import { uuid } from "@/lib/validation/uuid";
import { mapDbError } from "@/lib/actions/errors";
import { failure, success, type ActionResult } from "@/lib/actions/result";
import { getAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

export type ContactRequestStatus = "pending" | "approved" | "declined";

/**
 * A boy asks the school to let him reach a girl of another class on WhatsApp
 * (00101): the support desk is told, and the answer is seen on the support
 * page and in the notifications.
 */
export async function askContactPermissionAction(userId: string): Promise<ActionResult<ContactRequestStatus>> {
  const access = await getAccess();
  if (!access?.school) return failure("errors.not_authenticated");
  const target = uuid.safeParse(userId);
  if (!target.success) return failure("errors.invalid");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ask_contact_permission", { p_target: target.data });
  if (error) return mapDbError(error);
  const status = data === "approved" || data === "declined" ? data : "pending";
  revalidatePath("/support/contact");
  revalidatePath(`/profile/${target.data}`);
  return success(status === "pending" ? "portal.people.askSent" : undefined, status);
}

/** The desk's yes or no (/admin/support?view=permissions). */
export async function decideContactPermissionAction(requestId: string, approve: boolean): Promise<ActionResult> {
  const access = await getAccess();
  if (!access?.school) return failure("errors.not_authenticated");
  const id = uuid.safeParse(requestId);
  if (!id.success) return failure("errors.invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_contact_permission", { p_id: id.data, p_approve: approve });
  if (error) return mapDbError(error);
  revalidatePath("/admin/support");
  return success(approve ? "admin.support.approvedDone" : "admin.support.declinedDone");
}
