import { getTranslations } from "next-intl/server";
import { TabNav } from "@/components/ui/misc";
import { can, type Access } from "@/lib/auth/access";

/**
 * The account block's tabs: the accounts, the parents on Telegram with their
 * codes, and the guardians' records. One way into everything about people,
 * where there used to be three pages that half overlapped.
 */
export async function AccountsTabs({ access, active }: { access: Access; active: "accounts" | "parents" | "guardians" }) {
  const t = await getTranslations("accounts");
  const items = [
    can(access, "users.view") ? { key: "accounts", href: "/admin/accounts", label: t("tabs.accounts") } : null,
    can(access, "users.view") ? { key: "parents", href: "/admin/accounts/parents", label: t("tabs.parents") } : null,
    can(access, "guardians.view") || can(access, "guardians.manage") ? { key: "guardians", href: "/admin/guardians", label: t("tabs.guardians") } : null,
  ].filter((item): item is { key: string; href: string; label: string } => item !== null);
  if (items.length < 2) return null;
  return <TabNav label={t("title")} items={items.map((item) => ({ href: item.href, label: item.label, active: item.key === active }))} />;
}
