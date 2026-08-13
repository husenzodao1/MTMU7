"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { loginAction } from "./actions";
import Link from "next/link";

export function LoginForm({ redirect }: { redirect?: string }) {
  const t = useTranslations("auth");
  const [state, formAction, isPending] = useActionState(loginAction, { error: null });

  return (
    <form action={formAction} className="space-y-4">
      {redirect && <input type="hidden" name="redirect" value={redirect} />}

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

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-medium text-neutral-700">
            {t("password")}
          </label>
          <Link href="/reset-password" className="text-xs text-primary-600 hover:text-primary-700">
            {t("forgotPassword")}
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          error={!!state.error}
        />
      </div>

      {state.error && (
        <div className="animate-in rounded-lg bg-red-50 p-3 text-sm text-error-600">
          {t(state.error)}
        </div>
      )}

      <Button type="submit" className="w-full" loading={isPending}>
        {t("loginButton")}
      </Button>

      <p className="text-center text-sm text-neutral-500">
        {t("noAccount")}{" "}
        <Link href="/register" className="font-medium text-primary-600 hover:text-primary-700">
          {t("registerButton")}
        </Link>
      </p>
    </form>
  );
}
