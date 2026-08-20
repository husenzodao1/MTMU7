"use client";

import { useActionState, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import {
  sendOtpAction,
  verifyOtpAction,
  setPasswordAction,
  completeDetailsAction,
  type RegistrationState,
} from "./actions";
import { Mail, KeyRound, Lock, UserPlus, GraduationCap, BookOpen } from "lucide-react";
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

const STEP_ICONS = {
  info: Mail,
  otp: KeyRound,
  password: Lock,
  details: UserPlus,
};

const ROLE_ICONS: Record<string, typeof GraduationCap> = {
  student: GraduationCap,
  teacher: BookOpen,
};

const initialState: RegistrationState = {
  step: "info",
  email: null,
  firstName: null,
  lastName: null,
  middleName: null,
  roleId: null,
  roleSlug: null,
  error: null,
};

const ROLE_NAME_EN: Record<string, string> = {
  teacher: "Teacher",
  student: "Student",
};

function getRoleName(role: Role, locale: string): string {
  if (locale === "en" && ROLE_NAME_EN[role.slug]) return ROLE_NAME_EN[role.slug]!;
  if (locale === "ru" && role.nameRu) return role.nameRu;
  return role.nameTg;
}

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
  const locale = useLocale();
  const [selectedRoleSlug, setSelectedRoleSlug] = useState<string | null>(null);

  const [state, formAction, isPending] = useActionState(
    (prevState: RegistrationState, formData: FormData) => {
      switch (prevState.step) {
        case "info":
          return sendOtpAction(prevState, formData);
        case "otp":
          return verifyOtpAction(prevState, formData);
        case "password":
          return setPasswordAction(prevState, formData);
        case "details":
          return completeDetailsAction(prevState, formData);
      }
    },
    initialState
  );

  const Icon = STEP_ICONS[state.step];
  const stepNumber = ["info", "otp", "password", "details"].indexOf(state.step) + 1;

  return (
    <div className="w-full max-w-md space-y-6 animate-in">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50">
          <Icon className="h-6 w-6 text-primary-600" />
        </div>
        <h1 className="text-2xl font-bold text-neutral-900">{t("registerTitle")}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {state.step === "info" && t("registerRoleStep")}
          {state.step === "otp" && t("registerOtpStep")}
          {state.step === "password" && t("registerPasswordStep")}
          {state.step === "details" && t("registerProfileStep")}
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2">
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className={`h-2 rounded-full transition-all ${
              s === stepNumber ? "w-8 bg-primary-500" : s < stepNumber ? "w-2 bg-primary-300" : "w-2 bg-neutral-200"
            }`}
          />
        ))}
      </div>

      <form action={formAction} className="space-y-4">
        {/* STEP 1: Basic info */}
        {state.step === "info" && (
          <>
            <div className="space-y-2">
              <label htmlFor="lastName" className="text-sm font-medium text-neutral-700">
                {t("lastName")}
              </label>
              <Input id="lastName" name="lastName" required />
            </div>
            <div className="space-y-2">
              <label htmlFor="firstName" className="text-sm font-medium text-neutral-700">
                {t("firstName")}
              </label>
              <Input id="firstName" name="firstName" required />
            </div>
            <div className="space-y-2">
              <label htmlFor="middleName" className="text-sm font-medium text-neutral-700">
                {t("middleName")}
              </label>
              <Input id="middleName" name="middleName" />
            </div>
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
              />
            </div>

            {/* Role selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700">
                {t("selectRole")}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {roles.map((role) => {
                  const RoleIcon = ROLE_ICONS[role.slug] ?? UserPlus;
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
                      <RoleIcon className="h-4 w-4 shrink-0 text-neutral-600" />
                      <span className="text-sm font-medium">{getRoleName(role, locale)}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* STEP 2: OTP verification */}
        {state.step === "otp" && (
          <div className="space-y-2">
            <label htmlFor="token" className="text-sm font-medium text-neutral-700">
              {t("otpCode")}
            </label>
            <Input
              id="token"
              name="token"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              required
              autoComplete="one-time-code"
              className="text-center text-2xl tracking-[0.5em] font-mono"
            />
            <p className="text-xs text-neutral-500">{t("otpSentTo", { email: state.email ?? "" })}</p>
          </div>
        )}

        {/* STEP 3: Password */}
        {state.step === "password" && (
          <>
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
              />
              <p className="text-xs text-neutral-500">{t("passwordHint")}</p>
            </div>
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
              />
            </div>
          </>
        )}

        {/* STEP 4: Role-specific details */}
        {state.step === "details" && (
          <>
            {/* Student details */}
            {state.roleSlug === "student" && (
              <>
                {classes.length > 0 && (
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
                  />
                </div>
              </>
            )}

            {/* Teacher details */}
            {state.roleSlug === "teacher" && (
              <>
                {subjects.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-700">
                      {t("selectSubjects")}
                    </label>
                    <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-neutral-200 p-2">
                      {subjects.map((subject) => (
                        <label key={subject.id} className="flex cursor-pointer items-center gap-2 rounded p-1.5 hover:bg-neutral-50">
                          <input type="checkbox" name="subjectIds" value={subject.id} className="rounded" />
                          <span className="text-sm">{locale === "ru" && subject.nameRu ? subject.nameRu : subject.nameTg}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <label htmlFor="education" className="text-sm font-medium text-neutral-700">
                    {t("education")}
                  </label>
                  <Input id="education" name="education" />
                </div>
                <div className="space-y-2">
                  <label htmlFor="university" className="text-sm font-medium text-neutral-700">
                    {t("university")}
                  </label>
                  <Input id="university" name="university" />
                </div>
                <div className="space-y-2">
                  <label htmlFor="workStartYear" className="text-sm font-medium text-neutral-700">
                    {t("workStartYear")}
                  </label>
                  <Input
                    id="workStartYear"
                    name="workStartYear"
                    type="number"
                    min={1970}
                    max={2100}
                  />
                </div>
              </>
            )}

            {/* Avatar upload */}
            <FileUpload name="avatar" />
          </>
        )}

        {state.error && (
          <div className="animate-in rounded-lg bg-red-50 p-3 text-sm text-error-600">
            {t(state.error)}
          </div>
        )}

        <Button type="submit" className="w-full press-scale" loading={isPending}>
          {state.step === "info" && t("sendOtp")}
          {state.step === "otp" && t("verifyOtp")}
          {state.step === "password" && t("setPassword")}
          {state.step === "details" && t("registerSubmit")}
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
