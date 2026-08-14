"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateSchoolSettingsAction } from "./actions";

interface SchoolData {
  shortName: string;
  fullName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  idPrefix: string;
}

export function SchoolSettingsForm({ school }: { school: SchoolData }) {
  const t = useTranslations("admin");
  const [state, formAction, isPending] = useActionState(
    updateSchoolSettingsAction,
    { error: null, success: false }
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("schoolSettings")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="max-w-xl space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="shortName"
              className="text-sm font-medium text-neutral-700"
            >
              {t("schoolName")}
            </label>
            <Input
              id="shortName"
              name="shortName"
              defaultValue={school.shortName}
              required
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="fullName"
              className="text-sm font-medium text-neutral-700"
            >
              {t("schoolFullName")}
            </label>
            <Input
              id="fullName"
              name="fullName"
              defaultValue={school.fullName}
              required
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="address"
              className="text-sm font-medium text-neutral-700"
            >
              {t("schoolAddress")}
            </label>
            <Input
              id="address"
              name="address"
              defaultValue={school.address ?? ""}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label
                htmlFor="phone"
                className="text-sm font-medium text-neutral-700"
              >
                {t("schoolPhone")}
              </label>
              <Input
                id="phone"
                name="phone"
                defaultValue={school.phone ?? ""}
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="text-sm font-medium text-neutral-700"
              >
                {t("schoolEmail")}
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={school.email ?? ""}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label
                htmlFor="website"
                className="text-sm font-medium text-neutral-700"
              >
                {t("schoolWebsite")}
              </label>
              <Input
                id="website"
                name="website"
                defaultValue={school.website ?? ""}
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="idPrefix"
                className="text-sm font-medium text-neutral-700"
              >
                {t("idPrefix")}
              </label>
              <Input
                id="idPrefix"
                name="idPrefix"
                defaultValue={school.idPrefix}
                required
                maxLength={5}
              />
            </div>
          </div>

          {state.error && (
            <div className="animate-in rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {state.error}
            </div>
          )}
          {state.success && (
            <div className="animate-in rounded-lg bg-green-50 p-3 text-sm text-green-600">
              {t("saved")}
            </div>
          )}

          <Button type="submit" loading={isPending}>
            {t("saveChanges")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
