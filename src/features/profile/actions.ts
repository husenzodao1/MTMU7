"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuid } from "@/lib/validation/uuid";
import { passwordSchema } from "@/features/auth/schemas";
import { mapDbError } from "@/lib/actions/errors";
import { done, failure, formDataToObject, parseInput, success, type ActionResult, type FormState } from "@/lib/actions/result";
import { getAccess } from "@/lib/auth/access";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { NOTIFICATION_PREFERENCE_TYPES } from "@/features/profile/constants";

const contactSchema = z.object({
  phone: z.string().trim().max(30).regex(/^[+0-9 ()-]*$/, "validation.phone").optional().transform((v) => v || null),
  // The handle people are found by. A leading @ is how it is written and read,
  // but only the handle itself is stored.
  nickname: z
    .string()
    .trim()
    .transform((v) => v.replace(/^@/, ""))
    .refine((v) => v === "" || /^[A-Za-z0-9._]{3,30}$/.test(v), "validation.nickname")
    .optional()
    .transform((v) => v || null),
});

/** Contact details — with the photo (below), the only profile fields users may change themselves. */
export async function updateContactAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const input = parseInput(contactSchema, formDataToObject(formData));
  if (!input.ok) return done(input.result);
  const v = input.data;

  const patch = { phone: v.phone, nickname: v.nickname };
  const supabase = await createClient();
  const { error } = await supabase.from("users").update(patch).eq("id", access.userId);
  if (error) {
    // The handle is unique inside a school; say which field is the problem.
    if (error.code === "23505") return done(failure("errors.validation", { nickname: ["validation.nicknameTaken"] }));
    if (error.code === "23514") return done(failure("errors.validation", { nickname: ["validation.nickname"] }));
    return done(mapDbError(error));
  }
  revalidatePath("/", "layout");
  return done(success("portal.profile.saved"));
}

/**
 * One's own photo, saved the moment it is cropped (avatar-editor.tsx): the
 * picture already went up to the avatars bucket under the person's own
 * folder, as a JPEG the editor drew; here the address is checked and kept.
 */
export async function setAvatarAction(path: string): Promise<ActionResult> {
  const access = await getAccess();
  if (!access?.school) return failure("errors.not_authenticated");
  const prefix = `${access.school.id}/${access.userId}/`;
  if (typeof path !== "string" || !path.startsWith(prefix) || path.includes("..") || !/^[0-9a-f/-]+\.jpg$/.test(path)) {
    return failure("errors.invalid_file_path");
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("users")
    .update({ avatar_url: `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${path}` })
    .eq("id", access.userId);
  if (error) return mapDbError(error);
  revalidatePath("/", "layout");
  return success("portal.profile.photoSaved");
}

export async function removeAvatarAction(): Promise<ActionResult> {
  const access = await getAccess();
  if (!access?.school) return failure("errors.not_authenticated");
  const supabase = await createClient();
  const { error } = await supabase.from("users").update({ avatar_url: null }).eq("id", access.userId);
  if (error) return mapDbError(error);
  revalidatePath("/", "layout");
  return success("portal.profile.photoRemoved");
}

const passwordChangeSchema = z
  .object({ currentPassword: z.string().min(1, "validation.required").max(128), password: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "validation.passwordMismatch" })
  .refine((v) => v.password !== v.currentPassword, { path: ["password"], message: "validation.passwordSame" });

/** Re-verifies the current password before setting a new one. */
export async function changePasswordAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access) return done(failure("errors.not_authenticated"));
  const input = parseInput(passwordChangeSchema, formDataToObject(formData));
  if (!input.ok) return done(input.result);

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.signInWithPassword({ email: access.email, password: input.data.currentPassword });
  if (verifyError) {
    return done(failure("errors.validation", { currentPassword: [verifyError.status === 429 ? "errors.rate_limited" : "validation.currentPassword"] }));
  }
  const { error } = await supabase.auth.updateUser({ password: input.data.password });
  if (error) return done(failure(error.status === 429 ? "errors.rate_limited" : "errors.unexpected"));
  return done(success("portal.profile.passwordChanged"));
}

/** Personal notification preferences (school-wide switches still apply first). */
export async function updateNotificationSettingsAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const types = Object.fromEntries(NOTIFICATION_PREFERENCE_TYPES.map((type) => [type, formData.get(`type_${type}`) === "on"]));
  const supabase = await createClient();
  const { error } = await supabase.from("user_settings").upsert(
    {
      user_id: access.userId,
      school_id: access.school.id,
      notifications_enabled: formData.get("enabled") === "on",
      notification_types: types,
    },
    { onConflict: "user_id" }
  );
  if (error) return done(mapDbError(error));
  revalidatePath("/settings");
  return done(success("common.saved"));
}


export async function sendFriendRequestAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const userId = uuid.safeParse(formData.get("userId"));
  if (!userId.success || userId.data === access.userId) return done(failure("errors.invalid"));
  const supabase = await createClient();
  const { error } = await supabase.from("friend_requests").insert({ sender_id: access.userId, receiver_id: userId.data, school_id: access.school.id });
  if (error) return done(error.code === "23505" || /already exists/i.test(error.message) ? failure("errors.friend_request_exists") : mapDbError(error));
  revalidatePath("/friends");
  revalidatePath(`/profile/${userId.data}`);
  return done(success("portal.friends.requestSent"));
}

export async function respondFriendRequestAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const parsed = z
    .object({ requestId: uuid, decision: z.enum(["accept", "reject", "cancel", "remove"]) })
    .safeParse({ requestId: formData.get("requestId"), decision: formData.get("decision") });
  if (!parsed.success) return done(failure("errors.invalid"));
  const supabase = await createClient();
  const { data: request } = await supabase
    .from("friend_requests")
    .select("id, sender_id, receiver_id, status")
    .eq("id", parsed.data.requestId)
    .maybeSingle();
  if (!request) return done(failure("errors.not_found"));

  const iAmSender = request.sender_id === access.userId;
  const { decision } = parsed.data;
  let status: "accepted" | "rejected" | "cancelled";
  if (decision === "accept" || decision === "reject") {
    if (iAmSender || request.status !== "pending") return done(failure("errors.forbidden"));
    status = decision === "accept" ? "accepted" : "rejected";
  } else {
    // Cancelling one's own request or ending a friendship: RLS allows sender → cancelled, receiver → rejected.
    status = iAmSender ? "cancelled" : "rejected";
  }
  const { error, count } = await supabase
    .from("friend_requests")
    .update({ status }, { count: "exact" })
    .eq("id", request.id);
  if (error) return done(mapDbError(error));
  if (!count) return done(failure("errors.forbidden"));
  revalidatePath("/friends");
  return done(success(`portal.friends.done.${decision}`));
}
