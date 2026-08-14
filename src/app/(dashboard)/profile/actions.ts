"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { z } from "zod";

export interface FullProfile {
  id: string;
  publicId: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  email: string;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  avatarUrl: string | null;
  schoolName: string;
  roles: Array<{ nameTg: string; nameRu: string | null }>;
}

export async function getFullProfile(): Promise<FullProfile | null> {
  const user = await getUserWithRole();
  if (!user) return null;

  const supabase = await createServerClient();
  const { data } = await supabase
    .from("users" as never)
    .select(
      "public_id, first_name, last_name, middle_name, email, phone, date_of_birth, gender, avatar_url, schools!inner(name_tg)" as never
    )
    .eq("id" as never, user.id)
    .single();

  if (!data) return null;

  const row = data as Record<string, unknown>;
  const school = row.schools as Record<string, unknown>;

  return {
    id: user.id,
    publicId: row.public_id as string,
    firstName: row.first_name as string,
    lastName: row.last_name as string,
    middleName: row.middle_name as string | null,
    email: row.email as string,
    phone: row.phone as string | null,
    dateOfBirth: row.date_of_birth as string | null,
    gender: row.gender as string | null,
    avatarUrl: row.avatar_url as string | null,
    schoolName: school.name_tg as string,
    roles: user.roles.map((r) => ({ nameTg: r.nameTg, nameRu: r.nameRu })),
  };
}

const updateProfileSchema = z.object({
  phone: z.string().max(50).optional().or(z.literal("")),
  middle_name: z.string().max(100).optional().or(z.literal("")),
});

export async function updateProfile(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const user = await getUserWithRole();
  if (!user) return { error: "Unauthorized" };

  const parsed = updateProfileSchema.safeParse({
    phone: formData.get("phone"),
    middle_name: formData.get("middle_name"),
  });

  if (!parsed.success) return { error: "Validation failed" };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("users" as never)
    .update({
      phone: parsed.data.phone || null,
      middle_name: parsed.data.middle_name || null,
    } as never)
    .eq("id" as never, user.id);

  if (error) return { error: error.message };
  return { success: true };
}
