import "server-only";
import { getLocale, getTranslations } from "next-intl/server";
import { Document, Field, MUTED, OfficialHeading, Page, PageFooter, PdfTable, Signatures, Text, View, pdf, renderPdf } from "@/lib/pdf/kit";
import { formatNumber, formatShortDate, todayIso } from "@/lib/i18n/format";
import { pickName, pickText, type Locale } from "@/lib/i18n/text";
import { getPlatformIdentity } from "@/lib/site/identity";
import { createClient } from "@/lib/supabase/server";

export type Mark = { value: number; text: string; kind: "final" | "average" | "none"; pending: boolean };

export interface ReportCard {
  name: string;
  rows: Array<{ subject: string; terms: Mark[]; year: Mark }>;
  attendance: Array<{ absent: number; late: number }>;
}

const NONE: Mark = { value: 0, text: "", kind: "none", pending: false };

/**
 * Report cards as one PDF: a page per pupil with every subject of the class,
 * the mark for each term and for the year, the lessons missed, and lines for
 * the class teacher's and the director's signatures.
 *
 * A term's mark is the one the teacher set (term_final); until it is set the
 * average of the everyday marks stands in, printed grey and explained under
 * the table. The year's mark is year_final, or the average of the term marks
 * once every term has one. What the caller may read decides what is printed:
 * the marks come through row-level security (report_card_marks, 00085).
 */
export async function reportCardsPdf({
  classId,
  studentIds,
  school,
  timezone,
}: {
  classId: string;
  studentIds?: string[];
  school: string;
  timezone?: string | null;
}): Promise<{ buffer: Buffer; filename: string } | null> {
  const supabase = await createClient();
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("reportCard");

  const { data: klass } = await supabase
    .from("classes")
    .select("id, name, academic_year_id, academic_years(name)")
    .eq("id", classId)
    .maybeSingle();
  if (!klass) return null;
  const yearName = (klass.academic_years as { name: string } | null)?.name ?? "";

  const [{ data: terms }, { data: subjects }, pupils, { data: marks }, { data: attendance }, identity] = await Promise.all([
    supabase
      .from("academic_terms")
      .select("id, name")
      .eq("academic_year_id", klass.academic_year_id)
      .in("kind", ["quarter", "semester", "trimester", "term"])
      .order("start_date"),
    supabase.from("class_subjects").select("id, subjects(name_tg, name_ru, name_en)").eq("class_id", classId).eq("is_active", true),
    loadPupils(supabase, classId, studentIds),
    supabase.rpc("report_card_marks", { p_class_id: classId }),
    supabase.rpc("report_card_attendance", { p_class_id: classId }),
    getPlatformIdentity(),
  ]);
  if (pupils.length === 0) return null;

  const termList = terms ?? [];
  const subjectList = (subjects ?? [])
    .map((cs) => ({ id: cs.id, name: cs.subjects ? pickName(cs.subjects as { name_tg: string; name_ru: string | null; name_en: string | null }, locale) : "" }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  const number = (value: number, digits = 1) => formatNumber(Number(value.toFixed(digits)), locale);
  const asFinal = (value: number, pending: boolean): Mark => ({
    value,
    text: Number.isInteger(value) ? String(value) : number(value),
    kind: "final",
    pending,
  });

  // pupil → subject → term (or "year") → the marks found
  const found = new Map<string, { final?: Mark; average?: Mark }>();
  const key = (student: string, subject: string, term: string) => `${student}|${subject}|${term}`;
  for (const m of marks ?? []) {
    if (!m.student_id || !m.class_subject_id || m.mark === null) continue;
    const value = Number(m.mark);
    if (m.kind === "year_final") {
      found.set(key(m.student_id, m.class_subject_id, "year"), { final: asFinal(value, !m.approved) });
    } else if (m.academic_term_id) {
      const k = key(m.student_id, m.class_subject_id, m.academic_term_id);
      const entry = found.get(k) ?? {};
      if (m.kind === "term_final") entry.final = asFinal(value, !m.approved);
      else if (m.kind === "average") entry.average = { value, text: number(value), kind: "average", pending: false };
      found.set(k, entry);
    }
  }
  const absences = new Map((attendance ?? []).map((a) => [`${a.student_id}|${a.academic_term_id}`, a]));

  const cards: ReportCard[] = pupils.map((pupil) => ({
    name: pupil.name,
    rows: subjectList.map((subject) => {
      const termMarks = termList.map((term) => {
        const entry = found.get(key(pupil.id, subject.id, term.id));
        return entry?.final ?? entry?.average ?? NONE;
      });
      const setYear = found.get(key(pupil.id, subject.id, "year"))?.final;
      const finals = termMarks.filter((m) => m.kind === "final");
      const year: Mark =
        setYear ??
        (termList.length > 0 && finals.length === termList.length
          ? (() => {
              const mean = finals.reduce((sum, m) => sum + m.value, 0) / finals.length;
              return { value: mean, text: number(mean), kind: "average" as const, pending: false };
            })()
          : NONE);
      return { subject: subject.name, terms: termMarks, year };
    }),
    attendance: termList.map((term) => {
      const a = absences.get(`${pupil.id}|${term.id}`);
      return { absent: a?.absent ?? 0, late: a?.late ?? 0 };
    }),
  }));

  const buffer = await renderReportCards({
    cards,
    terms: termList.map((term) => term.name),
    className: klass.name,
    yearName,
    school,
    authority: pickText(identity.authorityName, locale) || t("authority"),
    generated: formatShortDate(todayIso(timezone ?? undefined), locale),
  });
  const subjectOfName = studentIds?.length === 1 ? cards[0]!.name : klass.name;
  return { buffer, filename: `${t("fileName")} ${subjectOfName} ${yearName}.pdf` };
}

/** The report cards drawn: a page per pupil (also used to preview the layout). */
export async function renderReportCards({
  cards,
  terms,
  className,
  yearName,
  school,
  authority,
  generated,
}: {
  cards: ReportCard[];
  terms: string[];
  className: string;
  yearName: string;
  school: string;
  authority: string;
  generated: string;
}): Promise<Buffer> {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("reportCard");
  const markCell = (mark: Mark) =>
    mark.kind === "none" ? (
      ""
    ) : (
      <Text style={{ fontSize: 9, textAlign: "center", fontWeight: mark.kind === "final" ? 700 : 400, color: mark.kind === "average" ? MUTED : undefined }}>
        {mark.text}
        {mark.pending ? "*" : ""}
      </Text>
    );

  const document = (
    <Document title={t("title")} author={school} creator="MTMU7" language={locale}>
      {cards.map((card) => {
        const anyAverage = card.rows.some((row) => row.terms.some((m) => m.kind === "average") || row.year.kind === "average");
        const anyPending = card.rows.some((row) => row.terms.some((m) => m.pending) || row.year.pending);
        return (
          <Page key={card.name} size="A4" style={pdf.page}>
            <OfficialHeading authority={authority} school={school} title={t("title")} subtitle={t("subtitle", { year: yearName })} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
              <View>
                <Field label={t("pupil")} value={card.name} />
                <Field label={t("class")} value={className} />
              </View>
              <View>
                <Field label={t("year")} value={yearName} />
                <Field label={t("issued")} value={generated} />
              </View>
            </View>

            <PdfTable
              columns={[
                { label: "№", weight: 0.45, align: "center" },
                { label: t("subject"), weight: 4 },
                ...terms.map((term) => ({ label: term, weight: 1.1, align: "center" as const })),
                { label: t("yearMark"), weight: 1.1, align: "center" },
              ]}
              rows={card.rows.map((row, index) => [String(index + 1), row.subject, ...row.terms.map(markCell), markCell(row.year)])}
            />
            {anyAverage || anyPending ? (
              <View style={{ marginTop: 4 }}>
                {anyAverage ? <Text style={[pdf.small, pdf.muted]}>{t("averageNote")}</Text> : null}
                {anyPending ? <Text style={[pdf.small, pdf.muted]}>{t("pendingNote")}</Text> : null}
              </View>
            ) : null}

            {terms.length > 0 ? (
              <View style={{ marginTop: 14 }} wrap={false}>
                <Text style={{ fontSize: 9, fontWeight: 700, marginBottom: 4 }}>{t("attendance")}</Text>
                <PdfTable
                  zebra={false}
                  columns={[
                    { label: "", weight: 4.45 },
                    ...terms.map((term) => ({ label: term, weight: 1.1, align: "center" as const })),
                    { label: t("total"), weight: 1.1, align: "center" },
                  ]}
                  rows={[
                    [t("missed"), ...card.attendance.map((a) => String(a.absent)), String(card.attendance.reduce((s, a) => s + a.absent, 0))],
                    [t("late"), ...card.attendance.map((a) => String(a.late)), String(card.attendance.reduce((s, a) => s + a.late, 0))],
                  ]}
                />
              </View>
            ) : null}

            <Signatures items={[t("classTeacher"), t("director"), t("parent")]} stamp={t("stamp")} />
            <PageFooter left={`${school} · ${card.name} · ${yearName}`} pageLabel={(page, total) => t("page", { page, total })} />
          </Page>
        );
      })}
    </Document>
  );

  return renderPdf(document);
}

async function loadPupils(supabase: Awaited<ReturnType<typeof createClient>>, classId: string, studentIds?: string[]) {
  const name = (s: { last_name: string; first_name: string; middle_name?: string | null }) =>
    [s.last_name, s.first_name, s.middle_name].filter(Boolean).join(" ");
  if (studentIds && studentIds.length > 0) {
    const { data } = await supabase.from("students").select("id, first_name, last_name, middle_name").in("id", studentIds);
    return (data ?? []).map((s) => ({ id: s.id, name: name(s) }));
  }
  const { data } = await supabase
    .from("enrollments")
    .select("student_id, students(first_name, last_name, middle_name)")
    .eq("class_id", classId)
    .in("status", ["active", "completed"]);
  const seen = new Set<string>();
  return (data ?? [])
    .flatMap((e) => {
      const s = e.students as { first_name: string; last_name: string; middle_name: string | null } | null;
      if (!s || seen.has(e.student_id)) return [];
      seen.add(e.student_id);
      return [{ id: e.student_id, name: name(s) }];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
