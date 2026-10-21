/**
 * The workbooks the school office fills in, described once.
 *
 * The same description writes the template and reads what comes back, so a
 * column can never be added to one and forgotten in the other. Columns are
 * matched by their heading, never by position: the office will reorder them,
 * and a file that silently put telephone numbers into the date of birth would
 * be worse than one that refuses.
 */

export type PeopleKind = "students" | "staff";

export interface ColumnSpec {
  /** The key the import function reads. */
  key: string;
  /** The heading as it is printed, in Tajik. */
  header: string;
  required?: boolean;
  /**
   * A required column that a file may do without when it has these columns
   * instead (by key): the name in one cell, or in an old template's three.
   */
  or?: string[];
  width?: number;
  /** Filled in by the portal, not by the office: Логин and Парол. */
  issued?: boolean;
  /**
   * Read when a file has it, never written into a new template: a column an
   * older template had, kept so an old file still reads in full.
   */
  legacy?: boolean;
  /** One line under the heading, in the instructions sheet. */
  hint?: string;
}

/** The columns a new workbook is written with (everything but the legacy ones). */
export function writtenColumns(spec: SheetSpec): ColumnSpec[] {
  return spec.columns.filter((column) => !column.legacy);
}

export interface SheetSpec {
  sheet: string;
  title: string;
  columns: ColumnSpec[];
  /** What the instructions sheet says, in order. */
  instructions: string[];
  maxRows: number;
}

const ISSUED: ColumnSpec[] = [
  { key: "login", header: "Логин", issued: true, width: 14, hint: "Система пур мекунад." },
  { key: "password", header: "Парол", issued: true, width: 16, hint: "Система пур мекунад." },
];

const SHARED_INSTRUCTIONS = [
  "Сутунҳои хокистарии «Логин» ва «Парол»-ро пур накунед. Пас аз ворид кардан система онҳоро худаш пур мекунад ва шумо ҳамин файлро бо логину парол зеркашӣ мекунед.",
  "Санаро дар шакли СССС-ММ-РР нависед, масалан 2015-03-04.",
  "Номи синфро бо ҳарфҳои кириллӣ нависед: 5А, 7Б, 11Ғ. Синфҳои 1А … 11Д дар система аллакай ҳастанд; синфе, ки хонанда надорад, намоён нест.",
  "Почтаи электронӣ барои ҳар кас бояд ягона бошад. Ду нафар бо як почта ворид карда намешаванд.",
  "Ҳамин файлро баъдтар ислоҳ карда, аз нав ворид кунед — танҳо он чи иваз шудааст навсозӣ мешавад. Логин ва пароли додашуда иваз намешаванд ва дубора дода намешаванд.",
  "Катаки холӣ чизеро пок намекунад: он чи дар система аллакай ҳаст, мемонад.",
  "Сутунҳои иловагӣ халал намерасонанд: система онҳоро нодида мегирад ва ҳангоми баргардонидан нигоҳ медорад.",
];

/** The four cells written for each parent, father first. */
function parentColumns(prefix: "father" | "mother", who: string): ColumnSpec[] {
  return [
    { key: `${prefix}_name`, header: `${who} (насаб, ном, номи падар)`, width: 30, hint: prefix === "father" ? "Каримов Анвар Саидович" : "Каримова Мадина Аҳмадовна" },
    { key: `${prefix}_workplace`, header: `Ҷои кори ${who.toLowerCase()}`, width: 26, hint: "Масалан: Беморхонаи шаҳрӣ, табиб" },
    { key: `${prefix}_phone`, header: `Телефони ${who.toLowerCase()}`, width: 20, hint: "+992 90 123 45 67" },
    { key: `${prefix}_email`, header: `Почтаи ${who.toLowerCase()}`, width: 28, hint: "Агар бошад" },
  ];
}

export const PEOPLE_TEMPLATES: Record<PeopleKind, SheetSpec> = {
  students: {
    sheet: "Хонандагон",
    title: "Рӯйхати хонандагон",
    maxRows: 2000,
    columns: [
      { key: "class_name", header: "Синф", required: true, width: 10, hint: "Масалан 5А." },
      {
        key: "full_name",
        header: "Насаб, ном ва номи падар",
        required: true,
        // A file from the old template, with the name in three columns.
        or: ["last_name", "first_name"],
        width: 34,
        hint: "Каримов Алӣ Раҳимович",
      },
      { key: "last_name", header: "Насаб", legacy: true },
      { key: "first_name", header: "Ном", legacy: true },
      { key: "middle_name", header: "Номи падар", legacy: true },
      { key: "date_of_birth", header: "Санаи таваллуд", required: true, width: 18, hint: "СССС-ММ-РР" },
      { key: "gender", header: "Ҷинс", width: 12, hint: "писар ё духтар" },
      { key: "email", header: "Почтаи электронӣ", width: 30, hint: "Ихтиёрӣ: бе почта бо логин ворид мешавад." },
      { key: "phone", header: "Телефон", width: 20 },
      ...parentColumns("father", "Падар"),
      ...parentColumns("mother", "Модар"),
      ...ISSUED,
      { key: "parent_login", header: "Логини волид", issued: true, width: 14, hint: "Система пур мекунад." },
      { key: "parent_password", header: "Пароли волид", issued: true, width: 14, hint: "Система пур мекунад." },
      // The old template gave each parent their own login.
      { key: "father_login", header: "Логини падар", issued: true, legacy: true },
      { key: "father_password", header: "Пароли падар", issued: true, legacy: true },
      { key: "mother_login", header: "Логини модар", issued: true, legacy: true },
      { key: "mother_password", header: "Пароли модар", issued: true, legacy: true },
    ],
    instructions: [
      "Ҳар сатр як хонанда. Хонандагонро аз рӯи синф паси ҳам нависед.",
      "Насаб, ном ва номи падари хонандаро дар як катак, бо ҳамин тартиб нависед: Каримов Алӣ Раҳимович.",
      "Падар ва модарро дар ҳамин сатр нависед: ному насаб, ҷои кор, телефон ва почта (агар бошад). Волидайн танҳо аз ҳамин файл муайян мешаванд.",
      "Ба волидайни ҳар хонанда як логин ва пароли кӯтоҳ (ду ҳарф ва шаш рақам) дода мешавад — ба падар, агар навишта шуда бошад, вагарна ба модар. Система онҳоро дар ҳамин файл бармегардонад; бо онҳо волидайн ба сомона ва ба боти Telegram ворид мешаванд.",
      "Бародару хоҳарон, ки падар ё модарашон бо як рақами телефон навишта шудааст, як волид доранд — логини дуюм дода намешавад.",
      "Барои синфҳои 1–4 ақаллан яке аз волидайн (ном ва телефон) ҳатмист. Хонандагони синфҳои 1–5 бе почта ворид мешаванд: онҳо бо логин ворид мешаванд.",
      ...SHARED_INSTRUCTIONS,
      "Хонандаи аллакай воридшуда аз рӯи насаб, ном ва санаи таваллуд шинохта мешавад — ҳатто агар синфаш иваз шуда бошад. Барои ӯ ҳисоби нав сохта намешавад.",
    ],
  },
  staff: {
    sheet: "Омӯзгорон",
    title: "Рӯйхати омӯзгорон",
    maxRows: 1000,
    columns: [
      { key: "employee_number", header: "Рақами омӯзгор", required: true, width: 18, hint: "Ҳамон рақаме, ки дар ҷадвали дарсӣ навишта мешавад: 14." },
      { key: "last_name", header: "Насаб", required: true, width: 22 },
      { key: "first_name", header: "Ном", required: true, width: 20 },
      { key: "middle_name", header: "Номи падар", width: 22 },
      { key: "subjects", header: "Фанҳо", width: 34, hint: "Маълумот барои аккаунт: Математика; Физика" },
      { key: "homeroom_class", header: "Роҳбари синф", width: 16, hint: "Агар роҳбари синф бошад: 5А" },
      { key: "position", header: "Вазифа", width: 22, hint: "омӯзгор, директор, муовини директор, китобдор" },
      { key: "email", header: "Почтаи электронӣ", width: 30, hint: "Ихтиёрӣ: бе почта бо логин ворид мешавад." },
      { key: "phone", header: "Телефон", width: 20 },
      ...ISSUED,
    ],
    instructions: [
      "Ҳар сатр як омӯзгор ё корманд.",
      "Рақами омӯзгор ягона аст ва ҳамон рақамест, ки дар ҷадвали дарсӣ дар қавс навишта мешавад — масалан «Математика (14)».",
      "Сутуни «Фанҳо» танҳо маълумот аст ва дар аккаунти омӯзгор нишон дода мешавад. Кӣ дар кадом синф кадом фанро дарс медиҳад, аз ҷадвали дарсӣ муайян мешавад.",
      "Роҳбари синф ба синфи худ худкор мепайвандад: баъди ворид шудан хонандагони синфи худро мебинад, онҳоро ворид мекунад ва логину пароли волидайнро мегирад.",
      ...SHARED_INSTRUCTIONS,
    ],
  },
};

/**
 * A pupil's row with the name both ways: the one cell the template has now
 * («Каримов Алӣ Раҳимович» — surname, name, then the father's name, which may
 * be more than one word) and the three cells the database and the telephone
 * check compare by. A file of the old template, with three columns, gets its
 * one cell from them, so the workbook handed back has it filled in.
 * The database reads the name the same way (app.register_names, 00096).
 */
export function withNames(row: Record<string, string>): Record<string, string> {
  const full = (row.full_name ?? "").replace(/\s+/g, " ").trim();
  if (full) {
    const [last = "", first = "", ...middle] = full.split(" ");
    return { ...row, full_name: full, last_name: last, first_name: first, middle_name: middle.join(" ") };
  }
  const parts = [row.last_name, row.first_name, row.middle_name].map((part) => (part ?? "").trim()).filter(Boolean);
  return parts.length > 0 ? { ...row, full_name: parts.join(" ") } : row;
}

export type SheetKind = PeopleKind | "timetable" | "subjects";

export function isPeopleKind(value: string): value is PeopleKind {
  return value === "students" || value === "staff";
}

// A heading retyped on a Russian keyboard has "Руз" for "Рӯз" and "Чадвал" for
// "Ҷадвал"; one typed on some Tajik layouts has "у" plus a combining macron.
const TAJIK_FOLD: Record<string, string> = { ӯ: "у", ӣ: "и", ҷ: "ч", ҳ: "х", қ: "к", ғ: "г" };

/**
 * How a heading is compared. Case, stray spaces, the star that marks a
 * required column and the Tajik letters a Russian keyboard lacks are all
 * noise; a heading that has been retyped by hand should still find its column.
 */
export function normalizeHeader(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[ӯӣҷҳқғ]/g, (letter) => TAJIK_FOLD[letter] ?? letter);
}

/**
 * The timetable, laid out the way the deputy head builds it: one row per class
 * and day, one column per period. Each cell names the subject and, in brackets,
 * the number the teachers' sheet gave the teacher — «Математика (14)». A period
 * split between two groups holds both, separated by a slash.
 *
 * Classes across rows rather than across columns on purpose: adding a class
 * then adds a row, and the file keeps the same shape from one year to the next.
 */
export const TIMETABLE_TEMPLATE: SheetSpec = {
  sheet: "Ҷадвал",
  title: "Ҷадвали дарсӣ",
  maxRows: 2400,
  columns: [
    { key: "class_name", header: "Синф", required: true, width: 10 },
    { key: "day", header: "Рӯз", required: true, width: 14, hint: "Душанбе … Шанбе" },
    { key: "shift", header: "Баст", width: 8, hint: "1 ё 2" },
    ...Array.from({ length: 12 }, (_, index) => ({
      key: `p${index + 1}`,
      header: String(index + 1),
      width: 22,
      // The school rings five bells a shift; a file from an older template
      // with more columns is still read, so nothing in it goes unnoticed.
      legacy: index >= 5,
    })),
  ],
  instructions: [
    "Ҳар сатр як синф ва як рӯз. Сутунҳои 1–5 дарсҳои он рӯзанд.",
    "Дар сутуни «Баст» нависед, ки синф дар басти 1 ё 2 мехонад. Вақти дарсҳо худкор аст:",
    "Басти 1: 8:05–8:45 · 8:50–9:35 · 9:40–10:25 · 10:35–11:20 · 11:25–12:10.",
    "Басти 2: 13:00–13:45 · 13:50–14:35 · 14:40–15:25 · 15:35–16:20 · 16:25–17:10.",
    "Дар ҳар катак номи фан ва дар қавс рақами омӯзгорро нависед: Математика (14). Ҳамин рақам муайян мекунад, ки кӣ дар кадом соат ба кадом синф дарс медиҳад.",
    "Рақами омӯзгор ҳамон рақамест, ки дар файли омӯзгорон навишта шудааст.",
    "Агар синф ба ду гурӯҳ ҷудо шуда бошад, ҳар дуро бо хати каҷ нависед: Забони англисӣ (14) / Забони англисӣ (19).",
    "Катаки холӣ маънои дарси холиро дорад. Агар омӯзгор ҳанӯз муайян нашуда бошад, танҳо номи фанро нависед.",
    "Рӯзҳои дар файл буда пурра иваз мешаванд; рӯзҳое, ки дар файл нестанд, бетағйир мемонанд.",
    "Фанҳое, ки ҳанӯз нестанд, худкор сохта мешаванд.",
  ],
};

/**
 * The school's subjects, one per row: the Tajik name and nothing else. The
 * platform gives each its Russian and English names and a short code by
 * itself (00087), and the timetable creates the subjects it meets by name,
 * so the same name here and there is the same subject.
 */
export const SUBJECTS_TEMPLATE: SheetSpec = {
  sheet: "Фанҳо",
  title: "Фанҳои мактаб",
  maxRows: 300,
  columns: [{ key: "name_tg", header: "Номи фан", required: true, width: 34, hint: "Бо забони тоҷикӣ: Математика" }],
  instructions: [
    "Ҳар сатр як фан — танҳо номи он бо забони тоҷикӣ.",
    "Номи русӣ ва англисӣ ва рамзи фанро система худаш муайян мекунад; ҳангоми интихоби забони русӣ ҷадвали дарсӣ ва баҳоҳо бо русӣ нишон дода мешаванд.",
    "Агар фан аллакай бошад (бо ҳамин ном), такрор намешавад; фани бойгонӣ боз фаъол мегардад.",
    "Номи фанро айнан ҳамон тавр нависед, ки дар ҷадвали дарсӣ менависед — пас ҳарду як фан мешаванд.",
  ],
};
