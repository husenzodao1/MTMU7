import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/guard";
import { AdminNav } from "../admin-nav";
import { getInvitationsAction, getRolesForInvitationAction } from "./actions";
import { InvitationsList } from "./invitations-list";

export default async function InvitationsPage() {
  await requireAdmin();
  const t = await getTranslations("admin");
  const [invitations, roles] = await Promise.all([
    getInvitationsAction(),
    getRolesForInvitationAction(),
  ]);

  return (
    <div>
      <AdminNav />
      <div className="space-y-6 animate-in">
        <h1 className="text-2xl font-bold text-neutral-900">{t("invitations")}</h1>
        <InvitationsList invitations={invitations} roles={roles} />
      </div>
    </div>
  );
}
