"use client";

import { FileUp, Paperclip, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { useFieldError } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { checkFile, formatBytes, UPLOAD_RULES, type UploadKind } from "@/lib/storage/files";
import { getBrowserClient } from "@/lib/supabase/browser";

/**
 * Uploads a file straight to Supabase Storage under the user's session (the
 * bucket policy authorizes the folder), then exposes the resulting storage
 * path to the surrounding form through hidden inputs. The server re-validates
 * the path before registering it in the database.
 */
export function DirectUpload({
  kind,
  folder,
  name,
  label,
  hint,
  accept,
  initialName,
}: {
  kind: UploadKind;
  /** e.g. `${schoolId}/${userId}` for homework or `${schoolId}/books` */
  folder: string;
  /** Prefix for hidden inputs: <name>Path, <name>Name, <name>Size, <name>Type */
  name: string;
  label: string;
  hint?: string;
  accept?: string;
  initialName?: string | null;
}) {
  const t = useTranslations();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ status: "idle" | "uploading" | "done" | "error"; error?: string; path?: string; file?: { name: string; size: number; type: string } }>(
    { status: "idle" }
  );
  const fieldError = useFieldError(`${name}Path`);
  const rule = UPLOAD_RULES[kind];
  const acceptValue = accept ?? Object.keys(rule.types).join(",");

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const check = checkFile(kind, file);
    if (!check.ok) {
      setState({ status: "error", error: t(`errors.${check.error}`) });
      return;
    }
    setState({ status: "uploading", file: { name: file.name, size: file.size, type: file.type } });
    const path = `${folder}/${crypto.randomUUID()}.${check.extension}`;
    const { error } = await getBrowserClient().storage.from(rule.bucket).upload(path, file, { contentType: file.type, upsert: false });
    if (error) {
      setState({ status: "error", error: t("errors.upload_failed") });
      return;
    }
    setState({ status: "done", path, file: { name: file.name, size: file.size, type: file.type } });
  }

  function clear() {
    setState({ status: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  }

  const error = state.error ?? fieldError;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-line-strong bg-surface-muted/40 px-3 py-3">
        <input ref={inputRef} id={id} type="file" accept={acceptValue} onChange={onChange} className="sr-only" aria-describedby={`${id}-hint`} />
        <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()} loading={state.status === "uploading"}>
          <FileUp aria-hidden />
          {state.status === "done" || initialName ? t("common.upload") : t("common.upload")}
        </Button>
        <div className="min-w-0 flex-1 text-sm" aria-live="polite">
          {state.file ? (
            <span className="flex items-center gap-1.5 text-ink">
              <Paperclip className="size-4 shrink-0 text-ink-muted" aria-hidden />
              <span className="truncate">{state.file.name}</span>
              <span className="shrink-0 text-ink-muted">({formatBytes(state.file.size)})</span>
            </span>
          ) : initialName ? (
            <span className="flex items-center gap-1.5 text-ink-secondary">
              <Paperclip className="size-4 shrink-0 text-ink-muted" aria-hidden />
              <span className="truncate">{initialName}</span>
            </span>
          ) : (
            <span id={`${id}-hint`} className="text-ink-muted">
              {hint ?? t("portal.upload.limit", { size: formatBytes(rule.maxBytes) })}
            </span>
          )}
        </div>
        {state.status === "done" ? (
          <button type="button" onClick={clear} className="rounded p-1 text-ink-muted hover:text-ink" aria-label={t("common.remove")}>
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="text-sm font-medium text-danger-700" role="alert">
          {error}
        </p>
      ) : null}
      {state.status === "done" && state.path && state.file ? (
        <>
          <input type="hidden" name={`${name}Path`} value={state.path} />
          <input type="hidden" name={`${name}Name`} value={state.file.name} />
          <input type="hidden" name={`${name}Size`} value={state.file.size} />
          <input type="hidden" name={`${name}Type`} value={state.file.type} />
        </>
      ) : null}
    </div>
  );
}
