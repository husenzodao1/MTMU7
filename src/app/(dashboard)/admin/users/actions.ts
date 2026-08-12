"use server";

import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function toggleUserActiveAction(userId: string, active: boolean) {
  await requireAdmin();

  const supabase = await createServerClient();
  await supabase
    .from("users" as never)
    .update({ is_active: active } as never)
    .eq("id" as never, userId);

  revalidatePath("/admin/users");
}
