import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { changePasswordAction, updateContactAction } from "@/features/profile/actions";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { DirectUpload } from "@/components/ui/direct-upload";
import { TextField } from "@/components/ui/fields";
import { Checkbox } from "@/components/ui/form-controls";
import { Avatar } from "@/components/ui/misc";
import { Card, CardBody, CardHeader, DescriptionList, PageHeader } from "@/components/ui/surface";
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

export default async function ProfilePage() {
  const access = await requireAccess();
  const t = await getTranslations("portal.profile");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_my_profile");
  const profile = profileSchema.parse(data);
  const fullName = [profile.last_name, profile.first_name, profile.middle_name].filter(Boolean).join(" ");

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <Card>
          <CardBody className="flex flex-col items-center text-center">
            <Avatar name={`${profile.first_name} ${profile.last_name}`} src={profile.avatar_url} size="lg" className="size-24 text-2xl" />
            <p className="mt-3 text-lg font-semibold text-ink">{fullName}</p>
            <p className="text-sm text-ink-muted">{profile.school_name}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              {profile.roles.map((role) => (
                <Badge key={role.slug} tone="brand">{pickName(role, locale)}</Badge>
              ))}
            </div>
          </CardBody>
          <CardBody className="border-t border-line">
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
                <DirectUpload kind="avatar" folder={`${access.school?.id}/${access.userId}`} name="avatar" label={t("photo")} hint={t("photoHint")} />
                {profile.avatar_url ? <Checkbox name="removeAvatar" label={t("removePhoto")} /> : null}
                <SubmitButton>{t("saveContact")}</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>

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
    </>
  );
}
