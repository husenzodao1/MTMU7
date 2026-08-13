"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { updateUserSettings } from "./actions";
import type { UserSettings } from "./actions";

const notifTypes = [
  "message",
  "grade",
  "homework",
  "schedule",
  "attendance",
  "announcement",
  "library",
  "system",
] as const;

const notifTypeKeys: Record<string, string> = {
  message: "notifMessage",
  grade: "notifGrade",
  homework: "notifHomework",
  schedule: "notifSchedule",
  attendance: "notifAttendance",
  announcement: "notifAnnouncement",
  library: "notifLibrary",
  system: "notifSystem",
};

interface SettingsFormProps {
  settings: UserSettings;
}

export function SettingsForm({ settings }: SettingsFormProps) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [state, formAction, isPending] = useActionState(updateUserSettings, null);

  return (
    <form action={formAction} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("language")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <label className="flex-1">
              <input
                type="radio"
                name="locale"
                value="tg"
                defaultChecked={settings.locale === "tg"}
                className="peer sr-only"
              />
              <div className="cursor-pointer rounded-lg border-2 border-neutral-200 px-4 py-3 text-center text-sm font-medium text-neutral-600 transition-all duration-[var(--duration-fast)] ease-[var(--ease-default)] peer-checked:border-primary-500 peer-checked:bg-primary-50 peer-checked:text-primary-700 hover:border-neutral-300 press-scale">
                {t("tajik")}
              </div>
            </label>
            <label className="flex-1">
              <input
                type="radio"
                name="locale"
                value="ru"
                defaultChecked={settings.locale === "ru"}
                className="peer sr-only"
              />
              <div className="cursor-pointer rounded-lg border-2 border-neutral-200 px-4 py-3 text-center text-sm font-medium text-neutral-600 transition-all duration-[var(--duration-fast)] ease-[var(--ease-default)] peer-checked:border-primary-500 peer-checked:bg-primary-50 peer-checked:text-primary-700 hover:border-neutral-300 press-scale">
                {t("russian")}
              </div>
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("notificationSettings")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            name="notifications_enabled"
            label={t("enableNotifications")}
            defaultChecked={settings.notificationsEnabled}
          />

          <div className="border-t border-neutral-100 pt-4">
            <div className="space-y-3">
              {notifTypes.map((type) => (
                <ToggleRow
                  key={type}
                  name={`notification_${type}`}
                  label={t(notifTypeKeys[type]!)}
                  defaultChecked={settings.notificationTypes[type] ?? true}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {(state as { error?: string } | null)?.error && (
        <p className="text-sm text-error-600">
          {String((state as { error?: string }).error)}
        </p>
      )}

      {(state as { success?: boolean } | null)?.success && (
        <p className="text-sm text-success-600 animate-fade-in">{t("saved")}</p>
      )}

      <Button type="submit" loading={isPending}>
        {tc("save")}
      </Button>
    </form>
  );
}

function ToggleRow({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-lg px-1 py-1.5">
      <span className="text-sm text-neutral-700">{label}</span>
      <input type="hidden" name={name} value="false" />
      <div className="relative">
        <input
          type="checkbox"
          name={name}
          value="true"
          defaultChecked={defaultChecked}
          role="switch"
          className="peer sr-only"
        />
        <div className="h-6 w-11 rounded-full bg-neutral-200 transition-colors duration-[var(--duration-fast)] ease-[var(--ease-default)] peer-checked:bg-primary-500" />
        <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-[var(--duration-fast)] ease-[var(--ease-spring)] peer-checked:translate-x-5" />
      </div>
    </label>
  );
}
