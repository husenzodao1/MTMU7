import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { setLocaleAction } from "@/app/actions/session";
import { updateNotificationSettingsAction } from "@/features/profile/actions";
import { NOTIFICATION_PREFERENCE_TYPES } from "@/features/profile/constants";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { buttonClasses } from "@/components/ui/button";
import { Checkbox, Fieldset } from "@/components/ui/form-controls";
import { cookies } from "next/headers";
import { SignOutButton } from "@/features/auth/sign-out-button";
import { TwoFactorSettings } from "@/features/auth/two-factor-settings";
import { MeHeader } from "@/features/profile/me-header";
import { photoLabels } from "@/features/profile/photo-labels";
import { TextSizePicker, ThemePicker } from "@/features/settings/display-settings";
import { Card, CardBody, CardHeader } from "@/components/ui/surface";
import { displayName } from "@/lib/auth/access";
import { requireAccess } from "@/lib/auth/guards";
import { asTextSize, TEXT_SIZE_COOKIE } from "@/lib/display-prefs";
import { DEFAULT_THEME, isTheme, THEME_COOKIE, THEMES, type Theme } from "@/lib/theme";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

/** Two languages side by side, Tajik the width of both under them (globals.css, .locale-grid). */
const LOCALE_ORDER = ["ru", "en", "tg"] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("settings") };
}

export default async function SettingsPage() {
  const access = await requireAccess();
  const t = await getTranslations("portal.settings");
  const tn = await getTranslations("portal.notifications.types");
  const tl = await getTranslations("common.locales");
  const tt = await getTranslations("common.themes");
  const tnav = await getTranslations("nav");
  const locale = await getLocale();
  const jar = await cookies();
  const cookieTheme = jar.get(THEME_COOKIE)?.value;
  const theme: Theme = isTheme(cookieTheme) ? cookieTheme : DEFAULT_THEME;
  const textSize = asTextSize(jar.get(TEXT_SIZE_COOKIE)?.value);
  const themeNames = Object.fromEntries(THEMES.map((name) => [name, { name: tt(`${name}.name`), hint: tt(`${name}.hint`) }])) as Record<
    Theme,
    { name: string; hint: string }
  >;
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("user_settings")
    .select("notifications_enabled, notification_types")
    .eq("user_id", access.userId)
    .maybeSingle();
  const types = (settings?.notification_types ?? {}) as Record<string, boolean>;
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const twoFactorOn = Boolean(factors?.totp?.some((factor) => factor.status === "verified"));

  return (
    <>
      <MeHeader
        name={displayName(access)}
        avatarUrl={access.avatarUrl}
        active="settings"
        labels={{ profile: tnav("profile"), settings: tnav("settings") }}
        photo={{ folder: `${access.school?.id}/${access.userId}`, labels: await photoLabels() }}
      />
      <div className="mx-auto grid max-w-3xl gap-5">
        <Card>
          <CardHeader title={t("language")} description={t("languageHint")} />
          <CardBody>
            <form action={setLocaleAction} className="locale-grid">
              {LOCALE_ORDER.map((code) => (
                <button
                  key={code}
                  type="submit"
                  name="locale"
                  value={code}
                  lang={code}
                  aria-pressed={code === locale}
                  className={cn(buttonClasses(code === locale ? "primary" : "secondary"), "w-full")}
                >
                  {tl(code)}
                </button>
              ))}
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={tt("label")} description={t("themeHint")} />
          <CardBody>
            <ThemePicker initial={theme} names={themeNames} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("textSize")} description={t("textSizeHint")} />
          <CardBody>
            <TextSizePicker
              initial={textSize}
              labels={{ smaller: t("textSmaller"), larger: t("textLarger"), level: t("textSize"), sample: t("textSample"), reset: t("textReset"), done: t("textDone") }}
            />
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

        <Card>
          <CardHeader title={t("twoFactor.title")} description={t("twoFactor.description")} />
          <CardBody>
            <TwoFactorSettings enabled={twoFactorOn} />
          </CardBody>
        </Card>

        <SignOutButton label={tnav("signOut")} />
      </div>
    </>
  );
}
