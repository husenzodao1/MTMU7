import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Check } from "lucide-react";
import type { AdminDashboard } from "@/features/admin/dashboard-query";
import { Card, CardBody, CardHeader } from "@/components/ui/surface";
import { cn } from "@/lib/utils/cn";

type StepKey = "year" | "bell" | "classes" | "staff" | "students" | "identity";

interface Step {
  key: StepKey;
  href: string;
  done: boolean;
}

/**
 * First-run guide for a school that has not been set up yet. Every step is
 * derived from what the dashboard actually reports — no invented progress —
 * and the card disappears once the school is running.
 */
export function setupSteps(data: AdminDashboard): Step[] {
  const alerts = new Set(data.alerts);
  return [
    { key: "year", href: "/admin/academic-years", done: data.academic_year !== null && !alerts.has("no_terms_defined") },
    { key: "bell", href: "/admin/timetable", done: !alerts.has("no_bell_schedule") },
    { key: "classes", href: "/admin/classes", done: Number(data.counts.classes_active) > 0 },
    { key: "staff", href: "/admin/staff", done: Number(data.counts.teachers_active) > 0 },
    { key: "students", href: "/admin/students", done: Number(data.counts.students_active) > 0 },
    { key: "identity", href: "/admin/school", done: !alerts.has("official_content_not_approved") },
  ];
}

export async function SetupGuide({ data, className }: { data: AdminDashboard; className?: string }) {
  const steps = setupSteps(data);
  const pending = steps.filter((step) => !step.done);
  if (pending.length === 0) return null;
  const t = await getTranslations("admin.setup");
  const done = steps.length - pending.length;

  return (
    <Card className={className}>
      <CardHeader title={t("title")} description={t("progress", { done, total: steps.length })} />
      <CardBody className="p-0">
        <ol className="divide-y divide-line">
          {steps.map((step) => (
            <li key={step.key} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  step.done ? "border-success-600 text-success-600" : "border-line-strong text-ink-muted"
                )}
                aria-hidden
              >
                {step.done ? <Check className="size-3.5" /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block font-medium", step.done && "text-ink-muted line-through")}>{t(`steps.${step.key}.title`)}</span>
                <span className="block text-sm text-ink-muted">{t(`steps.${step.key}.hint`)}</span>
                <span className="sr-only">{step.done ? t("doneLabel") : t("todoLabel")}</span>
              </span>
              {step.done ? null : (
                <Link href={step.href} className="shrink-0 text-sm font-semibold text-brand-text hover:underline">
                  {t("open")}
                  <ArrowRight className="ms-1 inline size-4" aria-hidden />
                </Link>
              )}
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}
