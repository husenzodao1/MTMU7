/**
 * A whole demonstration school, as the four workbooks the office would fill in.
 *
 *   npm run demo:workbooks              # into ./demo-school
 *   npm run demo:workbooks -- <dir>     # somewhere else
 *
 * Twenty subjects; twenty teachers (eight in the primary classes, twelve
 * subject teachers, each of them a class teacher) and a director, a deputy
 * and a librarian; twenty classes from 1А to 11А with some 540 pupils, each
 * with a father and a mother (brothers and sisters share theirs); and a
 * timetable in two shifts in which no teacher is ever in two places at once.
 *
 * The people do not exist. Everything is generated from a fixed seed, so the
 * same command writes the same school every time. The rows follow the
 * templates in src/features/admin/import/templates.ts, so the files import
 * through the portal exactly as a real school's would: subjects, teachers,
 * pupils, timetable — in that order.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export type Row = Record<string, string>;

/** A small deterministic generator, so the demo school is the same every time. */
function random(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T,>(list: readonly T[]) => list[Math.floor(next() * list.length)]!,
    shuffle: <T,>(list: T[]) => {
      for (let i = list.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        [list[i], list[j]] = [list[j]!, list[i]!];
      }
      return list;
    },
  };
}

const BOYS = [
  "Алӣ", "Аҳмад", "Бахтиёр", "Бехрӯз", "Далер", "Дилшод", "Фаррух", "Фирдавс", "Ҳусейн", "Иброҳим", "Илҳом", "Исмоил",
  "Ҷамшед", "Ҷаҳонгир", "Карим", "Комрон", "Мансур", "Меҳрубон", "Муҳаммад", "Наврӯз", "Нозим", "Парвиз", "Рустам",
  "Сафар", "Сино", "Сомон", "Сухроб", "Темур", "Умед", "Фируз", "Хуршед", "Шаҳром", "Шоҳин", "Юсуф", "Зафар", "Азиз",
];
const GIRLS = [
  "Мадина", "Нилуфар", "Зарина", "Сабина", "Шаҳло", "Гулнора", "Дилноза", "Манижа", "Малика", "Муниса", "Нигина",
  "Парвина", "Робия", "Сарвиноз", "Севара", "Таҳмина", "Фарзона", "Фотима", "Ҳилола", "Ширин", "Зебо", "Мунира",
  "Дилафрӯз", "Гулрухсор", "Фируза", "Нозанин", "Маҳина", "Сурайё", "Шабнам", "Ясмина", "Лайло", "Озода",
];
const FATHERS = [
  "Абдулло", "Акрам", "Анвар", "Аскар", "Баҳодур", "Ғайрат", "Давлат", "Иброҳим", "Икром", "Камол", "Қосим", "Маҳмуд",
  "Мирзо", "Назар", "Нуриддин", "Олим", "Раҳим", "Раҳмон", "Саид", "Саидҷон", "Тоҳир", "Умар", "Фарҳод", "Ҳасан",
  "Шариф", "Шавкат", "Юнус", "Ёқуб", "Зокир", "Мурод",
];
// Surnames by their stem: the son is Каримов, the daughter Каримова; a
// «-зода» surname is the same for both.
const STEMS = [
  "Карим", "Раҳим", "Назар", "Саид", "Олим", "Шариф", "Ҳасан", "Юсуф", "Мирзо", "Раҷаб", "Тоир", "Ҳаким", "Қодир",
  "Бобо", "Давлат", "Ғаффор", "Ҷалол", "Латиф", "Маҳмуд", "Нурулло", "Собир", "Умар", "Холмуҳаммад", "Шоҳ", "Икром",
  "Азиз", "Исмоил", "Мансур", "Наҷмиддин", "Файзулло",
];
const ZODA = ["Раҳмонзода", "Ҳусейнзода", "Шарифзода", "Назарзода", "Каримзода", "Саидзода", "Юсуфзода", "Олимзода"];
const WORK_FATHER = [
  "Беморхонаи шаҳрӣ, табиб", "Ширкати «Тоҷиктелеком», муҳандис", "Бонки «Амонатбонк», хазинадор", "Сохтмон, усто",
  "Бозори марказӣ, соҳибкор", "Мактаби №3, омӯзгор", "Ронанда", "Муҳоҷири меҳнатӣ, Русия", "Ҳукумати шаҳр, мутахассис",
  "Фермер", "Корхонаи пахта, коргар", "Дорухона, фармасевт", "Агентии андоз, нозир", "Почта, коргар",
];
const WORK_MOTHER = [
  "Хонашин", "Мактаби №7, омӯзгор", "Беморхонаи шаҳрӣ, ҳамшираи тиббӣ", "Кӯдакистони №2, тарбиятгар", "Дӯзанда",
  "Бозори марказӣ, фурӯшанда", "Бонки «Эсхата», кассир", "Дорухона, фармасевт", "Хонашин", "Хонашин",
];

function patronymic(father: string, male: boolean): string {
  // Бахтиёр → Бахтиёрович / Бахтиёровна; Абдулло → Абдуллоевич / Абдуллоевна.
  const vowel = /[аеёиоуэюяӣӯ]$/i.test(father);
  return father + (vowel ? (male ? "евич" : "евна") : male ? "ович" : "овна");
}

const surname = (stem: string, male: boolean) => (stem.endsWith("зода") ? stem : `${stem}${male ? "ов" : "ова"}`);

// ---------------------------------------------------------------- the school

export const SUBJECTS = [
  "Забони тоҷикӣ", "Адабиёти тоҷик", "Хониш", "Забони русӣ", "Забони англисӣ", "Математика", "Алгебра", "Геометрия",
  "Физика", "Химия", "Биология", "География", "Таърихи халқи тоҷик", "Таърихи умумӣ", "Информатика", "Ҳуқуқ",
  "Табиатшиносӣ", "Тарбияи ҷисмонӣ", "Мусиқӣ", "Санъати тасвирӣ",
] as const;
type Subject = (typeof SUBJECTS)[number];

/** Lessons a week, by form (5 periods × 6 days = 30 at most). */
function curriculum(grade: number): Array<[Subject, number]> {
  if (grade <= 4) {
    return [
      ["Хониш", 5], ["Забони тоҷикӣ", 5], ["Математика", 5], ["Табиатшиносӣ", 2], ["Санъати тасвирӣ", 1], ["Мусиқӣ", 1],
      ["Тарбияи ҷисмонӣ", 2], ...(grade >= 2 ? ([["Забони русӣ", 2], ["Забони англисӣ", 2]] as Array<[Subject, number]>) : []),
    ];
  }
  if (grade <= 6) {
    return [
      ["Забони тоҷикӣ", 3], ["Адабиёти тоҷик", 2], ["Забони русӣ", 2], ["Забони англисӣ", 2], ["Математика", 5],
      ["Таърихи халқи тоҷик", 2], [grade === 5 ? "Табиатшиносӣ" : "Биология", 2], ...(grade === 6 ? ([["География", 2]] as Array<[Subject, number]>) : []),
      ["Информатика", 1], ["Тарбияи ҷисмонӣ", 2], ["Мусиқӣ", 1], ["Санъати тасвирӣ", 1],
    ];
  }
  return [
    ["Забони тоҷикӣ", 2], ["Адабиёти тоҷик", 2], ["Забони русӣ", 2], ["Забони англисӣ", 2], ["Алгебра", 3], ["Геометрия", 2],
    ["Физика", 2], ...(grade >= 8 ? ([["Химия", 2]] as Array<[Subject, number]>) : []), ["Биология", grade >= 10 ? 1 : 2], ["География", grade >= 10 ? 1 : 2],
    ["Таърихи халқи тоҷик", 2], ["Таърихи умумӣ", 1], ["Информатика", 1], ...(grade >= 8 ? ([["Ҳуқуқ", 1]] as Array<[Subject, number]>) : []),
    ["Тарбияи ҷисмонӣ", 2],
  ];
}

export const CLASSES: Array<{ name: string; grade: number; shift: 1 | 2 }> = [
  ...[1, 2, 3, 4].flatMap((g) => ["А", "Б"].map((l) => ({ name: `${g}${l}`, grade: g, shift: 2 as const }))),
  ...[5, 6].flatMap((g) => ["А", "Б"].map((l) => ({ name: `${g}${l}`, grade: g, shift: 2 as const }))),
  ...[7, 8, 9].flatMap((g) => ["А", "Б"].map((l) => ({ name: `${g}${l}`, grade: g, shift: 1 as const }))),
  { name: "10А", grade: 10, shift: 1 },
  { name: "11А", grade: 11, shift: 1 },
];

interface Teacher {
  number: string;
  last: string;
  first: string;
  middle: string;
  male: boolean;
  subjects: Subject[];
  homeroom: string | null;
  position: string;
  /** A primary teacher teaches their own class only. */
  ownClassOnly: boolean;
}

export interface DemoSchool {
  subjects: Row[];
  staff: Row[];
  students: Row[];
  timetable: Row[];
  /** Lessons the timetable could not place (should be none). */
  dropped: number;
}

export function buildDemoSchool(seed = 20260901, domain = "demo-mtmu7.test"): DemoSchool {
  const r = random(seed);
  const usedPhones = new Set<string>();
  const phone = () => {
    for (;;) {
      const operator = r.pick(["90", "91", "92", "93", "98", "50", "55", "88"]);
      const number = `+992 ${operator} ${r.int(100, 999)} ${String(r.int(0, 99)).padStart(2, "0")} ${String(r.int(0, 99)).padStart(2, "0")}`;
      const key = number.replace(/\D/g, "").slice(-9);
      if (!usedPhones.has(key)) {
        usedPhones.add(key);
        return number;
      }
    }
  };
  const latin = (text: string) =>
    text
      .toLowerCase()
      .replace(/[ӣи]/g, "i").replace(/[ӯу]/g, "u").replace(/ҷ/g, "j").replace(/ҳ/g, "h").replace(/қ/g, "q").replace(/ғ/g, "g")
      .replace(/ш/g, "sh").replace(/ч/g, "ch").replace(/ж/g, "zh").replace(/х/g, "kh").replace(/ё/g, "yo").replace(/ю/g, "yu").replace(/я/g, "ya")
      .replace(/а/g, "a").replace(/б/g, "b").replace(/в/g, "v").replace(/г/g, "g").replace(/д/g, "d").replace(/е/g, "e").replace(/з/g, "z")
      .replace(/й/g, "y").replace(/к/g, "k").replace(/л/g, "l").replace(/м/g, "m").replace(/н/g, "n").replace(/о/g, "o").replace(/п/g, "p")
      .replace(/р/g, "r").replace(/с/g, "s").replace(/т/g, "t").replace(/ф/g, "f").replace(/ц/g, "ts").replace(/ы/g, "y").replace(/э/g, "e")
      .replace(/[ъь']/g, "").replace(/[^a-z]/g, "");

  // ------------------------------------------------------------- teachers
  const person = (male: boolean) => {
    const stem = r.next() < 0.15 ? r.pick(ZODA) : r.pick(STEMS);
    return { last: surname(stem, male), first: r.pick(male ? BOYS : GIRLS), middle: patronymic(r.pick(FATHERS), male), male };
  };
  const teachers: Teacher[] = [];
  const primary = CLASSES.filter((c) => c.grade <= 4);
  primary.forEach((klass, index) => {
    const p = person(index % 4 === 0);
    teachers.push({
      ...p,
      number: String(index + 1),
      subjects: ["Хониш", "Забони тоҷикӣ", "Математика", "Табиатшиносӣ", "Санъати тасвирӣ", "Мусиқӣ"],
      homeroom: klass.name,
      position: "омӯзгор",
      ownClassOnly: true,
    });
  });
  const SUBJECT_TEACHERS: Subject[][] = [
    ["Забони тоҷикӣ", "Адабиёти тоҷик"],
    ["Забони тоҷикӣ", "Адабиёти тоҷик"],
    ["Забони русӣ"],
    ["Забони англисӣ"],
    ["Забони англисӣ"],
    ["Математика", "Алгебра", "Геометрия"],
    ["Математика", "Алгебра", "Геометрия"],
    ["Физика", "Информатика"],
    ["Химия", "Биология", "Табиатшиносӣ"],
    ["География", "Биология"],
    ["Таърихи халқи тоҷик", "Таърихи умумӣ", "Ҳуқуқ", "Мусиқӣ", "Санъати тасвирӣ"],
    ["Тарбияи ҷисмонӣ"],
  ];
  const upper = CLASSES.filter((c) => c.grade >= 5);
  SUBJECT_TEACHERS.forEach((subjects, index) => {
    const p = person(index % 3 !== 1);
    teachers.push({
      ...p,
      number: String(11 + index),
      subjects,
      homeroom: upper[index]?.name ?? null,
      position: "омӯзгор",
      ownClassOnly: false,
    });
  });

  // ------------------------------------------------------------ timetable
  // Who teaches each class its subjects: the class's own primary teacher for
  // what they can teach, otherwise the qualified subject teacher with the
  // lightest load in that shift.
  const load = new Map<string, number>(); // `${number}|${shift}` → lessons
  type Lesson = { klass: string; shift: 1 | 2; subject: Subject; teacher: string };
  const lessons: Lesson[] = [];
  for (const klass of CLASSES) {
    for (const [subject, hours] of curriculum(klass.grade)) {
      const own = teachers.find((t) => t.ownClassOnly && t.homeroom === klass.name && t.subjects.includes(subject));
      let teacher = own;
      if (!teacher) {
        const candidates = teachers.filter((t) => !t.ownClassOnly && t.subjects.includes(subject));
        candidates.sort((a, b) => (load.get(`${a.number}|${klass.shift}`) ?? 0) - (load.get(`${b.number}|${klass.shift}`) ?? 0));
        teacher = candidates[0];
      }
      if (!teacher) continue;
      load.set(`${teacher.number}|${klass.shift}`, (load.get(`${teacher.number}|${klass.shift}`) ?? 0) + hours);
      for (let h = 0; h < hours; h += 1) lessons.push({ klass: klass.name, shift: klass.shift, subject, teacher: teacher.number });
    }
  }

  // Places every lesson in a free (day, period) of its class where its
  // teacher is free too, the busiest teachers first; tries a few orders and
  // keeps the one that leaves the fewest lessons out.
  const DAYS = ["Душанбе", "Сешанбе", "Чоршанбе", "Панҷшанбе", "Ҷумъа", "Шанбе"];
  const busiest = (list: Lesson[]) => {
    const perTeacher = new Map<string, number>();
    for (const l of list) perTeacher.set(`${l.teacher}|${l.shift}`, (perTeacher.get(`${l.teacher}|${l.shift}`) ?? 0) + 1);
    return [...list].sort((a, b) => (perTeacher.get(`${b.teacher}|${b.shift}`) ?? 0) - (perTeacher.get(`${a.teacher}|${a.shift}`) ?? 0));
  };
  let best: { grid: Map<string, Lesson>; dropped: number } | null = null;
  for (let attempt = 0; attempt < 40 && (!best || best.dropped > 0); attempt += 1) {
    const grid = new Map<string, Lesson>(); // `${class}|${day}|${period}`
    const teacherBusy = new Set<string>(); // `${teacher}|${shift}|${day}|${period}`
    const sameDay = new Map<string, number>(); // `${class}|${subject}|${day}` → count
    let dropped = 0;
    const order = attempt === 0 ? busiest(lessons) : r.shuffle(busiest(lessons));
    for (const lesson of order) {
      const slots: Array<[number, number]> = [];
      for (let d = 0; d < 6; d += 1) for (let p = 1; p <= 5; p += 1) slots.push([d, p]);
      r.shuffle(slots);
      // A subject spread over the week: a second lesson of it the same day only if nothing else fits.
      slots.sort((a, b) => (sameDay.get(`${lesson.klass}|${lesson.subject}|${a[0]}`) ?? 0) - (sameDay.get(`${lesson.klass}|${lesson.subject}|${b[0]}`) ?? 0));
      const slot = slots.find(([d, p]) => !grid.has(`${lesson.klass}|${d}|${p}`) && !teacherBusy.has(`${lesson.teacher}|${lesson.shift}|${d}|${p}`));
      if (!slot) {
        dropped += 1;
        continue;
      }
      const [d, p] = slot;
      grid.set(`${lesson.klass}|${d}|${p}`, lesson);
      teacherBusy.add(`${lesson.teacher}|${lesson.shift}|${d}|${p}`);
      sameDay.set(`${lesson.klass}|${lesson.subject}|${d}`, (sameDay.get(`${lesson.klass}|${lesson.subject}|${d}`) ?? 0) + 1);
    }
    if (!best || dropped < best.dropped) best = { grid, dropped };
  }
  const timetable: Row[] = CLASSES.flatMap((klass) =>
    DAYS.map((day, d) => {
      const row: Row = { class_name: klass.name, day, shift: String(klass.shift) };
      for (let p = 1; p <= 5; p += 1) {
        const lesson = best!.grid.get(`${klass.name}|${d}|${p}`);
        row[`p${p}`] = lesson ? `${lesson.subject} (${lesson.teacher})` : "";
      }
      return row;
    })
  );

  // ---------------------------------------------------------------- staff
  const staff: Row[] = teachers.map((t) => ({
    employee_number: t.number,
    last_name: t.last,
    first_name: t.first,
    middle_name: t.middle,
    subjects: t.subjects.join("; "),
    homeroom_class: t.homeroom ?? "",
    position: t.position,
    email: `${latin(t.first)}.${latin(t.last)}.${t.number}@${domain}`,
    phone: phone(),
  }));
  const administration = [
    { number: "30", position: "директор", male: true },
    { number: "31", position: "муовини директор", male: false },
    { number: "32", position: "китобдор", male: false },
  ];
  for (const a of administration) {
    const p = person(a.male);
    staff.push({
      employee_number: a.number,
      last_name: p.last,
      first_name: p.first,
      middle_name: p.middle,
      subjects: "",
      homeroom_class: "",
      position: a.position,
      email: `${latin(p.first)}.${latin(p.last)}.${a.number}@${domain}`,
      phone: phone(),
    });
  }

  // --------------------------------------------------------------- pupils
  type Family = { stem: string; father: Row; mother: Row };
  const families: Family[] = [];
  const newFamily = (): Family => {
    const stem = r.next() < 0.12 ? r.pick(ZODA) : r.pick(STEMS);
    const fatherFirst = r.pick(FATHERS);
    const motherFirst = r.pick(GIRLS);
    return {
      stem,
      father: {
        name: `${surname(stem, true)} ${fatherFirst} ${patronymic(r.pick(FATHERS), true)}`,
        first: fatherFirst,
        workplace: r.pick(WORK_FATHER),
        phone: phone(),
        email: r.next() < 0.3 ? `${latin(fatherFirst)}.${latin(stem)}${r.int(10, 99)}@${domain}` : "",
      },
      mother: {
        name: `${surname(stem, false)} ${motherFirst} ${patronymic(r.pick(FATHERS), false)}`,
        workplace: r.pick(WORK_MOTHER),
        phone: phone(),
        email: r.next() < 0.2 ? `${latin(motherFirst)}.${latin(stem)}${r.int(10, 99)}@${domain}` : "",
      },
    };
  };

  const students: Row[] = [];
  let n = 0;
  for (const klass of CLASSES) {
    const size = r.int(25, 30);
    const year = 2026 - 6 - klass.grade + 1;
    const seen = new Set<string>();
    for (let i = 0; i < size; i += 1) {
      // About one pupil in eight has a brother or sister already written.
      const family = families.length > 20 && r.next() < 0.12 ? r.pick(families) : newFamily();
      if (!families.includes(family)) families.push(family);
      const male = r.next() < 0.5;
      let first = r.pick(male ? BOYS : GIRLS);
      const last = surname(family.stem, male);
      while (seen.has(`${last}|${first}`)) first = r.pick(male ? BOYS : GIRLS);
      seen.add(`${last}|${first}`);
      n += 1;
      const birth = `${year}-${String(r.int(1, 12)).padStart(2, "0")}-${String(r.int(1, 28)).padStart(2, "0")}`;
      students.push({
        class_name: klass.name,
        last_name: last,
        first_name: first,
        middle_name: patronymic(family.father.first!, male),
        date_of_birth: birth,
        gender: male ? "писар" : "духтар",
        email: klass.grade <= 5 ? "" : `${latin(first)}.${latin(last)}.${n}@${domain}`,
        phone: klass.grade >= 8 && r.next() < 0.4 ? phone() : "",
        father_name: family.father.name!,
        father_workplace: family.father.workplace!,
        father_phone: family.father.phone!,
        father_email: family.father.email!,
        mother_name: family.mother.name!,
        mother_workplace: family.mother.workplace!,
        mother_phone: family.mother.phone!,
        mother_email: family.mother.email!,
      });
    }
  }

  const subjects: Row[] = SUBJECTS.map((name_tg) => ({ name_tg }));
  return { subjects, staff, students, timetable, dropped: best!.dropped };
}

// ---------------------------------------------------------------- writing

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { buildWorkbook } = await import("../../src/lib/export/xlsx.ts");
  const { PEOPLE_TEMPLATES, SUBJECTS_TEMPLATE, TIMETABLE_TEMPLATE, writtenColumns } = await import("../../src/features/admin/import/templates.ts");
  const out = resolve(process.argv[2] ?? "demo-school");
  mkdirSync(out, { recursive: true });
  const school = buildDemoSchool();
  const files = [
    { spec: SUBJECTS_TEMPLATE, rows: school.subjects, file: "1-fanho.xlsx" },
    { spec: PEOPLE_TEMPLATES.staff, rows: school.staff, file: "2-omuzgoron.xlsx" },
    { spec: PEOPLE_TEMPLATES.students, rows: school.students, file: "3-khonandagon.xlsx" },
    { spec: TIMETABLE_TEMPLATE, rows: school.timetable, file: "4-jadval.xlsx" },
  ];
  for (const { spec, rows, file } of files) {
    const columns = writtenColumns(spec);
    const buffer = await buildWorkbook(
      [{ name: "Дастур", title: spec.title, lines: spec.instructions }],
      [
        {
          name: spec.sheet,
          columns: columns.map((column) => ({ header: column.required ? `${column.header}*` : column.header, width: column.width, issued: column.issued })),
          rows: rows.map((row) => columns.map((column) => (column.issued ? null : row[column.key] ?? null))),
        },
      ]
    );
    writeFileSync(join(out, file), buffer);
    console.log(`${join(out, file)}  ${rows.length} rows`);
  }
  console.log(`classes ${CLASSES.length}, pupils ${school.students.length}, lessons left out of the timetable: ${school.dropped}`);
}
