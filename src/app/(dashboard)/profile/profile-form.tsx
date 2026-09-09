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
import { GraduationCap, BookOpen, Mail, Phone, School, Hash, Check } from "lucide-react";

interface ProfileFormProps {
  profile: FullProfile;
}

export function ProfileForm({ profile }: ProfileFormProps) {
  const t = useTranslations("profile");
  const locale = useLocale();
  const [state, formAction, isPending] = useActionState(updateProfile, null);

  const isTeacher = profile.roles.some((r) => r.slug === "teacher");

  const getRoleName = (role: { slug: string; nameTg: string; nameRu: string | null }) => {
    if (locale === "ru" && role.nameRu) return role.nameRu;
    return role.nameTg;
  };

  return (
    <div className="space-y-6">
      {/* Profile Header Capsule */}
      <div className="relative overflow-hidden rounded-[28px] border border-neutral-200/70 bg-gradient-to-br from-[#E8EEFB] via-[#EEF2FC] to-[#DBE7FC] p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
          <Avatar
            src={profile.avatarUrl}
            fallback={`${profile.firstName[0]}${profile.lastName[0]}`}
            size="2xl"
            className="h-24 w-24 ring-4 ring-white/90 shadow-md"
          />
          <div className="text-center sm:text-left min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h2 className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight">
                {profile.lastName} {profile.firstName}
                {profile.middleName ? ` ${profile.middleName}` : ""}
              </h2>
            </div>

            <div className="mt-2 flex flex-wrap justify-center gap-1.5 sm:justify-start">
              {profile.roles.map((role) => (
                <Badge key={role.slug} variant="default" className="text-xs font-bold py-1">
                  {role.slug === "student" && <GraduationCap className="mr-1 h-3.5 w-3.5" />}
                  {role.slug === "teacher" && <BookOpen className="mr-1 h-3.5 w-3.5" />}
                  {getRoleName(role)}
                </Badge>
              ))}
              {profile.className && (
                <Badge variant="pill" className="text-xs font-bold py-1">
                  {profile.className}
                </Badge>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-3.5 text-xs font-medium text-neutral-600 sm:justify-start">
              <span className="flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 shadow-2xs">
                <Mail className="h-3.5 w-3.5 text-neutral-500" /> {profile.email}
              </span>
              {profile.phone && (
                <span className="flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 shadow-2xs">
                  <Phone className="h-3.5 w-3.5 text-neutral-500" /> {profile.phone}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Personal Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("personalInfo")}</CardTitle>
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

      {/* Teacher subjects */}
      {isTeacher && profile.subjects.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4.5 w-4.5 text-primary-600" /> {t("subjects")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {profile.subjects.map((s) => (
                <Badge key={s.nameTg} variant="secondary" className="px-3 py-1">
                  {locale === "ru" && s.nameRu ? s.nameRu : s.nameTg}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Editable Contact Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("contactInfo")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-5">
            <FileUpload name="avatar" currentUrl={profile.avatarUrl} />

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                  {t("phone")}
                </label>
                <input
                  name="phone"
                  defaultValue={profile.phone ?? ""}
                  placeholder="+992 ..."
                  className="h-11 w-full rounded-xl border border-neutral-200/80 bg-white px-4 text-sm outline-none transition-all focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 placeholder:text-neutral-400"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                  {t("middleName")}
                </label>
                <input
                  name="middle_name"
                  defaultValue={profile.middleName ?? ""}
                  className="h-11 w-full rounded-xl border border-neutral-200/80 bg-white px-4 text-sm outline-none transition-all focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 placeholder:text-neutral-400"
                />
              </div>
            </div>

            {(state as { error?: string } | null)?.error && (
              <p className="text-xs font-semibold text-error-600">
                {String((state as { error?: string }).error)}
              </p>
            )}

            {(state as { success?: boolean } | null)?.success && (
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 animate-fade-in">
                <Check className="h-4 w-4" />
                <span>{t("profileUpdated")}</span>
              </div>
            )}

            <Button type="submit" loading={isPending} variant="default" size="default">
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
    <div className="rounded-xl border border-neutral-100 bg-[#F8FAFD]/70 p-3">
      <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
        {icon}
        {value}
      </p>
    </div>
  );
}
