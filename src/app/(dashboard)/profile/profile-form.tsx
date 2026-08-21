"use client";

import { useActionState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { FileUpload } from "@/components/ui/file-upload";
import { updateProfile } from "./actions";
import type { FullProfile } from "./actions";
import { GraduationCap, BookOpen, Mail, Phone, School, Hash } from "lucide-react";

interface ProfileFormProps {
  profile: FullProfile;
}

export function ProfileForm({ profile }: ProfileFormProps) {
  const t = useTranslations("profile");
  const locale = useLocale();
  const [state, formAction, isPending] = useActionState(updateProfile, null);

  const isTeacher = profile.roles.some((r) => r.slug === "teacher");
  const isStudent = profile.roles.some((r) => r.slug === "student");

  const getRoleName = (role: { slug: string; nameTg: string; nameRu: string | null }) => {
    if (locale === "ru" && role.nameRu) return role.nameRu;
    return role.nameTg;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <Avatar
              src={profile.avatarUrl}
              fallback={`${profile.firstName[0]}${profile.lastName[0]}`}
              size="xl"
              className="h-24 w-24 text-2xl"
            />
            <div className="text-center sm:text-left">
              <h2 className="text-xl font-bold text-neutral-900">
                {profile.lastName} {profile.firstName}
                {profile.middleName ? ` ${profile.middleName}` : ""}
              </h2>
              <div className="mt-1 flex flex-wrap justify-center gap-1.5 sm:justify-start">
                {profile.roles.map((role) => (
                  <Badge key={role.slug} variant="secondary">
                    {role.slug === "student" && <GraduationCap className="mr-1 h-3 w-3" />}
                    {role.slug === "teacher" && <BookOpen className="mr-1 h-3 w-3" />}
                    {getRoleName(role)}
                  </Badge>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-sm text-neutral-500 sm:justify-start">
                <span className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" /> {profile.email}
                </span>
                {profile.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" /> {profile.phone}
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("personalInfo")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <ReadOnlyField label={t("firstName")} value={profile.firstName} />
            <ReadOnlyField label={t("lastName")} value={profile.lastName} />
            <ReadOnlyField label={t("email")} value={profile.email} />
            <ReadOnlyField
              label={t("publicId")}
              value={profile.publicId}
              icon={<Hash className="h-3.5 w-3.5 text-neutral-400" />}
            />
            <ReadOnlyField
              label={t("school")}
              value={profile.schoolName}
              icon={<School className="h-3.5 w-3.5 text-neutral-400" />}
            />
            {profile.dateOfBirth && (
              <ReadOnlyField label={t("dateOfBirth")} value={profile.dateOfBirth} />
            )}
            {profile.gender && (
              <ReadOnlyField
                label={t("gender")}
                value={profile.gender === "male" ? t("male") : t("female")}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {isStudent && profile.className && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" /> {t("class")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="default" className="text-sm">{profile.className}</Badge>
          </CardContent>
        </Card>
      )}

      {isTeacher && profile.subjects.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" /> {t("subjects")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {profile.subjects.map((s) => (
                <Badge key={s.nameTg} variant="secondary">
                  {locale === "ru" && s.nameRu ? s.nameRu : s.nameTg}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("contactInfo")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <FileUpload name="avatar" currentUrl={profile.avatarUrl} />

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  {t("phone")}
                </label>
                <input
                  name="phone"
                  defaultValue={profile.phone ?? ""}
                  placeholder="+992 ..."
                  className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  {t("middleName")}
                </label>
                <input
                  name="middle_name"
                  defaultValue={profile.middleName ?? ""}
                  className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                />
              </div>
            </div>

            {(state as { error?: string } | null)?.error && (
              <p className="text-sm text-error-600">
                {String((state as { error?: string }).error)}
              </p>
            )}

            {(state as { success?: boolean } | null)?.success && (
              <p className="text-sm text-success-600 animate-fade-in">
                {t("profileUpdated")}
              </p>
            )}

            <Button type="submit" loading={isPending}>
              {t("saveChanges")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function ReadOnlyField({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-neutral-400">{label}</p>
      <p className="mt-0.5 flex items-center gap-1 text-sm text-neutral-800">
        {icon}
        {value}
      </p>
    </div>
  );
}
