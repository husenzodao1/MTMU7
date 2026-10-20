import type { Metadata } from "next";
import { StudentStatistics, type StatsPeriod } from "@/features/profile/statistics";
import { firstValue, type SearchParams } from "@/lib/list-params";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { changePasswordAction, updateContactAction } from "@/features/profile/actions";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { TextField } from "@/components/ui/fields";
import { Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/surface";
import { MeHeader } from "@/features/profile/me-header";
import { photoLabels } from "@/features/profile/photo-labels";
import { SocialAccountsEditor } from "@/features/profile/social-accounts-editor";
import { isSocialPlatform } from "@/lib/social/accounts";
import { requireAccess } from "@/lib/auth/guards";
import { formatDate } from "@/lib/i18n/format";
import { pickName, type Locale } from "@/lib/i18n/text";
import { createClient } from "@/lib/supabase/server";

const profileSchema = z.object({
  public_id: z.string(),
  email: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  middle_name: z.string().nullable(),
  nickname: z.string().nullable(),
  phone: z.string().nullable(),
  date_of_birth: z.string().nullable(),
  avatar_url: z.string().nullable(),
  created_at: z.string(),
  school_name: z.string(),
  roles: z.array(z.object({ slug: z.string(), name_tg: z.string(), name_ru: z.string().nullable(), name_en: z.string().nullable() })),
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("profile") };
}

export default async function ProfilePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requireAccess();
  const statsRaw = firstValue((await searchParams).stats);
  const period: StatsPeriod = statsRaw === "week" || statsRaw === "month" ? statsRaw : "term";
  const t = await getTranslations("portal.profile");
  const tnav = await getTranslations("nav");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  const [{ data }, { data: accountRows, error: accountsMissing }] = await Promise.all([
    supabase.rpc("get_my_profile"),
    // One's own accounts elsewhere (00101); none where the table is not there yet.
    supabase.from("user_social_accounts").select("platform, handle").eq("user_id", access.userId).order("platform"),
  ]);
  const profile = profileSchema.parse(data);
  const accounts = (accountRows ?? []).flatMap((row) => (isSocialPlatform(row.platform) ? [{ platform: row.platform, handle: row.handle }] : []));
  const fullName = [profile.last_name, profile.first_name, profile.middle_name].filter(Boolean).join(" ");

  return (
    <>
      <MeHeader
        name={fullName}
        avatarUrl={profile.avatar_url}
        detail={profile.school_name}
        active="profile"
        labels={{ profile: tnav("profile"), settings: tnav("settings") }}
        photo={{ folder: `${access.school?.id}/${access.userId}`, labels: await photoLabels() }}
      >
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {profile.roles.map((role) => (
            <Badge key={role.slug} tone="brand">{pickName(role, locale)}</Badge>
          ))}
        </div>
      </MeHeader>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <Card>
          <CardBody>
            <DescriptionList
              items={[
                { term: t("publicId"), description: <span className="font-mono tabular">{profile.public_id}</span> },
                { term: t("email"), description: profile.email },
                { term: t("dateOfBirth"), description: profile.date_of_birth ? formatDate(profile.date_of_birth, locale) : "—" },
                { term: t("memberSince"), description: formatDate(profile.created_at, locale) },
              ]}
            />
            <p className="mt-4 text-xs text-ink-muted">{t("officialFieldsHint")}</p>
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title={t("contact")} description={t("contactHint")} />
            <CardBody>
              <ActionForm action={updateContactAction} className="space-y-4">
                <TextField name="phone" type="tel" autoComplete="tel" label={t("phone")} defaultValue={profile.phone ?? ""} maxLength={30} />
                <TextField
                  name="nickname"
                  label={t("nickname")}
                  hint={t("nicknameHint")}
                  defaultValue={profile.nickname ?? ""}
                  maxLength={31}
                  autoComplete="off"
                  placeholder="@nickname"
                />
                <SubmitButton>{t("saveContact")}</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>

          {accountsMissing ? null : (
            <Card>
              <CardHeader title={t("accounts.title")} description={t("accounts.hint")} />
              <CardBody>
                <SocialAccountsEditor accounts={accounts} />
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title={t("password")} description={t("passwordHint")} />
            <CardBody>
              <ActionForm action={changePasswordAction} className="space-y-4" resetOnSuccess>
                <input type="text" name="username" autoComplete="username" defaultValue={profile.email} hidden readOnly />
                <TextField name="currentPassword" type="password" autoComplete="current-password" label={t("currentPassword")} required />
                <TextField name="password" type="password" autoComplete="new-password" label={t("newPassword")} hint={t("passwordRules")} required />
                <TextField name="confirmPassword" type="password" autoComplete="new-password" label={t("confirmPassword")} required />
                <SubmitButton>{t("changePassword")}</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
        </div>
      </div>
      <StudentStatistics userId={access.userId} period={period} />
    </>
  );
}
