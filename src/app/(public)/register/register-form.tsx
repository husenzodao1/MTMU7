"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import {
  registerAction,
  type RegistrationState,
} from "./actions";
import { UserPlus, GraduationCap, BookOpen, School } from "lucide-react";
import Link from "next/link";

interface Role {
  id: string;
  slug: string;
  nameTg: string;
  nameRu: string | null;
  level: number;
}

interface ClassOption {
  id: string;
  name: string;
  gradeLevel: number;
}

interface Subject {
  id: string;
  nameTg: string;
  nameRu: string | null;
}

const ROLE_ICONS: Record<string, typeof GraduationCap> = {
  student: GraduationCap,
  teacher: BookOpen,
  director: School,
  vice_principal: School,
};

const initialState: RegistrationState = {
  mode: "open",
  error: null,
};

export function RegisterForm({
  roles,
  classes,
  subjects,
}: {
  roles: Role[];
  classes: ClassOption[];
  subjects: Subject[];
}) {
  const t = useTranslations("auth");
  const [hasInvitation, setHasInvitation] = useState(false);
  const [selectedRoleSlug, setSelectedRoleSlug] = useState<string | null>(null);

  const [state, formAction, isPending] = useActionState(registerAction, initialState);

  const isStudentSelected = selectedRoleSlug === "student";
  const isTeacherSelected = selectedRoleSlug === "teacher";

  void subjects;
  void isTeacherSelected;

  return (
    <div className="w-full max-w-md space-y-6 animate-in">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50">
          <UserPlus className="h-6 w-6 text-primary-600" />
        </div>
        <h1 className="text-2xl font-bold text-neutral-900">{t("registerTitle")}</h1>
        <p className="mt-1 text-sm text-neutral-500">{t("registerProfileStep")}</p>
      </div>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="registrationMode" value={hasInvitation ? "invitation" : "open"} />

        {/* Registration mode toggle */}
        <div className="flex gap-2 rounded-lg border border-neutral-200 p-1">
          <button
            type="button"
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              !hasInvitation ? "bg-primary-50 text-primary-700" : "text-neutral-500 hover:text-neutral-700"
            }`}
            onClick={() => setHasInvitation(false)}
          >
            {t("registerButton")}
          </button>
          <button
            type="button"
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              hasInvitation ? "bg-primary-50 text-primary-700" : "text-neutral-500 hover:text-neutral-700"
            }`}
            onClick={() => setHasInvitation(true)}
          >
            {t("invitationCode")}
          </button>
        </div>

        {/* Name fields */}
        <div className="space-y-2">
          <label htmlFor="lastName" className="text-sm font-medium text-neutral-700">
            {t("lastName")}
          </label>
          <Input id="lastName" name="lastName" required error={!!state.error} />
        </div>
        <div className="space-y-2">
          <label htmlFor="firstName" className="text-sm font-medium text-neutral-700">
            {t("firstName")}
          </label>
          <Input id="firstName" name="firstName" required error={!!state.error} />
        </div>
        <div className="space-y-2">
          <label htmlFor="middleName" className="text-sm font-medium text-neutral-700">
            {t("middleName")}
          </label>
          <Input id="middleName" name="middleName" error={!!state.error} />
        </div>

        {/* Email */}
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-neutral-700">
            {t("email")}
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="email@example.com"
            required
            autoComplete="email"
            error={!!state.error}
          />
        </div>

        {/* Password */}
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-neutral-700">
            {t("password")}
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            error={!!state.error}
          />
          <p className="text-xs text-neutral-500">{t("passwordHint")}</p>
        </div>

        {/* Confirm password (open mode only) */}
        {!hasInvitation && (
          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium text-neutral-700">
              {t("confirmPassword")}
            </label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              error={!!state.error}
            />
          </div>
        )}

        {/* Invitation code */}
        {hasInvitation && (
          <div className="space-y-2">
            <label htmlFor="invitationCode" className="text-sm font-medium text-neutral-700">
              {t("invitationCode")}
            </label>
            <Input
              id="invitationCode"
              name="invitationCode"
              type="text"
              placeholder="ABCD1234"
              required
              maxLength={10}
              className="text-center font-mono uppercase tracking-wider"
              error={!!state.error}
            />
          </div>
        )}

        {/* Role selection (only for open registration) */}
        {!hasInvitation && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-700">
              {t("selectRole")}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {roles.map((role) => {
                const Icon = ROLE_ICONS[role.slug] ?? UserPlus;
                return (
                  <label
                    key={role.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border-2 p-3 transition-colors ${
                      selectedRoleSlug === role.slug
                        ? "border-primary-500 bg-primary-50"
                        : "border-neutral-200 hover:border-neutral-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="roleId"
                      value={role.id}
                      required
                      className="hidden"
                      onChange={() => setSelectedRoleSlug(role.slug)}
                    />
                    <Icon className="h-4 w-4 shrink-0 text-neutral-600" />
                    <span className="text-sm font-medium">{role.nameTg}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Class selection for students */}
        {!hasInvitation && isStudentSelected && classes.length > 0 && (
          <div className="space-y-2">
            <label htmlFor="classId" className="text-sm font-medium text-neutral-700">
              {t("selectClass")}
            </label>
            <select
              id="classId"
              name="classId"
              required
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="">{t("selectClass")}</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Enrollment year (students in open mode) */}
        {!hasInvitation && isStudentSelected && (
          <div className="space-y-2">
            <label htmlFor="enrollmentYear" className="text-sm font-medium text-neutral-700">
              {t("enrollmentYear")}
            </label>
            <Input
              id="enrollmentYear"
              name="enrollmentYear"
              type="number"
              min={2000}
              max={2100}
              defaultValue={new Date().getFullYear()}
              error={!!state.error}
            />
          </div>
        )}

        {/* Avatar upload (open registration only) */}
        {!hasInvitation && (
          <FileUpload name="avatar" />
        )}

        {state.error && (
          <div className="animate-in rounded-lg bg-red-50 p-3 text-sm text-error-600">
            {t(state.error)}
          </div>
        )}

        <Button type="submit" className="w-full press-scale" loading={isPending}>
          {hasInvitation ? t("registerButton") : t("registerSubmit")}
        </Button>
      </form>

      <p className="text-center text-sm text-neutral-500">
        {t("hasAccount")}{" "}
        <Link href="/login" className="font-medium text-primary-600 hover:text-primary-700">
          {t("loginButton")}
        </Link>
      </p>
    </div>
  );
}
