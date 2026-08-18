import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { PendingContent } from "./pending-content";

export default async function PendingPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("users" as never)
    .select("status" as never)
    .eq("id" as never, user.id)
    .single();

  const row = profile as Record<string, unknown> | null;

  if (!row) {
    redirect("/login");
  }

  if (row.status === "active" || row.status === "approved") {
    redirect("/dashboard");
  }

  const { data: request } = await supabase
    .from("registration_requests" as never)
    .select("status, rejection_reason" as never)
    .eq("auth_user_id" as never, user.id)
    .order("created_at" as never, { ascending: false })
    .limit(1)
    .single();

  const req = request as Record<string, unknown> | null;

  return (
    <PendingContent
      status={(row.status as string) ?? "pending"}
      rejectionReason={(req?.rejection_reason as string) ?? null}
    />
  );
}
