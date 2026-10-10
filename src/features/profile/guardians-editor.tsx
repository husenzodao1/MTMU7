"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select } from "@/components/ui/form-controls";
import * as Overlay from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { removeMyGuardianAction, saveMyGuardianAction, type GuardianInput } from "@/features/profile/guardian-actions";

export interface MyGuardian {
  id: string;
  relationship: "father" | "mother" | "guardian";
  lastName: string;
  firstName: string;
  middleName: string | null;
  birthYear: number | null;
  phone: string | null;
  workplace: string | null;
  sharedWith: number;
}

type Draft = Omit<GuardianInput, "birthYear"> & { birthYear: string };

const EMPTY: Draft = { relationship: "father", lastName: "", firstName: "", middleName: "", birthYear: "", phone: "", workplace: "" };

/**
 * A pupil's own parents, in their profile: each with the year of birth, the
 * telephone and the workplace, and a form to add or change one. When the
 * number given is already the parent of another pupil, the pupil is shown who
 * that is and asked whether it is their brother or sister; only a yes ties
 * them to the same parent.
 */
export function GuardiansEditor({ guardians }: { guardians: MyGuardian[] }) {
  const t = useTranslations("portal.guardians");
  const tAll = useTranslations();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<{ guardianId: string; children: Array<{ name: string; className: string | null }> } | null>(null);
  const [pending, start] = useTransition();

  const begin = (guardian?: MyGuardian) => {
    setEditing(guardian?.id ?? null);
    setDraft(
      guardian
        ? {
            relationship: guardian.relationship,
            lastName: guardian.lastName,
            firstName: guardian.firstName,
            middleName: guardian.middleName ?? "",
            birthYear: guardian.birthYear ? String(guardian.birthYear) : "",
            phone: guardian.phone ?? "",
            workplace: guardian.workplace ?? "",
          }
        : EMPTY
    );
    setError(null);
    setMatch(null);
    setOpen(true);
  };

  const submit = (siblingOf?: string) => {
    setError(null);
    start(async () => {
      const result = await saveMyGuardianAction({ ...draft, guardianId: editing, siblingOf: siblingOf ?? null });
      if (!result.ok) {
        setError(tAll(result.message));
        return;
      }
      if (result.data?.kind === "match") {
        setMatch({ guardianId: result.data.guardianId, children: result.data.children });
        return;
      }
      setMatch(null);
      setOpen(false);
      toast("success", t("saved"));
    });
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  const field = (key: keyof Draft) => ({
    id: `guardian-${key}`,
    value: draft[key] ?? "",
    onChange: (event: { target: { value: string } }) => setDraft((current) => ({ ...current, [key]: event.target.value })),
  });

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-muted">{t("hint")}</p>
      {guardians.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-warning-600/40 bg-warning-50 px-3 py-2 text-xs text-warning-700">
          <UsersRound className="size-4 shrink-0" aria-hidden />
          {t("missing")}
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {guardians.map((guardian) => (
            <li key={guardian.id} className="flex items-start gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1 text-xs">
                <p className="font-semibold text-ink">
                  <span className="me-1.5 text-[0.625rem] font-bold uppercase tracking-wider text-brand-text">{t(`rel.${guardian.relationship}`)}</span>
                  {[guardian.lastName, guardian.firstName, guardian.middleName].filter(Boolean).join(" ")}
                </p>
                <p className="mt-0.5 text-ink-muted">
                  {[guardian.birthYear, guardian.phone, guardian.workplace].filter(Boolean).join(" · ")}
                </p>
                {guardian.sharedWith > 0 ? <p className="mt-0.5 text-[0.6875rem] text-ink-muted">{t("shared", { count: guardian.sharedWith })}</p> : null}
              </div>
              <button type="button" className="shell-icon size-8" onClick={() => begin(guardian)} aria-label={t("edit")}>
                <Pencil className="size-3.5" aria-hidden />
              </button>
              <button
                type="button"
                className="shell-icon size-8 text-danger-700"
                aria-label={t("remove")}
                onClick={() => {
                  if (!window.confirm(t("removeConfirm"))) return;
                  start(async () => {
                    const result = await removeMyGuardianAction(guardian.id);
                    toast(result.ok ? "success" : "danger", result.ok ? t("removed") : tAll(result.message));
                  });
                }}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button type="button" variant="secondary" size="sm" onClick={() => begin()}>
        <Plus aria-hidden />
        {t("add")}
      </Button>

      <Overlay.Dialog open={open} onOpenChange={setOpen}>
        <Overlay.DialogContent title={match ? t("siblingTitle") : t("title")} closeLabel={t("cancel")} size="sm">
          {match ? (
            <div className="space-y-3">
              <p className="text-sm text-ink-secondary">{t("siblingBody")}</p>
              <ul className="rounded-lg border border-line px-3 py-2 text-sm">
                {match.children.map((child, index) => (
                  <li key={`${child.name}-${index}`} className="font-medium text-ink">
                    {child.name}
                    {child.className ? <span className="text-ink-muted"> · {child.className}</span> : null}
                  </li>
                ))}
              </ul>
              {error ? <p className="text-xs font-medium text-danger-700" role="alert">{error}</p> : null}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setMatch(null);
                    setError(t("siblingNoHint"));
                  }}
                >
                  {t("siblingNo")}
                </Button>
                <Button type="button" disabled={pending} onClick={() => submit(match.guardianId)}>
                  {t("siblingYes")}
                </Button>
              </div>
            </div>
          ) : (
            <form className="space-y-3" onSubmit={onSubmit} noValidate>
              <FormField label={t("relationship")} htmlFor="guardian-relationship" required>
                <Select {...field("relationship")}>
                  {(["father", "mother", "guardian"] as const).map((value) => (
                    <option key={value} value={value}>
                      {t(`rel.${value}`)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label={t("lastName")} htmlFor="guardian-lastName" required>
                  <Input {...field("lastName")} required maxLength={100} autoComplete="off" />
                </FormField>
                <FormField label={t("firstName")} htmlFor="guardian-firstName" required>
                  <Input {...field("firstName")} required maxLength={100} autoComplete="off" />
                </FormField>
              </div>
              <FormField label={t("middleName")} htmlFor="guardian-middleName">
                <Input {...field("middleName")} maxLength={100} autoComplete="off" />
              </FormField>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label={t("birthYear")} htmlFor="guardian-birthYear">
                  <Input {...field("birthYear")} inputMode="numeric" maxLength={4} placeholder="1980" />
                </FormField>
                <FormField label={t("phone")} htmlFor="guardian-phone" required>
                  <Input {...field("phone")} type="tel" required maxLength={30} placeholder="+992" />
                </FormField>
              </div>
              <FormField label={t("workplace")} htmlFor="guardian-workplace">
                <Input {...field("workplace")} maxLength={200} />
              </FormField>
              {error ? <p className="text-xs font-medium text-danger-700" role="alert">{error}</p> : null}
              <div className="flex flex-wrap justify-end gap-2">
                <Overlay.DialogClose asChild>
                  <Button type="button" variant="secondary">
                    {t("cancel")}
                  </Button>
                </Overlay.DialogClose>
                <Button type="submit" disabled={pending}>
                  {t("save")}
                </Button>
              </div>
            </form>
          )}
        </Overlay.DialogContent>
      </Overlay.Dialog>
    </div>
  );
}
