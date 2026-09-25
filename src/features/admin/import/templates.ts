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
  width?: number;
  /** Filled in by the portal, not by the office: Логин and Парол. */
  issued?: boolean;
  /** One line under the heading, in the instructions sheet. */
  hint?: string;
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
  "Сутунҳои «Логин» ва «Парол»-ро пур накунед. Пас аз ворид кардан система онҳоро худаш пур мекунад ва шумо ҳамин файлро бо логину парол зеркашӣ мекунед.",
  "Санаро дар шакли СССС-ММ-РР нависед, масалан 2015-03-04.",
  "Номи синфро бо ҳарфҳои кириллӣ нависед: 5А, 7Б, 11В.",
  "Почтаи электронӣ барои ҳар кас бояд ягона бошад. Ду нафар бо як почта ворид карда намешаванд.",
  "Ҳамин файлро баъдтар ислоҳ карда, аз нав ворид кунед — маълумот навсозӣ мешавад ва такрор намешавад. Пароли додашуда иваз намешавад.",
  "Сутунҳои иловагӣ халал намерасонанд: система онҳоро нодида мегирад ва ҳангоми баргардонидан нигоҳ медорад.",
];

export const PEOPLE_TEMPLATES: Record<PeopleKind, SheetSpec> = {
  students: {
    sheet: "Хонандагон",
    title: "Рӯйхати хонандагон",
    maxRows: 2000,
    columns: [
      { key: "class_name", header: "Синф", required: true, width: 10, hint: "Масалан 5А." },
      { key: "last_name", header: "Насаб", required: true, width: 22 },
      { key: "first_name", header: "Ном", required: true, width: 20 },
      { key: "middle_name", header: "Номи падар", width: 22 },
      { key: "date_of_birth", header: "Санаи таваллуд", required: true, width: 18, hint: "СССС-ММ-РР" },
      { key: "gender", header: "Ҷинс", width: 12, hint: "писар ё духтар" },
      { key: "email", header: "Почтаи электронӣ", required: true, width: 30 },
      { key: "phone", header: "Телефон", width: 20 },
      ...ISSUED,
    ],
    instructions: [
      "Ҳар сатр як хонанда. Хонандагонро аз рӯи синф паси ҳам нависед.",
      ...SHARED_INSTRUCTIONS,
      "Агар синфи навишташуда ҳанӯз набошад, система онро месозад. Пеш аз тасдиқ рӯйхати синфҳои нав нишон дода мешавад — хатоҳои имлоро маҳз дар он ҷо бинед.",
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
      { key: "subjects", header: "Фанҳо", width: 34, hint: "Бо нуқта-вергул ҷудо кунед: Математика; Физика" },
      { key: "homeroom_class", header: "Роҳбари синф", width: 16, hint: "Агар роҳбари синф бошад: 5А" },
      { key: "position", header: "Вазифа", width: 22, hint: "омӯзгор, директор, муовини директор, китобдор" },
      { key: "email", header: "Почтаи электронӣ", required: true, width: 30 },
      { key: "phone", header: "Телефон", width: 20 },
      ...ISSUED,
    ],
    instructions: [
      "Ҳар сатр як омӯзгор ё корманд.",
      "Рақами омӯзгор ягона аст ва ҳамон рақамест, ки дар ҷадвали дарсӣ дар қавс навишта мешавад — масалан «Математика (14)».",
      ...SHARED_INSTRUCTIONS,
    ],
  },
};

export type SheetKind = PeopleKind | "timetable";

export function isPeopleKind(value: string): value is PeopleKind {
  return value === "students" || value === "staff";
}

/**
 * How a heading is compared. Case, stray spaces and the star that marks a
 * required column are all noise; a heading that has been retyped by hand should
 * still find its column.
 */
export function normalizeHeader(value: string): string {
  return value.replace(/\*/g, "").replace(/\s+/g, " ").trim().toLowerCase();
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
    ...Array.from({ length: 12 }, (_, index) => ({
      key: `p${index + 1}`,
      header: String(index + 1),
      width: 22,
    })),
  ],
  instructions: [
    "Ҳар сатр як синф ва як рӯз. Сутунҳои 1–12 дарсҳои он рӯзанд.",
    "Дар ҳар катак номи фан ва дар қавс рақами омӯзгорро нависед: Математика (14).",
    "Рақами омӯзгор ҳамон рақамест, ки дар шаблони омӯзгорон навишта шудааст.",
    "Агар синф ба ду гурӯҳ ҷудо шуда бошад, ҳар дуро бо хати каҷ нависед: Забони англисӣ (14) / Забони англисӣ (19).",
    "Катаки холӣ маънои дарси холиро дорад.",
    "Агар омӯзгор ҳанӯз муайян нашуда бошад, танҳо номи фанро нависед.",
    "Рӯзҳои дар файл буда пурра иваз мешаванд; рӯзҳое, ки дар файл нестанд, бетағйир мемонанд.",
    "Синфҳо бояд аллакай мавҷуд бошанд — аввал хонандагонро ворид кунед, баъд ҷадвалро.",
  ],
};
