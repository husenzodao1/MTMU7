"use client";

import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollText } from "lucide-react";

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  userPublicId: string | null;
  createdAt: string;
}

const actionColors: Record<string, string> = {
  create: "bg-green-50 text-green-700",
  update: "bg-blue-50 text-blue-700",
  delete: "bg-red-50 text-red-700",
  login: "bg-purple-50 text-purple-700",
  logout: "bg-neutral-50 text-neutral-700",
  enable: "bg-green-50 text-green-700",
  disable: "bg-amber-50 text-amber-700",
  assign: "bg-purple-50 text-purple-700",
  revoke: "bg-red-50 text-red-700",
};

export function AuditTable({ entries }: { entries: AuditEntry[] }) {
  const tCommon = useTranslations("common");

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<ScrollText className="h-12 w-12" />}
        title={tCommon("noData")}
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50">
            <th className="px-4 py-3 text-left font-medium text-neutral-600">
              User
            </th>
            <th className="px-4 py-3 text-left font-medium text-neutral-600">
              Action
            </th>
            <th className="px-4 py-3 text-left font-medium text-neutral-600">
              Entity
            </th>
            <th className="px-4 py-3 text-left font-medium text-neutral-600">
              Date
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={entry.id}
              className="border-b border-neutral-100 transition-colors duration-[var(--duration-fast)] hover:bg-neutral-50"
            >
              <td className="px-4 py-3 font-mono text-xs text-neutral-600">
                {entry.userPublicId ?? "system"}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${actionColors[entry.action] ?? "bg-neutral-50 text-neutral-700"}`}
                >
                  {entry.action}
                </span>
              </td>
              <td className="px-4 py-3 text-neutral-700">
                {entry.entityType}
                {entry.entityId && (
                  <span className="ml-1 text-xs text-neutral-400">
                    {entry.entityId.slice(0, 8)}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-neutral-500">
                {new Date(entry.createdAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
