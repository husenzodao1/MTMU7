"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { loginAction } from "./actions";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";

export function LoginForm({ redirect }: { redirect?: string }) {
  const t = useTranslations("auth");
  const [state, formAction, isPending] = useActionState(loginAction, { error: null });
  const [showPassword, setShowPassword] = useState(false);

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
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            error={!!state.error}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
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
