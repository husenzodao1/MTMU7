"use server";

import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const schoolSettingsSchema = z.object({
  shortName: z.string().min(1).max(100),
  fullName: z.string().min(1).max(500),
  address: z.string().max(500).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional().or(z.literal("")),
  website: z.string().max(255).optional(),
  idPrefix: z.string().min(1).max(5),
  logoUrl: z.string().url().optional().or(z.literal("")),
});

export async function updateSchoolSettingsAction(
  _prevState: { error: string | null; success: boolean },
  formData: FormData
): Promise<{ error: string | null; success: boolean }> {
  const user = await requireAdmin();

  const parsed = schoolSettingsSchema.safeParse({
    shortName: formData.get("shortName"),
    fullName: formData.get("fullName"),
    address: formData.get("address") || undefined,
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || "",
    website: formData.get("website") || undefined,
    idPrefix: formData.get("idPrefix"),
    logoUrl: formData.get("logoUrl") || "",
  });

  if (!parsed.success) {
    return { error: "invalidData", success: false };
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("schools" as never)
    .update({
      short_name: parsed.data.shortName,
      full_name: parsed.data.fullName,
      address: parsed.data.address ?? null,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email || null,
      website: parsed.data.website ?? null,
      id_prefix: parsed.data.idPrefix,
      logo_url: parsed.data.logoUrl || null,
    } as never)
    .eq("id" as never, user.schoolId);

  if (error) {
    return { error: "saveFailed", success: false };
  }

  revalidatePath("/admin/school");
  return { error: null, success: true };
}
