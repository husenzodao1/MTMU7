"use server";

import { revalidatePath } from "next/cache";
import { mapDbError } from "@/lib/actions/errors";
import { failure, success, type ActionResult } from "@/lib/actions/result";
import { requirePermission } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/uuid";

/** The desk marks a visitor's note as dealt with, or opens it again. */
export async function resolveSupportRequestAction(requestId: string, done: boolean): Promise<ActionResult> {
  await requirePermission("messages.moderate");
  if (!isUuid(requestId)) return failure("errors.invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_support_request", { p_request_id: requestId, p_done: done });
  if (error) return mapDbError(error);
  revalidatePath("/admin/support");
  return success(done ? "admin.support.markedDone" : "admin.support.reopened");
}
