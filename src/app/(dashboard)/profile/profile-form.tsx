"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { updateProfile } from "./actions";
import type { FullProfile } from "./actions";

interface ProfileFormProps {
  profile: FullProfile;
}

export function ProfileForm({ profile }: ProfileFormProps) {
  const t = useTranslations("profile");
  const [state, formAction, isPending] = useActionState(updateProfile, null);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("personalInfo")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar
              src={profile.avatarUrl}
              fallback={`${profile.firstName[0]}${profile.lastName[0]}`}
              size="xl"
            />
            <div>
              <p className="text-lg font-semibold text-neutral-900">
                {profile.firstName} {profile.lastName}
              </p>
              <p className="text-sm text-neutral-500">{profile.email}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {profile.roles.map((role) => (
                  <Badge key={role.nameTg} variant="secondary">
                    {role.nameTg}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <ReadOnlyField label={t("firstName")} value={profile.firstName} />
            <ReadOnlyField label={t("lastName")} value={profile.lastName} />
            <ReadOnlyField label={t("email")} value={profile.email} />
            <ReadOnlyField label={t("publicId")} value={profile.publicId} />
            <ReadOnlyField label={t("school")} value={profile.schoolName} />
            {profile.dateOfBirth && (
              <ReadOnlyField
                label={t("dateOfBirth")}
                value={new Date(profile.dateOfBirth).toLocaleDateString()}
              />
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

      <Card>
        <CardHeader>
          <CardTitle>{t("contactInfo")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  {t("phone")}
                </label>
                <input
                  name="phone"
                  defaultValue={profile.phone ?? ""}
                  placeholder="+992 ..."
                  className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none transition-colors duration-[var(--duration-fast)] focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  {t("middleName")}
                </label>
                <input
                  name="middle_name"
                  defaultValue={profile.middleName ?? ""}
                  className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none transition-colors duration-[var(--duration-fast)] focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
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

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-neutral-400">{label}</p>
      <p className="mt-0.5 text-sm text-neutral-800">{value}</p>
    </div>
  );
}
