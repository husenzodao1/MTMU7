"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toggleNotificationTypeAction } from "./actions";
import { Bell } from "lucide-react";

interface NotifSetting {
  id: string;
  type: string;
  isEnabled: boolean;
}

export function NotificationSettings({
  settings,
}: {
  settings: NotifSetting[];
}) {
  const t = useTranslations("admin");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("notifications")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {settings.map((setting) => (
            <div
              key={setting.id}
              className="flex items-center justify-between rounded-lg border border-neutral-200 p-4 transition-colors duration-[var(--duration-fast)] hover:bg-neutral-50"
            >
              <div className="flex items-center gap-3">
                <Bell className="h-5 w-5 text-neutral-400" />
                <span className="font-medium text-neutral-800">
                  {setting.type}
                </span>
              </div>
              <form
                action={async () => {
                  "use server";
                  await toggleNotificationTypeAction(
                    setting.id,
                    !setting.isEnabled
                  );
                }}
              >
                <Button
                  type="submit"
                  variant={setting.isEnabled ? "outline" : "default"}
                  size="sm"
                >
                  {setting.isEnabled
                    ? t("disableModule")
                    : t("enableModule")}
                </Button>
              </form>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
