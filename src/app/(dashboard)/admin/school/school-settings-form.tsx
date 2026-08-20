"use client";

import { useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, X } from "lucide-react";
import { updateSchoolSettingsAction } from "./actions";

interface SchoolData {
  shortName: string;
  fullName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  idPrefix: string;
  logoUrl: string | null;
}

export function SchoolSettingsForm({ school }: { school: SchoolData }) {
  const t = useTranslations("admin");
  const tb = useTranslations("branding");
  const [state, formAction, isPending] = useActionState(
    updateSchoolSettingsAction,
    { error: null, success: false }
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(school.logoUrl);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
  };

  const handleClearLogo = () => {
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("schoolSettings")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="max-w-xl space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-700">
              {t("schoolLogo")}
            </label>
            <div className="flex items-center gap-4">
              <div
                className="relative flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-50 transition-colors hover:border-primary-400"
                onClick={() => fileInputRef.current?.click()}
              >
                {preview ? (
                  <img src={preview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Camera className="h-6 w-6 text-neutral-400" />
                )}
              </div>
              <div className="space-y-1">
                <button
                  type="button"
                  className="text-sm font-medium text-primary-600 hover:text-primary-700"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {preview ? tb("changePhoto") : tb("uploadPhoto")}
                </button>
                {preview && (
                  <button
                    type="button"
                    className="block text-xs text-neutral-500 hover:text-error-600"
                    onClick={handleClearLogo}
                  >
                    <X className="mr-0.5 inline h-3 w-3" />
                    {tb("removePhoto")}
                  </button>
                )}
                <p className="text-xs text-neutral-400">JPG, PNG, WebP — max 5MB</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                name="logoFile"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
              <input type="hidden" name="existingLogoUrl" value={school.logoUrl ?? ""} />
            </div>
          </div>
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
