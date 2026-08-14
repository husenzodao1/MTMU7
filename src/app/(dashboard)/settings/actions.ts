"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { z } from "zod";

export interface UserSettings {
  locale: string;
  notificationsEnabled: boolean;
  notificationTypes: Record<string, boolean>;
}

const settingsSchema = z.object({
  locale: z.enum(["tg", "ru", "en"]),
  notifications_enabled: z.coerce.boolean(),
  notification_message: z.coerce.boolean().optional(),
  notification_grade: z.coerce.boolean().optional(),
  notification_homework: z.coerce.boolean().optional(),
  notification_schedule: z.coerce.boolean().optional(),
  notification_attendance: z.coerce.boolean().optional(),
  notification_announcement: z.coerce.boolean().optional(),
  notification_library: z.coerce.boolean().optional(),
  notification_system: z.coerce.boolean().optional(),
});

export async function getUserSettings(): Promise<UserSettings> {
  const user = await getUserWithRole();
  if (!user) {
    return {
      locale: "tg",
      notificationsEnabled: true,
      notificationTypes: {
        message: true, grade: true, homework: true, schedule: true,
        attendance: true, announcement: true, library: true, system: true,
      },
    };
  }

  const supabase = await createServerClient();
  const { data } = await supabase
    .from("user_settings" as never)
    .select("locale, notifications_enabled, notification_types" as never)
    .eq("user_id" as never, user.id)
    .single();

  if (!data) {
    return {
      locale: "tg",
      notificationsEnabled: true,
      notificationTypes: {
        message: true, grade: true, homework: true, schedule: true,
        attendance: true, announcement: true, library: true, system: true,
      },
    };
  }

  const row = data as Record<string, unknown>;
  return {
    locale: row.locale as string,
    notificationsEnabled: row.notifications_enabled as boolean,
    notificationTypes: row.notification_types as Record<string, boolean>,
  };
}

export async function updateUserSettings(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const user = await getUserWithRole();
  if (!user) return { error: "Unauthorized" };

  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    raw[key] = value;
  }

  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) return { error: "Validation failed" };

  const notificationTypes: Record<string, boolean> = {
    message: parsed.data.notification_message ?? true,
    grade: parsed.data.notification_grade ?? true,
    homework: parsed.data.notification_homework ?? true,
    schedule: parsed.data.notification_schedule ?? true,
    attendance: parsed.data.notification_attendance ?? true,
    announcement: parsed.data.notification_announcement ?? true,
    library: parsed.data.notification_library ?? true,
    system: parsed.data.notification_system ?? true,
  };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("user_settings" as never)
    .upsert(
      {
        user_id: user.id,
        school_id: user.schoolId,
        locale: parsed.data.locale,
        notifications_enabled: parsed.data.notifications_enabled,
        notification_types: notificationTypes,
      } as never,
      { onConflict: "user_id" as never }
    );

  if (error) return { error: error.message };
  return { success: true };
}
