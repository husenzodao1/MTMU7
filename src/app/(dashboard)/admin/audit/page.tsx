import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/guard";
import { hasPermission } from "@/lib/permissions/check";
import { createServerClient } from "@/lib/supabase/server";
import { AdminNav } from "../admin-nav";
import { AuditTable } from "./audit-table";
import { ErrorState } from "@/components/ui/error-state";

async function getAuditEntries() {
  const supabase = await createServerClient();

  const { data } = await supabase
    .from("audit_logs" as never)
    .select(
      "id, action, entity_type, entity_id, user_public_id, created_at" as never
    )
    .order("created_at" as never, { ascending: false })
    .limit(100);

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    action: row.action as string,
    entityType: row.entity_type as string,
    entityId: (row.entity_id as string) ?? null,
    userPublicId: (row.user_public_id as string) ?? null,
    createdAt: row.created_at as string,
  }));
}

export default async function AuditLogPage() {
  await requireAdmin();
  const tAdmin = await getTranslations("admin");
  const tErrors = await getTranslations("errors");

  const canView = await hasPermission("audit_logs.read");
  if (!canView) {
    return (
      <div>
        <AdminNav />
        <ErrorState
          title={tErrors("forbidden")}
          description={tErrors("forbiddenDescription")}
        />
      </div>
    );
  }

  const entries = await getAuditEntries();

  return (
    <div>
      <AdminNav />
      <div className="animate-in">
        <h1 className="mb-6 text-2xl font-bold text-neutral-900">
          {tAdmin("auditLog")}
        </h1>
        <AuditTable entries={entries} />
      </div>
    </div>
  );
}
