"use client";

import {
  BookOpenCheck,
  Briefcase,
  Crown,
  GraduationCap,
  HeartHandshake,
  Library,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { FormField, Input, Select, describedBy } from "@/components/ui/form-controls";
import { Alert } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { saveAccountAction, searchPupilsAction, type PupilOption } from "@/features/accounts/actions";
import { CredentialsCard } from "@/features/accounts/credentials-card";
import {
  CLASS_POSITIONS,
  RELATIONSHIPS,
  kindFromDetails,
  type AccountDetails,
  type AccountInput,
  type AccountKind,
  type ClassPosition,
  type GuardianInput,
  type IssuedLogin,
  type Relationship,
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

interface GuardianDraft extends GuardianInput {
  key: string;
  label?: string;
  telegram?: boolean;
}

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
  parentRequiredMaxGrade,
  parentManagedMaxGrade,
  defaultKind,
}: {
  details: AccountDetails | null;
  basePath: string;
  allowedKinds: AccountKind[];
  classes: ClassOption[];
  parentRequiredMaxGrade: number;
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
  const [guardians, setGuardians] = useState<GuardianDraft[]>(
    (details?.student?.guardians ?? []).map((g) => ({
      key: g.id,
      id: g.id,
      relationship: g.relationship,
      label: `${g.last_name} ${g.first_name}`.trim(),
      phone: g.phone ?? undefined,
    }))
  );
  const [staff, setStaff] = useState({
    employee_number: details?.staff?.employee_number ?? "",
    position: details?.staff?.position ?? "",
    qualification: details?.staff?.qualification ?? "",
    hire_date: details?.staff?.hire_date ?? "",
    homeroom_class_id: details?.staff?.homeroom_class_id ?? "",
  });
  const [children, setChildren] = useState<Array<{ id: string; name: string; className: string | null }>>(
    (details?.guardian?.children ?? []).map((c) => ({ id: c.student_id, name: `${c.last_name} ${c.first_name}`.trim(), className: c.class_name }))
  );
  const [parentRelationship, setParentRelationship] = useState<Relationship>(details?.guardian?.children[0]?.relationship ?? "mother");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [issued, setIssued] = useState<IssuedLogin | null>(null);

  const chosenClass = classes.find((c) => c.value === classId);
  const typedName = `${fields.last_name} ${fields.first_name}`.trim();
  const grade = chosenClass?.grade ?? details?.student?.grade_level ?? null;
  const parentRequired = kind === "student" && grade !== null && grade <= parentRequiredMaxGrade;
  const parentManaged = kind === "student" && grade !== null && grade <= parentManagedMaxGrade;
  const emailRequired = !(kind === "parent" || parentManaged) && !(details && !details.email);
  const editingKindLocked = details !== null && (initialKind === "student" || initialKind === "parent");
  const kindsOnOffer = editingKindLocked ? [initialKind] : details ? allowedKinds.filter((k) => k !== "student" && k !== "parent") : allowedKinds;

  const error = (name: string) => errors[name]?.map((key) => tRoot(key)).join(" · ");
  const set = (name: keyof typeof fields) => (value: string) => setFields((current) => ({ ...current, [name]: value }));

  const input = (): AccountInput => {
    const base: AccountInput = { kind, ...fields };
    if (kind === "student") {
      base.student = {
        class_id: classId,
        student_number: studentNumber,
        positions,
        guardians: guardians.map(({ id, last_name, first_name, middle_name, phone, relationship }) =>
          id ? { id, relationship } : { last_name, first_name, middle_name, phone, relationship }
        ),
      };
    } else if (STAFF_KINDS.includes(kind)) {
      base.staff = { ...staff };
    } else if (kind === "parent") {
      base.parent = { children: children.map((c) => c.id), relationship: parentRelationship };
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

            <Section
              title={t("sections.guardians")}
              description={parentRequired ? t("guardianRequired", { grade: parentRequiredMaxGrade }) : undefined}
              tone={error("guardians") ? "danger" : undefined}
            >
              <GuardiansEditor guardians={guardians} onChange={setGuardians} />
              {error("guardians") ? <p className="text-sm font-medium text-danger-700" role="alert">{error("guardians")}</p> : null}
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
            </div>
          </Section>
        ) : null}

        {kind === "parent" ? (
          <Section title={t("sections.children")} tone={error("children") ? "danger" : undefined}>
            <FormField label={t("fields.relationship")} htmlFor="parent_relationship" className="max-w-xs">
              <Select id="parent_relationship" value={parentRelationship} onChange={(e) => setParentRelationship(e.target.value as Relationship)}>
                {RELATIONSHIPS.map((r) => (
                  <option key={r} value={r}>{t(`relationships.${r}`)}</option>
                ))}
              </Select>
            </FormField>
            <ChildrenPicker picked={children} onChange={setChildren} />
            {error("children") ? <p className="text-sm font-medium text-danger-700" role="alert">{error("children")}</p> : null}
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

/** The parents written into a pupil's form: those already linked, and new ones. */
function GuardiansEditor({ guardians, onChange }: { guardians: GuardianDraft[]; onChange: (next: GuardianDraft[]) => void }) {
  const t = useTranslations("accounts");
  const update = (key: string, patch: Partial<GuardianDraft>) => onChange(guardians.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  return (
    <div className="space-y-3">
      {guardians.map((g) => (
        <div key={g.key} className="rounded-xl border border-line bg-surface-muted/40 p-3">
          <div className="flex items-start gap-3">
            <span className="mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-ink-secondary ring-1 ring-line">
              <Users className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 space-y-3">
              {g.id ? (
                <p className="text-sm">
                  <span className="font-semibold text-ink">{g.label}</span>
                  {g.phone ? <span className="text-ink-muted"> · {g.phone}</span> : null}
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input aria-label={t("fields.last_name")} placeholder={t("fields.last_name")} value={g.last_name ?? ""} onChange={(e) => update(g.key, { last_name: e.target.value })} />
                  <Input aria-label={t("fields.first_name")} placeholder={t("fields.first_name")} value={g.first_name ?? ""} onChange={(e) => update(g.key, { first_name: e.target.value })} />
                  <Input aria-label={t("fields.phone")} placeholder={`${t("fields.phone")} +992 …`} type="tel" value={g.phone ?? ""} onChange={(e) => update(g.key, { phone: e.target.value })} />
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {RELATIONSHIPS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={g.relationship === r}
                    onClick={() => update(g.key, { relationship: r })}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-medium",
                      g.relationship === r ? "border-brand-500 bg-brand-50 text-brand-text-strong" : "border-line text-ink-secondary hover:border-brand-300"
                    )}
                  >
                    {t(`relationships.${r}`)}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onChange(guardians.filter((x) => x.key !== g.key))}
              className="rounded-full p-1.5 text-ink-muted hover:bg-danger-50 hover:text-danger-700"
              aria-label={t("removeGuardian")}
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => onChange([...guardians, { key: crypto.randomUUID(), relationship: guardians.length === 0 ? "mother" : "father" }])}
      >
        <Plus aria-hidden />
        {t("addGuardian")}
      </Button>
    </div>
  );
}

/** A parent's children, found by name among the pupils. */
function ChildrenPicker({
  picked: children,
  onChange,
}: {
  picked: Array<{ id: string; name: string; className: string | null }>;
  onChange: (next: Array<{ id: string; name: string; className: string | null }>) => void;
}) {
  const t = useTranslations("accounts");
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<PupilOption[]>([]);
  const [searching, startSearch] = useTransition();
  const chosen = useMemo(() => new Set(children.map((c) => c.id)), [children]);

  const search = (value: string) => {
    setQuery(value);
    if (value.trim().length < 2) return setFound([]);
    startSearch(async () => {
      const result = await searchPupilsAction(value);
      if (result.ok) setFound(result.data ?? []);
    });
  };

  return (
    <div className="space-y-3">
      {children.length === 0 ? <p className="text-sm text-ink-muted">{t("noChildren")}</p> : null}
      <ul className="flex flex-wrap gap-2">
        {children.map((c) => (
          <li key={c.id} className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 py-1 pe-1 ps-3 text-sm font-medium text-brand-text-strong">
            {c.name}
            {c.className ? <span className="text-xs text-ink-muted">· {c.className}</span> : null}
            <button type="button" onClick={() => onChange(children.filter((x) => x.id !== c.id))} className="rounded-full p-1 hover:bg-brand-100" aria-label={t("removeGuardian")}>
              <X className="size-3.5" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
        <Input value={query} onChange={(e) => search(e.target.value)} placeholder={t("fields.searchPupil")} className="ps-9" aria-label={t("fields.searchPupil")} />
      </div>
      {found.length > 0 ? (
        <ul className={cn("max-w-md divide-y divide-line overflow-hidden rounded-xl border border-line", searching && "opacity-60")}>
          {found
            .filter((p) => p.studentId && !chosen.has(p.studentId))
            .map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-medium text-ink">{p.name}</span>
                  {p.className ? <span className="text-ink-muted"> · {p.className}</span> : null}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    onChange([...children, { id: p.studentId!, name: p.name, className: p.className }]);
                    setQuery("");
                    setFound([]);
                  }}
                >
                  <Plus aria-hidden />
                  {t("addChild")}
                </Button>
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}
