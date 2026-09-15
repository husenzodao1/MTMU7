"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { mapDbError } from "@/lib/actions/errors";
import { done, failure, formDataToObject, parseInput, type FormState } from "@/lib/actions/result";
import { can, canAny, getAccess } from "@/lib/auth/access";
import { localInputToIso } from "@/lib/i18n/zoned";
import { checkFile, isValidStoragePath } from "@/lib/storage/files";
import { createClient } from "@/lib/supabase/server";
import { ROLE_SLUGS } from "@/features/content/constants";

const AUDIENCES = ["school", "staff", "students", "parents", "roles", "classes", "public"] as const;

const schema = z.object({
  id: z.string().uuid().optional().or(z.literal("")).transform((v) => v || undefined),
  intent: z.enum(["draft", "publish", "archive", "restore"]),
  title: z.string().trim().min(3, "validation.too_small").max(300, "validation.too_big"),
  body: z.string().trim().min(1, "validation.required").max(20000, "validation.too_big"),
  priority: z.enum(["normal", "important", "critical"]),
  audienceType: z.enum(AUDIENCES),
  publishAt: z.string().optional(),
  expiresAt: z.string().optional(),
  attachmentPath: z.string().max(500).optional(),
  attachmentName: z.string().max(255).optional(),
  attachmentSize: z.coerce.number().int().positive().optional(),
  attachmentType: z.string().max(100).optional(),
  removeAttachment: z.string().optional(),
});

export async function saveAnnouncementAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!canAny(access, ["announcements.create", "announcements.publish"])) return done(failure("errors.forbidden"));
  const input = parseInput(schema, formDataToObject(formData));
  if (!input.ok) return done(input.result);
  const v = input.data;
  const timeZone = access.school.timezone;

  const roles = formData.getAll("audienceRoles").filter((r): r is string => typeof r === "string" && (ROLE_SLUGS as readonly string[]).includes(r));
  const classIds = formData.getAll("audienceClassIds").filter((c): c is string => typeof c === "string" && z.string().uuid().safeParse(c).success);
  if (v.audienceType === "roles" && roles.length === 0) return done(failure("errors.validation", { audienceRoles: ["validation.chooseOne"] }));
  if (v.audienceType === "classes" && classIds.length === 0) return done(failure("errors.validation", { audienceClassIds: ["validation.chooseOne"] }));
  if (v.audienceType === "public" && !can(access, "announcements.publish")) return done(failure("errors.publish_permission"));

  const publishAt = localInputToIso(v.publishAt, timeZone) ?? new Date().toISOString();
  const expiresAt = localInputToIso(v.expiresAt, timeZone);
  if (expiresAt && expiresAt <= publishAt) return done(failure("errors.validation", { expiresAt: ["validation.dateOrder"] }));

  let attachment: { attachment_path: string | null; attachment_name: string | null } | undefined;
  if (v.attachmentPath) {
    const check = checkFile("document", { name: v.attachmentName ?? "", type: v.attachmentType ?? "", size: v.attachmentSize ?? 0 });
    if (!isValidStoragePath(v.attachmentPath, access.school.id, "announcements") || !check.ok) return done(failure("errors.invalid_file_path"));
    attachment = { attachment_path: v.attachmentPath, attachment_name: v.attachmentName ?? "file" };
  } else if (v.removeAttachment === "on") {
    attachment = { attachment_path: null, attachment_name: null };
  }

  const status = v.intent === "publish" ? "published" : v.intent === "archive" ? "archived" : "draft";
  const row = {
    title: v.title,
    body: v.body,
    priority: v.priority,
    audience_type: v.audienceType,
    audience_roles: v.audienceType === "roles" ? roles : [],
    audience_class_ids: v.audienceType === "classes" ? classIds : [],
    publish_at: publishAt,
    expires_at: expiresAt,
    status,
    ...(attachment ?? {}),
  };

  const supabase = await createClient();
  let id = v.id;
  if (id) {
    const { error, count } = await supabase.from("announcements").update(row, { count: "exact" }).eq("id", id);
    if (error) return done(mapDbError(error));
    if (!count) return done(failure("errors.forbidden"));
  } else {
    const { data, error } = await supabase.from("announcements").insert({ ...row, school_id: access.school.id }).select("id").single();
    if (error || !data) return done(mapDbError(error));
    id = data.id;
  }
  revalidatePath("/admin/announcements");
  revalidatePath("/announcements");
  revalidatePath("/dashboard");
  redirect(`/admin/announcements?saved=${v.intent}`);
}

export async function deleteAnnouncementDraftAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return done(failure("errors.invalid"));
  const supabase = await createClient();
  const { error, count } = await supabase.from("announcements").delete({ count: "exact" }).eq("id", id.data).eq("status", "draft");
  if (error) return done(mapDbError(error));
  if (!count) return done(failure("errors.forbidden"));
  revalidatePath("/admin/announcements");
  redirect("/admin/announcements?saved=deleted");
}
