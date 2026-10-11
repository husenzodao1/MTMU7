"use client";

import {
  BadgeCheck,
  BookOpenCheck,
  Briefcase,
  Crown,
  GraduationCap,
  HeartHandshake,
  Library,
  Plus,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { FormField, Input, Select, describedBy } from "@/components/ui/form-controls";
import { Alert } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { saveAccountAction } from "@/features/accounts/actions";
import { CredentialsCard } from "@/features/accounts/credentials-card";
import {
  CLASS_POSITIONS,
  kindFromDetails,
  type AccountDetails,
  type AccountInput,
  type AccountKind,
  type ClassPosition,
  type GuardianLink,
  type IssuedLogin,
} from "@/features/accounts/types";
import { cn } from "@/lib/utils/cn";

export interface ClassOption {
  value: string;
  label: string;
  grade: number | null;
}

const KIND_ICON: Record<AccountKind, typeof UserRound> = {
  student: GraduationCap,
  teacher: BookOpenCheck,
  director: Crown,
  vice_principal: Briefcase,
  librarian: Library,
  staff: UserRound,
  parent: HeartHandshake,
  admin: ShieldCheck,
};

const STAFF_KINDS: AccountKind[] = ["teacher", "director", "vice_principal", "librarian", "staff"];


/**
 * One form for every kind of account, new or existing.
 *
 * The post is chosen first, and the form asks only what that post needs: a
 * pupil's class, their posts in it and their parents; a teacher's number and
 * the class they lead; a parent's children; an administrator's name, address
 * and telephone and nothing else. The database decides everything else —
 * who may do this, the youngest pupils' parents, the login — and its answers
 * land on the field they concern.
 */
export function AccountForm({
  details,
  basePath,
  allowedKinds,
  classes,
  parentManagedMaxGrade,
  defaultKind,
}: {
  details: AccountDetails | null;
  basePath: string;
  allowedKinds: AccountKind[];
  classes: ClassOption[];
  /** No longer used: parents are not written on this form (00088). */
  parentRequiredMaxGrade?: number;
  parentManagedMaxGrade: number;
  defaultKind?: AccountKind;
}) {
  const t = useTranslations("accounts");
  const tRoot = useTranslations();
  const toast = useToast();
  const router = useRouter();
  const [saving, startSaving] = useTransition();

  const initialKind = details ? kindFromDetails(details) : (defaultKind ?? allowedKinds[0] ?? "student");
  const [kind, setKind] = useState<AccountKind>(initialKind);
  const [fields, setFields] = useState({
    last_name: details?.last_name ?? "",
    first_name: details?.first_name ?? "",
    middle_name: details?.middle_name ?? "",
    nickname: details?.nickname ?? "",
    date_of_birth: details?.date_of_birth ?? "",
    gender: (details?.gender ?? "") as "male" | "female" | "",
    phone: details?.phone ?? "",
    email: details?.email ?? "",
  });
  const [classId, setClassId] = useState(details?.student?.class_id ?? (classes.length === 1 ? classes[0]!.value : ""));
  const [studentNumber, setStudentNumber] = useState(details?.student?.student_number ?? "");
  const [positions, setPositions] = useState<ClassPosition[]>(details?.student?.positions ?? []);
  const [staff, setStaff] = useState({
    employee_number: details?.staff?.employee_number ?? "",
    position: details?.staff?.position ?? "",
    qualification: details?.staff?.qualification ?? "",
    subjects_note: details?.staff?.subjects_note ?? "",
    hire_date: details?.staff?.hire_date ?? "",
    homeroom_class_id: details?.staff?.homeroom_class_id ?? "",
  });
  // A parent's children come from the pupils' workbook (00088): shown here,
  // and sent back unchanged so saving a parent's name keeps them.
  const children = (details?.guardian?.children ?? []).map((c) => ({ id: c.student_id, name: `${c.last_name} ${c.first_name}`.trim(), className: c.class_name, relationship: c.relationship }));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [issued, setIssued] = useState<IssuedLogin | null>(null);

  const chosenClass = classes.find((c) => c.value === classId);
  const typedName = `${fields.last_name} ${fields.first_name}`.trim();
  const grade = chosenClass?.grade ?? details?.student?.grade_level ?? null;
  const parentManaged = kind === "student" && grade !== null && grade <= parentManagedMaxGrade;
  const emailRequired = !(kind === "parent" || parentManaged) && !(details && !details.email);
  const editingKindLocked = details !== null && (initialKind === "student" || initialKind === "parent");
  // Nobody makes a parent by hand: parents come with their child in the
  // pupils' workbook (00088).
  const kindsOnOffer = editingKindLocked ? [initialKind] : details ? allowedKinds.filter((k) => k !== "student" && k !== "parent") : allowedKinds.filter((k) => k !== "parent");

  const error = (name: string) => errors[name]?.map((key) => tRoot(key)).join(" · ");
  const set = (name: keyof typeof fields) => (value: string) => setFields((current) => ({ ...current, [name]: value }));

  const input = (): AccountInput => {
    const base: AccountInput = { kind, ...fields };
    if (kind === "student") {
      base.student = {
        class_id: classId,
        student_number: studentNumber,
        positions,
      };
    } else if (STAFF_KINDS.includes(kind)) {
      base.staff = { ...staff };
    } else if (kind === "parent") {
      base.parent = { children: children.map((c) => c.id), relationship: children[0]?.relationship ?? "guardian" };
    }
    return base;
  };

  const submit = () =>
    startSaving(async () => {
      setErrors({});
      const result = await saveAccountAction(details?.id ?? null, input());
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast("danger", tRoot(result.message));
        return;
      }
      toast("success", tRoot(result.message ?? "accounts.saved"));
      if (result.data?.password) {
        setIssued(result.data);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (result.data?.created) {
        router.push(`${basePath}/${result.data.userId}`);
      } else {
        router.refresh();
      }
    });

  if (issued?.password) {
    const name = `${fields.last_name} ${fields.first_name}`.trim();
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <CredentialsCard name={name} login={issued.login} password={issued.password} offerTelegram={parentManaged} />
        <div className="flex flex-wrap gap-2">
          <Link href={`${basePath}/${issued.userId}`} className={buttonClasses("primary")}>
            {t("openAccount")}
          </Link>
          <Link href={`${basePath}/new${kind === "student" ? "" : `?kind=${kind}`}`} className={buttonClasses("secondary")} onClick={() => setIssued(null)}>
            <Plus aria-hidden />
            {t("addAnother")}
          </Link>
          <Link href={basePath} className={buttonClasses("ghost")}>
            {t("back")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      noValidate
    >
      <div className="space-y-5">
        {kindsOnOffer.length > 1 || !details ? (
          <Section title={t("sections.kind")}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {kindsOnOffer.map((option) => {
                const Icon = KIND_ICON[option];
                const active = option === kind;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setKind(option)}
                    aria-pressed={active}
                    className={cn(
                      "account-kind group flex flex-col items-start gap-2 rounded-xl border p-3 text-start transition-all",
                      active ? "border-brand-500 bg-brand-50 shadow-sm ring-2 ring-brand-500/25" : "border-line bg-surface hover:border-brand-300 hover:bg-surface-muted/60"
                    )}
                  >
                    <span className={cn("inline-flex size-9 items-center justify-center rounded-lg", active ? "bg-brand-solid text-brand-on-solid" : "bg-surface-muted text-ink-secondary group-hover:text-brand-text")}>
                      <Icon className="size-4.5" aria-hidden />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-ink">{t(`kinds.${option}`)}</span>
                      <span className="block text-xs leading-snug text-ink-muted">{t(`kindHints.${option}`)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {error("kind") ? <p className="mt-2 text-sm font-medium text-danger-700">{error("kind")}</p> : null}
            {kind === "admin" ? <Alert tone="info" className="mt-3">{t("adminHint")}</Alert> : null}
          </Section>
        ) : null}

        <Section title={t("sections.person")}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Text id="last_name" label={t("fields.last_name")} value={fields.last_name} onChange={set("last_name")} error={error("last_name")} required autoComplete="family-name" />
            <Text id="first_name" label={t("fields.first_name")} value={fields.first_name} onChange={set("first_name")} error={error("first_name")} required autoComplete="given-name" />
            <Text id="middle_name" label={t("fields.middle_name")} value={fields.middle_name} onChange={set("middle_name")} error={error("middle_name")} />
          </div>
          {kind !== "admin" ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <Text
                id="date_of_birth"
                type="date"
                label={t("fields.date_of_birth")}
                value={fields.date_of_birth}
                onChange={set("date_of_birth")}
                error={error("date_of_birth")}
                required={kind === "student" && !details}
              />
              <FormField label={t("fields.gender")} htmlFor="gender">
                <Select id="gender" value={fields.gender} onChange={(e) => set("gender")(e.target.value)}>
                  <option value="">{t("fields.genderNone")}</option>
                  <option value="male">{t("fields.male")}</option>
                  <option value="female">{t("fields.female")}</option>
                </Select>
              </FormField>
              <Text id="nickname" label={t("fields.nickname")} value={fields.nickname} onChange={set("nickname")} error={error("nickname")} hint={t("fields.nicknameHint")} autoComplete="off" />
            </div>
          ) : null}
        </Section>

        {kind === "student" ? (
          <Section title={t("sections.class")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t("fields.class_id")} htmlFor="class_id" required error={error("class_id")}>
                <Select id="class_id" value={classId} onChange={(e) => setClassId(e.target.value)} {...describedBy("class_id", { error: error("class_id") })}>
                  <option value="">{t("fields.chooseClass")}</option>
                  {classes.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </Select>
              </FormField>
              <Text id="student_number" label={t("fields.student_number")} value={studentNumber} onChange={setStudentNumber} />
            </div>
            {parentManaged ? <Alert tone="info">{t("guardianManaged", { grade: parentManagedMaxGrade })}</Alert> : null}
          </Section>
        ) : null}

        <Section title={t("sections.contact")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Text id="phone" type="tel" label={t("fields.phone")} value={fields.phone} onChange={set("phone")} error={error("phone")} autoComplete="tel" placeholder="+992 …" />
            <Text
              id="email"
              type="email"
              label={t("fields.email")}
              value={fields.email}
              onChange={set("email")}
              error={error("email")}
              required={emailRequired}
              hint={emailRequired ? t("fields.emailRequired") : t("fields.emailOptional")}
              autoComplete="email"
            />
          </div>
        </Section>

        {kind === "student" ? (
          <>
            <Section title={t("sections.positions")}>
              <div className="flex flex-wrap gap-2">
                {CLASS_POSITIONS.map((position) => {
                  const on = positions.includes(position);
                  return (
                    <button
                      key={position}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setPositions((current) => (on ? current.filter((p) => p !== position) : [...current, position]))}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                        on ? "border-brand-500 bg-brand-solid text-brand-on-solid" : "border-line bg-surface text-ink-secondary hover:border-brand-300 hover:text-ink"
                      )}
                    >
                      {t(`positions.${position}`)}
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section title={t("sections.guardians")} description={t("guardiansFromRegister")}>
              <ParentsList parents={details?.student?.guardians ?? []} />
            </Section>
          </>
        ) : null}

        {STAFF_KINDS.includes(kind) ? (
          <Section title={t("sections.work")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Text
                id="employee_number"
                label={t("fields.employee_number")}
                value={staff.employee_number}
                onChange={(v) => setStaff((s) => ({ ...s, employee_number: v }))}
                error={error("employee_number")}
                hint={t("fields.employeeHint")}
              />
              <Text id="position" label={t("fields.position")} value={staff.position} onChange={(v) => setStaff((s) => ({ ...s, position: v }))} />
              <FormField label={t("fields.homeroom_class_id")} htmlFor="homeroom_class_id" error={error("homeroom_class_id")}>
                <Select id="homeroom_class_id" value={staff.homeroom_class_id} onChange={(e) => setStaff((s) => ({ ...s, homeroom_class_id: e.target.value }))}>
                  <option value="">{t("fields.homeroomNone")}</option>
                  {classes.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </Select>
              </FormField>
              <Text id="hire_date" type="date" label={t("fields.hire_date")} value={staff.hire_date} onChange={(v) => setStaff((s) => ({ ...s, hire_date: v }))} />
              <Text id="qualification" label={t("fields.qualification")} value={staff.qualification} onChange={(v) => setStaff((s) => ({ ...s, qualification: v }))} className="sm:col-span-2" />
              <Text
                id="subjects_note"
                label={t("fields.subjects_note")}
                hint={t("fields.subjectsNoteHint")}
                value={staff.subjects_note}
                onChange={(v) => setStaff((s) => ({ ...s, subjects_note: v }))}
                className="sm:col-span-2"
              />
            </div>
          </Section>
        ) : null}

        {kind === "parent" ? (
          <Section title={t("sections.children")} description={t("childrenFromRegister")}>
            {children.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("noChildren")}</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {children.map((c) => (
                  <li key={c.id} className="rounded-full border border-line bg-surface-muted/60 px-3 py-1 text-sm">
                    {c.name}
                    {c.className ? <span className="text-ink-muted"> · {c.className}</span> : null}
                    <span className="text-ink-muted"> · {t(`relationships.${c.relationship}`)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        ) : null}
      </div>

      <aside className="space-y-4 xl:sticky xl:top-[calc(var(--strip-h)+5rem)] xl:self-start">
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-text">
              {(() => {
                const Icon = KIND_ICON[kind];
                return <Icon className="size-5" aria-hidden />;
              })()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{typedName || t(`kinds.${kind}`)}</p>
              <p className="truncate text-xs text-ink-muted">
                {[typedName ? t(`kinds.${kind}`) : null, kind === "student" ? chosenClass?.label : null, details?.public_id].filter(Boolean).join(" · ") || t(`kindHints.${kind}`)}
              </p>
            </div>
          </div>
          <Button type="submit" className="mt-4 w-full" loading={saving}>
            {details ? t("save") : t("create")}
          </Button>
        </div>
      </aside>
    </form>
  );
}

function Section({ title, description, children, tone }: { title: string; description?: string; children: ReactNode; tone?: "danger" }) {
  return (
    <section className={cn("space-y-4 rounded-2xl border bg-surface p-4 shadow-xs sm:p-5", tone === "danger" ? "border-danger-600/50" : "border-line")}>
      <header>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-ink-muted">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

function Text({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  required,
  className,
  ...props
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <FormField label={label} htmlFor={id} hint={hint} error={error} required={required} className={className}>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} required={required} {...describedBy(id, { hint, error })} {...props} />
    </FormField>
  );
}

/**
 * A pupil's parents, as the pupils' workbook wrote them (00088): who they are,
 * where they work, how to reach them, their own login and whether they have
 * confirmed themselves in the Telegram bot. Read here, written only by the
 * workbook.
 */
function ParentsList({ parents }: { parents: GuardianLink[] }) {
  const t = useTranslations("accounts");
  if (parents.length === 0) return <p className="text-sm text-ink-muted">{t("noParents")}</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {parents.map((p) => (
        <li key={p.id} className="rounded-xl border border-line bg-surface p-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t(`relationships.${p.relationship}`)}</p>
          <p className="mt-0.5 font-semibold text-ink">{[p.last_name, p.first_name, p.middle_name].filter(Boolean).join(" ")}</p>
          <dl className="mt-1.5 space-y-0.5 text-ink-secondary">
            {p.workplace ? <div><dt className="sr-only">{t("parent.workplace")}</dt><dd>{p.workplace}</dd></div> : null}
            {p.phone ? (
              <div>
                <dt className="sr-only">{t("parent.phone")}</dt>
                <dd><a href={`tel:${p.phone.replace(/[^+\d]/g, "")}`} className="hover:text-brand-text hover:underline">{p.phone}</a></dd>
              </div>
            ) : null}
            {p.email ? <div><dt className="sr-only">{t("parent.email")}</dt><dd className="truncate">{p.email}</dd></div> : null}
            {p.login ? <div><dt className="inline">{t("parent.login")}: </dt><dd className="inline font-mono">{p.login}</dd></div> : null}
          </dl>
          <p className={cn("mt-2 inline-flex items-center gap-1 text-xs", p.telegram_confirmed_at ? "text-success-700" : "text-ink-muted")}>
            <BadgeCheck className="size-3.5" aria-hidden />
            {p.telegram_confirmed_at ? t("parent.telegramConfirmed") : t("parent.telegramNotYet")}
          </p>
        </li>
      ))}
    </ul>
  );
}

