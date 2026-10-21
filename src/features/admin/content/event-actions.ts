"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuid } from "@/lib/validation/uuid";
import { mapDbError } from "@/lib/actions/errors";
import { done, failure, formDataToObject, parseInput, success, type FormState } from "@/lib/actions/result";
import { can, getAccess } from "@/lib/auth/access";
import { localInputToIso } from "@/lib/i18n/zoned";
import { checkFile, isValidStoragePath } from "@/lib/storage/files";
import { createClient } from "@/lib/supabase/server";
import { EVENT_AUDIENCES, EVENT_CATEGORIES } from "@/features/content/constants";

const schema = z.object({
  id: uuid.optional().or(z.literal("")).transform((v) => v || undefined),
  title: z.string().trim().min(3, "validation.too_small").max(300, "validation.too_big"),
  description: z.string().max(20000, "validation.too_big").optional().transform((v) => v?.trim() || null),
  category: z.enum(EVENT_CATEGORIES),
  audience: z.enum(EVENT_AUDIENCES),
  startsAt: z.string().min(1, "validation.required"),
  endsAt: z.string().optional(),
  allDay: z.string().optional().transform((v) => v === "on"),
  location: z.string().trim().max(300).optional().transform((v) => v || null),
  organizer: z.string().trim().max(200).optional().transform((v) => v || null),
  status: z.enum(["draft", "published"]),
  imagePath: z.string().max(500).optional(),
  imageName: z.string().max(255).optional(),
  imageSize: z.coerce.number().int().positive().optional(),
  imageType: z.string().max(100).optional(),
  removeImage: z.string().optional(),
});

export async function saveEventAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!can(access, "events.manage")) return done(failure("errors.forbidden"));
  const input = parseInput(schema, formDataToObject(formData));
  if (!input.ok) return done(input.result);
  const v = input.data;
  const tz = access.school.timezone;
  const startsAt = localInputToIso(v.startsAt, tz);
  const endsAt = localInputToIso(v.endsAt, tz);
  if (!startsAt) return done(failure("errors.validation", { startsAt: ["validation.date"] }));
  if (endsAt && endsAt < startsAt) return done(failure("errors.validation", { endsAt: ["validation.dateOrder"] }));

  let image: { image_path: string | null } | undefined;
  if (v.imagePath) {
    const check = checkFile("image", { name: v.imageName ?? "", type: v.imageType ?? "", size: v.imageSize ?? 0 });
    if (!isValidStoragePath(v.imagePath, access.school.id, "events") || !check.ok) return done(failure("errors.invalid_file_path"));
    image = { image_path: v.imagePath };
  } else if (v.removeImage === "on") {
    image = { image_path: null };
  }

  const row = {
    title: v.title,
    description: v.description,
    category: v.category,
    audience: v.audience,
    starts_at: startsAt,
    ends_at: endsAt,
    all_day: v.allDay,
    location: v.location,
    organizer: v.organizer,
    status: v.status,
    ...(image ?? {}),
  };
  const supabase = await createClient();
  const { error } = v.id ? await supabase.from("events").update(row).eq("id", v.id) : await supabase.from("events").insert({ ...row, school_id: access.school.id });
  if (error) return done(mapDbError(error));
  revalidatePath("/admin/events");
  revalidatePath("/events");
  revalidatePath("/", "layout");
  return done(success(v.id ? "common.saved" : "common.created"));
}

export async function setEventStatusAction(_state: FormState, formData: FormData): Promise<FormState> {
  const access = await getAccess();
  if (!access?.school) return done(failure("errors.not_authenticated"));
  if (!can(access, "events.manage")) return done(failure("errors.forbidden"));
  const parsed = z
    .object({ id: uuid, status: z.enum(["draft", "published", "cancelled", "archived"]) })
    .safeParse({ id: formData.get("id"), status: formData.get("status") });
  if (!parsed.success) return done(failure("errors.invalid"));
  const supabase = await createClient();
  const { error, count } = await supabase.from("events").update({ status: parsed.data.status }, { count: "exact" }).eq("id", parsed.data.id);
  if (error) return done(mapDbError(error));
  if (!count) return done(failure("errors.forbidden"));
  revalidatePath("/admin/events");
  revalidatePath("/events");
  return done(success("common.saved"));
}
