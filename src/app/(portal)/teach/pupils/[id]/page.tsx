import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BadgeCheck, Mail, Phone, Send } from "lucide-react";
import { sendParentNoteAction } from "@/features/teach/parent-note-actions";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { TextAreaField } from "@/components/ui/fields";
import { Alert, Breadcrumb, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/surface";
import { requireAccess } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { robots: { index: false } };

/**
 * A pupil, as their teachers see them: the class, and the parents the pupils'
 * workbook wrote — who, where they work, the telephone (a tap calls), the
 * address, whether they have confirmed themselves in the Telegram bot — and a
 * note to them through the bot.
 *
 * Open to the office, the director, the class teacher and the pupil's own
 * teachers; student_parents (00088) refuses anybody else, and so does this
 * page.
 */
export default async function PupilCardPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAccess();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const t = await getTranslations("teach.pupil");
  const tt = await getTranslations("teach");
  const ta = await getTranslations("accounts");
  const supabase = await createClient();

  const { data: parents, error } = await supabase.rpc("student_parents", { p_student: id });
  if (error) notFound();
  const { data: pupil } = await supabase
    .from("students")
    .select("id, first_name, last_name, middle_name, users:user_id(public_id), enrollments(status, classes(name, academic_years(is_current)))")
    .eq("id", id)
    .maybeSingle();
  if (!pupil) notFound();

  const name = [pupil.last_name, pupil.first_name, pupil.middle_name].filter(Boolean).join(" ");
  const current = ((pupil.enrollments ?? []) as Array<{ status: string; classes: { name: string; academic_years: { is_current: boolean } | null } | null }>)
    .find((e) => e.status === "active" && e.classes?.academic_years?.is_current);
  const login = (pupil.users as unknown as { public_id: string } | null)?.public_id;
  const list = parents ?? [];
  const chats = list[0]?.telegram_chats ?? 0;

  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumb label={tt("breadcrumb")} items={[{ label: tt("title"), href: "/teach" }, { label: name }]} />}
        title={name}
        description={[current?.classes?.name, login].filter(Boolean).join(" · ")}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Card>
          <CardHeader title={t("parents")} description={t("parentsHint")} />
          <CardBody>
            {list.length === 0 ? (
              <EmptyState title={t("noParents")} description={t("noParentsHint")} />
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {list.map((p) => (
                  <li key={p.guardian_id} className="rounded-xl border border-line p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{ta(`relationships.${p.relationship ?? "guardian"}`)}</p>
                    <p className="mt-0.5 text-base font-semibold text-ink">{[p.last_name, p.first_name, p.middle_name].filter(Boolean).join(" ")}</p>
                    {p.workplace ? <p className="text-sm text-ink-secondary">{p.workplace}</p> : null}
                    <div className="mt-2 space-y-1 text-sm">
                      {p.phone ? (
                        <a href={`tel:${p.phone.replace(/[^+\d]/g, "")}`} className="flex items-center gap-2 text-brand-text hover:underline">
                          <Phone className="size-4" aria-hidden />
                          {p.phone}
                        </a>
                      ) : null}
                      {p.email ? (
                        <a href={`mailto:${p.email}`} className="flex items-center gap-2 text-brand-text hover:underline">
                          <Mail className="size-4" aria-hidden />
                          <span className="truncate">{p.email}</span>
                        </a>
                      ) : null}
                    </div>
                    <p className={cn("mt-3 inline-flex items-center gap-1 text-xs", p.telegram_confirmed_at ? "text-success-700" : "text-ink-muted")}>
                      <BadgeCheck className="size-3.5" aria-hidden />
                      {p.telegram_confirmed_at ? ta("parent.telegramConfirmed") : ta("parent.telegramNotYet")}
                    </p>
                    {(p.children ?? 0) > 1 ? <p className="mt-1 text-xs text-ink-muted">{t("moreChildren", { count: (p.children ?? 1) - 1 })}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("note")} description={t("noteHint")} />
          <CardBody>
            {chats === 0 ? <Alert tone="warning" className="mb-3">{t("noTelegram")}</Alert> : null}
            <ActionForm action={sendParentNoteAction} className="space-y-3" resetOnSuccess>
              <input type="hidden" name="studentId" value={pupil.id} />
              <TextAreaField name="text" label={t("noteLabel")} rows={5} maxLength={2000} required />
              <SubmitButton disabled={chats === 0}>
                <Send aria-hidden />
                {t("send")}
              </SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
