"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Layers } from "lucide-react";
import { createClassAction, createAcademicYearAction, bulkCreateClassesAction } from "./actions";

interface AcademicYear {
  id: string;
  name: string;
  isCurrent: boolean;
}

export function CreateAcademicYearForm() {
  const t = useTranslations("admin");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      const result = await createAcademicYearAction(formData);
      if (result.success) {
        setMessage({ type: "success", text: t("yearCreated") });
      } else {
        setMessage({ type: "error", text: t("createClassError") });
      }
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("createAcademicYear")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="yearName" className="text-xs font-medium text-neutral-600">{t("yearName")}</label>
            <Input id="yearName" name="yearName" placeholder="2025-2026" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="startDate" className="text-xs font-medium text-neutral-600">{t("startDate")}</label>
              <Input id="startDate" name="startDate" type="date" required />
            </div>
            <div className="space-y-1">
              <label htmlFor="endDate" className="text-xs font-medium text-neutral-600">{t("endDate")}</label>
              <Input id="endDate" name="endDate" type="date" required />
            </div>
          </div>
          {message && (
            <p className={`text-xs ${message.type === "success" ? "text-green-600" : "text-red-600"}`}>
              {message.text}
            </p>
          )}
          <Button type="submit" size="sm" loading={isPending} className="w-full">
            {t("createAcademicYear")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function CreateClassForm({ academicYears }: { academicYears: AcademicYear[] }) {
  const t = useTranslations("admin");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const currentYear = academicYears.find(y => y.isCurrent) ?? academicYears[0];

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      const result = await createClassAction(formData);
      if (result.success) {
        setMessage({ type: "success", text: t("createClassSuccess") });
      } else {
        setMessage({ type: "error", text: t("createClassError") });
      }
    });
  };

  if (!currentYear) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Plus className="h-4 w-4" />
          {t("addClass")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-3">
          <input type="hidden" name="academicYearId" value={currentYear.id} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="gradeLevel" className="text-xs font-medium text-neutral-600">{t("gradeLevel")}</label>
              <select
                id="gradeLevel"
                name="gradeLevel"
                required
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                {Array.from({ length: 11 }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="letter" className="text-xs font-medium text-neutral-600">{t("letterDesignation")}</label>
              <Input id="letter" name="letter" placeholder="А" required maxLength={5} className="uppercase" />
            </div>
          </div>
          {message && (
            <p className={`text-xs ${message.type === "success" ? "text-green-600" : "text-red-600"}`}>
              {message.text}
            </p>
          )}
          <Button type="submit" size="sm" loading={isPending} className="w-full">
            {t("addClass")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function BulkCreateClassesForm({ academicYears }: { academicYears: AcademicYear[] }) {
  const t = useTranslations("admin");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const currentYear = academicYears.find(y => y.isCurrent) ?? academicYears[0];

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      const result = await bulkCreateClassesAction(formData);
      if (result.success) {
        setMessage({ type: "success", text: `${t("createClassSuccess")} (${result.count})` });
      } else {
        setMessage({ type: "error", text: t("createClassError") });
      }
    });
  };

  if (!currentYear) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="h-4 w-4" />
          {t("addClass")} (1-11)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-3">
          <input type="hidden" name="academicYearId" value={currentYear.id} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="gradeFrom" className="text-xs font-medium text-neutral-600">
                {t("gradeLevel")} (от)
              </label>
              <select
                id="gradeFrom"
                name="gradeFrom"
                required
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                defaultValue={1}
              >
                {Array.from({ length: 11 }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="gradeTo" className="text-xs font-medium text-neutral-600">
                {t("gradeLevel")} (до)
              </label>
              <select
                id="gradeTo"
                name="gradeTo"
                required
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                defaultValue={11}
              >
                {Array.from({ length: 11 }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label htmlFor="letters" className="text-xs font-medium text-neutral-600">
              {t("letterDesignation")} (А,Б,В...)
            </label>
            <Input id="letters" name="letters" placeholder="А,Б,В,Г" required className="uppercase" />
          </div>
          {message && (
            <p className={`text-xs ${message.type === "success" ? "text-green-600" : "text-red-600"}`}>
              {message.text}
            </p>
          )}
          <Button type="submit" size="sm" loading={isPending} className="w-full">
            {t("addClass")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
