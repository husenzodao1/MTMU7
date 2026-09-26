/**
 * A filled-in example of each workbook.
 *
 * The blank template says what the columns are; this says what they look like
 * when they are right. It is the cheapest way to stop the mistakes that cost
 * the most to undo — a date written 04.03.2015, a class written 5A with a Latin
 * A, two children sharing one address, a teacher named by their surname instead
 * of the number the timetable calls them by.
 *
 * The three sheets are one consistent school: the teacher numbers in the
 * timetable are the numbers in the teachers' sheet, and the classes in the
 * timetable are the classes the pupils are in. Imported in order — pupils,
 * teachers, timetable — the example works from end to end, which is exactly how
 * it should be read.
 */

// Relative and with its extension, unlike the rest of src/: this module is
// also read by scripts/import/make-samples.mts, which runs under plain Node
// rather than the bundler that resolves "@/" and bare paths.
import { PEOPLE_TEMPLATES, TIMETABLE_TEMPLATE, type SheetSpec } from "./templates.ts";

export type SampleKind = "students" | "staff" | "timetable";

type Row = Record<string, string>;

const STUDENTS: Row[] = [
  // A first-grader: no address of their own (they sign in with the login),
  // and the parent the school must have for the youngest classes.
  {
    class_name: "1А",
    last_name: "Назаров",
    first_name: "Фирдавс",
    middle_name: "Бахтиёрович",
    date_of_birth: "2019-09-01",
    gender: "писар",
    email: "",
    phone: "",
    guardian_name: "Назарова Шаҳло",
    guardian_phone: "+992 93 555 44 33",
    guardian_relationship: "модар",
  },
  {
    class_name: "5А",
    last_name: "Каримов",
    first_name: "Алӣ",
    middle_name: "Раҳимович",
    date_of_birth: "2015-03-04",
    gender: "писар",
    email: "ali.karimov@gmail.com",
    phone: "+992 90 123 45 67",
    guardian_name: "Каримова Мадина",
    guardian_phone: "+992 90 111 22 33",
    guardian_relationship: "модар",
  },
  {
    class_name: "5А",
    last_name: "Саидова",
    first_name: "Нилуфар",
    middle_name: "Фарҳодовна",
    date_of_birth: "2015-01-30",
    gender: "духтар",
    email: "nilufar.saidova@gmail.com",
    phone: "+992 92 234 56 78",
  },
  // Two children of one family. One inbox, two addresses: everything after the
  // + is ignored on delivery, so both codes reach the parent while Supabase
  // still sees two different people.
  {
    class_name: "5А",
    last_name: "Ҳакимов",
    first_name: "Сомон",
    middle_name: "Аскарович",
    date_of_birth: "2015-07-19",
    gender: "писар",
    email: "hakimov.oila+somon@gmail.com",
    phone: "+992 93 345 67 89",
  },
  {
    class_name: "5Б",
    last_name: "Ҳакимова",
    first_name: "Сабина",
    middle_name: "Аскаровна",
    date_of_birth: "2017-02-14",
    gender: "духтар",
    email: "hakimov.oila+sabina@gmail.com",
    phone: "+992 93 345 67 89",
  },
  {
    class_name: "5Б",
    last_name: "Раҷабова",
    first_name: "Зарина",
    middle_name: "Нуруллоевна",
    date_of_birth: "2015-05-12",
    gender: "духтар",
    email: "zarina.rajabova@gmail.com",
    phone: "+992 91 456 78 90",
  },
  {
    class_name: "5Б",
    last_name: "Тоиров",
    first_name: "Ҷамшед",
    middle_name: "Иброҳимович",
    date_of_birth: "2015-09-08",
    gender: "писар",
    email: "jamshed.toirov@gmail.com",
    phone: "+992 98 567 89 01",
  },
];

const STAFF: Row[] = [
  {
    employee_number: "1",
    last_name: "Юсупов",
    first_name: "Абдулло",
    middle_name: "Маҳмудович",
    subjects: "",
    homeroom_class: "",
    position: "директор",
    email: "a.yusupov@mtmu7.tj",
    phone: "+992 92 100 10 01",
  },
  {
    employee_number: "7",
    last_name: "Наҷмиддинов",
    first_name: "Шуҳрат",
    middle_name: "Қосимович",
    subjects: "",
    homeroom_class: "",
    position: "муовини директор",
    email: "sh.najmiddinov@mtmu7.tj",
    phone: "+992 92 100 10 07",
  },
  {
    employee_number: "11",
    last_name: "Ҳусейнзода",
    first_name: "Фаррух",
    middle_name: "Одилович",
    subjects: "Математика",
    homeroom_class: "5А",
    position: "омӯзгор",
    email: "f.huseynzoda@mtmu7.tj",
    phone: "+992 92 100 10 11",
  },
  {
    employee_number: "14",
    last_name: "Раҳимова",
    first_name: "Гулнора",
    middle_name: "Саидовна",
    subjects: "Забони тоҷикӣ; Адабиёти тоҷик",
    homeroom_class: "5Б",
    position: "омӯзгор",
    email: "g.rahimova@mtmu7.tj",
    phone: "+992 92 100 10 14",
  },
  {
    employee_number: "19",
    last_name: "Шарипов",
    first_name: "Бахтиёр",
    middle_name: "Ҷамолович",
    subjects: "Забони англисӣ",
    homeroom_class: "",
    position: "омӯзгор",
    email: "b.sharipov@mtmu7.tj",
    phone: "+992 92 100 10 19",
  },
  {
    employee_number: "23",
    last_name: "Мирзоева",
    first_name: "Сабоҳат",
    middle_name: "Раҳмоновна",
    subjects: "Забони англисӣ",
    homeroom_class: "",
    position: "омӯзгор",
    email: "s.mirzoeva@mtmu7.tj",
    phone: "+992 92 100 10 23",
  },
  {
    employee_number: "27",
    last_name: "Қодирова",
    first_name: "Мунира",
    middle_name: "Тоҳировна",
    subjects: "",
    homeroom_class: "",
    position: "китобдор",
    email: "m.qodirova@mtmu7.tj",
    phone: "+992 92 100 10 27",
  },
];

const DAYS = ["Душанбе", "Сешанбе", "Чоршанбе", "Панҷшанбе", "Ҷумъа", "Шанбе"] as const;

/**
 * Period 1 … 5 for each class and day; a blank is a free period.
 *
 * Laid out so that no teacher is ever in both classes at once — which is a real
 * constraint the importer enforces, and which the first draft of this example
 * broke in nine places. In every period the two classes draw on different
 * teachers: where 5А has the mathematician, 5Б has the language teacher, and so
 * on round.
 */
const WEEK: Record<string, Record<string, string[]>> = {
  "5А": {
    Душанбе: ["Математика (11)", "Забони тоҷикӣ (14)", "Забони англисӣ (19) / Забони англисӣ (23)", "Табиатшиносӣ (11)", "Тарбияи ҷисмонӣ (7)"],
    Сешанбе: ["Забони тоҷикӣ (14)", "Математика (11)", "Адабиёти тоҷик (14)", "Забони англисӣ (19) / Забони англисӣ (23)", ""],
    Чоршанбе: ["Математика (11)", "Табиатшиносӣ (11)", "Забони тоҷикӣ (14)", "Санъати тасвирӣ", ""],
    Панҷшанбе: ["Забони англисӣ (19) / Забони англисӣ (23)", "Математика (11)", "Адабиёти тоҷик (14)", "Тарбияи ҷисмонӣ (7)", ""],
    Ҷумъа: ["Забони тоҷикӣ (14)", "Математика (11)", "Табиатшиносӣ (11)", "Мусиқӣ", ""],
    Шанбе: ["Математика (11)", "Адабиёти тоҷик (14)", "Соати тарбиявӣ (11)", "", ""],
  },
  "5Б": {
    Душанбе: ["Забони тоҷикӣ (14)", "Математика (11)", "Санъати тасвирӣ", "Адабиёти тоҷик (14)", "Забони англисӣ (23)"],
    Сешанбе: ["Математика (11)", "Забони тоҷикӣ (14)", "Табиатшиносӣ (11)", "Мусиқӣ", ""],
    Чоршанбе: ["Забони англисӣ (23)", "Забони тоҷикӣ (14)", "Математика (11)", "Тарбияи ҷисмонӣ (7)", ""],
    Панҷшанбе: ["Математика (11)", "Забони тоҷикӣ (14)", "Табиатшиносӣ (11)", "Санъати тасвирӣ", ""],
    Ҷумъа: ["Математика (11)", "Адабиёти тоҷик (14)", "Забони англисӣ (23)", "Тарбияи ҷисмонӣ (7)", ""],
    Шанбе: ["Забони тоҷикӣ (14)", "Математика (11)", "Соати тарбиявӣ (14)", "", ""],
  },
};

const TIMETABLE: Row[] = Object.entries(WEEK).flatMap(([className, days]) =>
  DAYS.map((day) => {
    const periods = days[day] ?? [];
    const row: Row = { class_name: className, day };
    for (let index = 0; index < 12; index += 1) row[`p${index + 1}`] = periods[index] ?? "";
    return row;
  })
);

const SAMPLES: Record<SampleKind, Row[]> = { students: STUDENTS, staff: STAFF, timetable: TIMETABLE };

export function sampleSpec(kind: SampleKind): SheetSpec {
  return kind === "timetable" ? TIMETABLE_TEMPLATE : PEOPLE_TEMPLATES[kind];
}

/** The example rows, in the column order of that workbook. */
export function sampleRows(kind: SampleKind): Array<Array<string | null>> {
  const spec = sampleSpec(kind);
  return SAMPLES[kind].map((row) => spec.columns.map((column) => row[column.key] ?? null));
}

export function isSampleKind(value: string): value is SampleKind {
  return value === "students" || value === "staff" || value === "timetable";
}

/** What the example's own front page says, so nobody imports it by accident. */
export const SAMPLE_NOTICE = [
  "Ин файл НАМУНА аст. Одамони дар он буда вуҷуд надоранд — онро ворид накунед.",
  "Онро кушоед, бинед, ки сутунҳо чӣ гуна пур мешаванд, ва баъд шаблони холиро бо маълумоти мактаби худ пур кунед.",
  "",
  "Ба чор чиз диққат диҳед:",
  "1. Сана ҳамеша дар шакли СССС-ММ-РР: 2015-03-04, на 04.03.2015.",
  "2. Номи синф бо ҳарфи кириллӣ: 5А. Ҳарфи лотинии A шабеҳ аст, вале система онро ҳам мефаҳмад ва ба кириллӣ табдил медиҳад.",
  "3. Ду фарзанди як оила бо як почта ворид карда намешаванд. Дар намуна оилаи Ҳакимов нишон дода шудааст: hakimov.oila+somon@gmail.com ва hakimov.oila+sabina@gmail.com — ҳарду ба ҳамон як почта мерасанд, вале барои система ду суроғаи ҷудогонаанд.",
  "4. Дар ҷадвали дарсӣ омӯзгор бо РАҚАМ навишта мешавад, на бо насаб: «Математика (11)». Ҳамон рақаме, ки дар шаблони омӯзгорон навиштаед.",
  "",
  "Дар намуна ду чизи дигар низ нишон дода шудааст:",
  "— «Забони англисӣ (19) / Забони англисӣ (23)» — синф ба ду гурӯҳ ҷудо шуда, ҳар гурӯҳ омӯзгори худро дорад.",
  "— «Санъати тасвирӣ» бе қавс — фан ҳаст, вале омӯзгораш ҳанӯз муайян нашудааст. Ин хато нест.",
];
