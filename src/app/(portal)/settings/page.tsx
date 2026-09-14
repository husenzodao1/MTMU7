import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { setLocaleAction } from "@/app/actions/session";
import { updateNotificationSettingsAction } from "@/features/profile/actions";
import { NOTIFICATION_PREFERENCE_TYPES } from "@/features/profile/constants";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { buttonClasses } from "@/components/ui/button";
import { Checkbox, Fieldset } from "@/components/ui/form-controls";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/surface";
import { requireAccess } from "@/lib/auth/guards";
import { LOCALES } from "@/lib/i18n/text";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("settings") };
}

export default async function SettingsPage() {
  const access = await requireAccess();
  const t = await getTranslations("portal.settings");
  const tn = await getTranslations("portal.notifications.types");
  const tl = await getTranslations("common.locales");
  const locale = await getLocale();
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("user_settings")
    .select("notifications_enabled, notification_types")
    .eq("user_id", access.userId)
    .maybeSingle();
  const types = (settings?.notification_types ?? {}) as Record<string, boolean>;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid max-w-3xl gap-5">
        <Card>
          <CardHeader title={t("language")} description={t("languageHint")} />
          <CardBody>
            <form action={setLocaleAction} className="flex flex-wrap gap-2">
              {LOCALES.map((code) => (
                <button
                  key={code}
                  type="submit"
                  name="locale"
                  value={code}
                  lang={code}
                  aria-pressed={code === locale}
                  className={cn(buttonClasses(code === locale ? "primary" : "secondary"), "min-w-28")}
                >
                  {tl(code)}
                </button>
              ))}
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("notifications")} description={t("notificationsHint")} />
          <CardBody>
            <ActionForm action={updateNotificationSettingsAction} className="space-y-4">
              <Checkbox name="enabled" defaultChecked={settings?.notifications_enabled ?? true} label={t("enableAll")} description={t("enableAllHint")} />
              <Fieldset legend={t("categories")}>
                <div className="grid gap-x-6 sm:grid-cols-2">
                  {NOTIFICATION_PREFERENCE_TYPES.map((type) => (
                    <Checkbox key={type} name={`type_${type}`} defaultChecked={types[type] ?? true} label={tn(type)} />
                  ))}
                </div>
              </Fieldset>
              <SubmitButton>{t("save")}</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
