"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Camera, X } from "lucide-react";

interface FileUploadProps {
  name: string;
  currentUrl?: string | null;
  onUploaded?: (url: string) => void;
  className?: string;
}

export function FileUpload({ name, currentUrl, className }: FileUploadProps) {
  const t = useTranslations("auth");
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setError(null);
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError(t("photoHint"));
      return;
    }

    const url = URL.createObjectURL(file);
    setPreview(url);
  };

  const handleClear = () => {
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className={cn("space-y-2", className)}>
      <label className="text-sm font-medium text-neutral-700">
        {t("profilePhoto")}
      </label>
      <div className="flex items-center gap-4">
        <div
          className="relative flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-neutral-300 bg-neutral-50 transition-colors hover:border-primary-400"
          onClick={() => inputRef.current?.click()}
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
            onClick={() => inputRef.current?.click()}
          >
            {preview ? t("changePhoto") : t("uploadPhoto")}
          </button>
          {preview && (
            <button
              type="button"
              className="block text-xs text-neutral-500 hover:text-error-600"
              onClick={handleClear}
            >
              <X className="mr-0.5 inline h-3 w-3" />
              {t("delete" as never) ?? "Remove"}
            </button>
          )}
          <p className="text-xs text-neutral-400">{t("photoHint")}</p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleChange}
      />
      {error && <p className="text-xs text-error-600">{error}</p>}
    </div>
  );
}
