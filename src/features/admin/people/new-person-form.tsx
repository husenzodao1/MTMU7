"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Button, buttonClasses } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { Fieldset } from "@/components/ui/form-controls";
import { Alert } from "@/components/ui/surface";
import { addStaffAction, addStudentAction, type IssuedCredentials } from "@/features/admin/people/provision-actions";
import { STAFF_TYPES } from "@/features/admin/people/schemas";

export interface GrantableRole {
  id: string;
  name: string;
  /** The handful of things this post lets somebody do, already translated. */
  summary: string[];
}

type Kind = "students" | "staff";

/**
 * Adding one person, with the post they are to hold.
 *
 * The school issues logins, so this does for one person what the workbook does
 * for a whole class: the person record, the account, the role, and a login and
 * password to hand over. Those credentials appear once, on this screen, because
 * nothing stores them — which is why the panel says so rather than quietly
 * closing.
 */
export function NewPersonForm({
  kind,
  roles,
  classes,
}: {
  kind: Kind;
  roles: GrantableRole[];
  classes?: Array<{ value: string; label: string }>;
}) {
  const t = useTranslations("admin.people");
  const tc = useTranslations("common");
  const types = useTranslations("admin.staff.types");
  const [issued, setIssued] = useState<IssuedCredentials | null>(null);
  const [role, setRole] = useState("");

  const chosen = roles.find((r) => r.id === role);

  if (issued) {
    return (
      <div className="space-y-4">
        <Alert tone="success" title={t("accountIssuedTitle")}>
          <p>{issued.password ? t("accountIssuedBody") : t("accountAlreadyIssued")}</p>
          <dl className="mt-4 grid max-w-sm grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border border-line bg-surface p-4 text-sm">
            <dt className="text-ink-muted">{t("login")}</dt>
            <dd className="font-mono font-semibold tracking-wide text-ink">{issued.login}</dd>
            {issued.password ? (
              <>
                <dt className="text-ink-muted">{t("password")}</dt>
                <dd className="font-mono font-semibold tracking-wide text-ink">{issued.password}</dd>
              </>
            ) : null}
          </dl>
          {issued.password ? <p className="mt-3 font-medium">{t("accountIssuedWarning")}</p> : null}
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => { setIssued(null); setRole(""); }}>{t("addAnother")}</Button>
          {issued.personId ? (
            <Link
              href={kind === "staff" ? `/admin/staff/${issued.personId}` : `/admin/students/${issued.personId}`}
              className={buttonClasses("secondary")}
            >
              {t("openProfile")}
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <ActionForm
      action={kind === "staff" ? addStaffAction : addStudentAction}
      className="space-y-5"
      showSuccessToast={false}
      onSuccess={(result) => {
        if (result.ok && result.data) setIssued(result.data);
      }}
    >
      <Fieldset legend={t("identity")}>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField name="lastName" label={t("lastName")} required maxLength={100} autoComplete="off" />
          <TextField name="firstName" label={t("firstName")} required maxLength={100} autoComplete="off" />
          <TextField name="middleName" label={t("middleName")} maxLength={100} autoComplete="off" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            name="gender"
            label={t("gender")}
            placeholder={tc("notSet")}
            options={[
              { value: "male", label: tc("genders.male") },
              { value: "female", label: tc("genders.female") },
            ]}
          />
          <TextField name="dateOfBirth" type="date" label={t("dateOfBirth")} required={kind === "students"} />
          {kind === "students" ? (
            classes && classes.length > 0 ? (
              <SelectField name="className" label={t("class")} required options={classes.map((c) => ({ value: c.label, label: c.label }))} />
            ) : (
              <TextField name="className" label={t("class")} required maxLength={20} />
            )
          ) : (
            <TextField name="employeeNumber" label={t("employeeNumber")} hint={t("employeeNumberHint")} required maxLength={32} />
          )}
        </div>
      </Fieldset>

      {kind === "staff" ? (
        <Fieldset legend={t("employment")}>
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField name="staffType" label={t("staffType")} defaultValue="teacher" options={STAFF_TYPES.map((value) => ({ value, label: types(value) }))} />
            <TextField name="positionTitle" label={t("position")} maxLength={200} />
            <TextField name="hireDate" type="date" label={t("hireDate")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField name="maxWeeklyHours" inputMode="decimal" label={t("maxWeeklyHours")} />
          </div>
          <TextAreaField name="qualification" label={t("qualification")} rows={3} maxLength={2000} />
        </Fieldset>
      ) : null}

      <Fieldset legend={t("contact")}>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Required, unlike on the edit form: the six-digit code goes here, and
              an account whose address nobody can read cannot be opened. */}
          <TextField name="email" type="email" label={t("email")} hint={t("emailHint")} required maxLength={254} autoComplete="off" />
          <TextField name="phone" type="tel" label={t("phone")} maxLength={50} autoComplete="off" />
        </div>
      </Fieldset>

      {roles.length > 0 ? (
        <Fieldset legend={t("post")} description={t("postDescription")}>
          <SelectField
            name="roleId"
            label={t("role")}
            hint={t("roleHint")}
            value={role}
            onChange={(event) => setRole(event.target.value)}
            placeholder={t("roleFromPosition")}
            options={roles.map((r) => ({ value: r.id, label: r.name }))}
          />
          {/* What the post actually opens, named the way the menu names it. */}
          {chosen && chosen.summary.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {chosen.summary.map((item) => (
                <li key={item} className="rounded-md border border-brand-300 bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-text-strong">
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
        </Fieldset>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <SubmitButton>{t("addAndIssue")}</SubmitButton>
        <Link href={kind === "staff" ? "/admin/staff" : "/admin/students"} className={buttonClasses("secondary")}>
          {tc("cancel")}
        </Link>
      </div>
    </ActionForm>
  );
}
