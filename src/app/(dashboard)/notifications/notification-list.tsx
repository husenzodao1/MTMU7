"use client";

import { useTranslations } from "next-intl";
import {
  Bell,
  MessageSquare,
  GraduationCap,
  FileText,
  Calendar,
  ClipboardCheck,
  Megaphone,
  BookOpen,
  Settings,
  CheckCheck,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { markAsRead, markAllAsRead, deleteReadNotifications } from "./actions";
import type { NotificationItem } from "./actions";

const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  message: MessageSquare,
  grade: GraduationCap,
  homework: FileText,
  schedule: Calendar,
  attendance: ClipboardCheck,
  announcement: Megaphone,
  library: BookOpen,
  system: Settings,
  document: FileText,
};

function groupByDate(
  notifications: NotificationItem[],
  t: ReturnType<typeof useTranslations>
): Array<{ label: string; items: NotificationItem[] }> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);

  const groups: Record<string, NotificationItem[]> = {};
  const labels: string[] = [];

  for (const n of notifications) {
    const date = new Date(n.createdAt);
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    let label: string;
    if (day.getTime() === today.getTime()) {
      label = t("today");
    } else if (day.getTime() === yesterday.getTime()) {
      label = t("yesterday");
    } else {
      label = t("earlier");
    }

    if (!groups[label]) {
      groups[label] = [];
      labels.push(label);
    }
    groups[label]!.push(n);
  }

  return labels.map((label) => ({ label, items: groups[label]! }));
}

function timeAgo(dateStr: string, t: ReturnType<typeof useTranslations>): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return t("justNow");
  if (minutes < 60) return t("minutesAgo", { count: minutes });
  if (hours < 24) return t("hoursAgo", { count: hours });
  return t("daysAgo", { count: days });
}

interface NotificationListProps {
  notifications: NotificationItem[];
}

export function NotificationList({ notifications }: NotificationListProps) {
  const t = useTranslations("notifications");
  const hasUnread = notifications.some((n) => !n.isRead);
  const hasRead = notifications.some((n) => n.isRead);

  if (notifications.length === 0) {
    return (
      <EmptyState
        icon={<Bell className="h-12 w-12" />}
        title={t("noNotifications")}
        description={t("noNotificationsDesc")}
      />
    );
  }

  const groups = groupByDate(notifications, t);
  const markAllAction = markAllAsRead.bind(null);
  const deleteReadAction = deleteReadNotifications.bind(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        {hasUnread && (
          <form action={markAllAction}>
            <Button variant="ghost" size="sm" type="submit">
              <CheckCheck className="mr-1.5 h-4 w-4" />
              {t("markAllRead")}
            </Button>
          </form>
        )}
        {hasRead && (
          <form action={deleteReadAction}>
            <Button variant="ghost" size="sm" type="submit" className="text-error-600 hover:text-error-700">
              <Trash2 className="mr-1.5 h-4 w-4" />
              {t("deleteRead")}
            </Button>
          </form>
        )}
      </div>

      {groups.map((group) => (
        <div key={group.label} className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            {group.label}
          </h2>
          <div className="space-y-1">
            {group.items.map((item, index) => {
              const Icon = typeIcons[item.type] ?? Bell;
              const markAction = markAsRead.bind(null, item.id);

              return (
                <form key={item.id} action={markAction}>
                  <button
                    type="submit"
                    className={`flex w-full items-start gap-3 rounded-[20px] px-4 py-3.5 text-left transition-all duration-[var(--duration-fast)] ease-[var(--ease-default)] hover:bg-neutral-100/80 press-scale animate-list-item ${
                      item.isRead ? "bg-white" : "bg-primary-50/50"
                    }`}
                    style={{ animationDelay: `${index * 30}ms` }}
                  >
                    <div
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                        item.isRead
                          ? "bg-neutral-100 text-neutral-400"
                          : "bg-neutral-900 text-white shadow-sm"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`text-sm ${
                            item.isRead
                              ? "font-normal text-neutral-600"
                              : "font-medium text-neutral-900"
                          }`}
                        >
                          {item.title}
                        </p>
                        {!item.isRead && (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-500" />
                        )}
                      </div>
                      {item.body && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-neutral-500">
                          {item.body}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-neutral-400">
                        {timeAgo(item.createdAt, t)}
                      </p>
                    </div>
                  </button>
                </form>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
