
export interface InlineButton {
  text: string;
  /** Exactly one of these two. A URL button opens the channel; data comes back. */
  callback_data?: string;
  url?: string;
  /**
   * The button's colour (Bot API 9.4): blue for the way forward, green for
   * what confirms or adds, red for what cannot be undone. Older clients ignore
   * it and draw their usual button.
   */
  style?: "primary" | "success" | "danger";
}

export type InlineKeyboard = InlineButton[][];

/** Telegram's HTML mode accepts a handful of tags; everything else must be escaped. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Everything the bot says.
 *
 * The portal's own translations live in src/messages and are loaded by
 * next-intl inside a request. The bot has no request and no locale context — it
 * answers a chat whose language is a column in the database — so its words live
 * here, in one file, where a teacher can read all three languages side by side
 * and see that they say the same thing.
 *
 * Telegram's HTML mode allows <b> <i> <u> <s> <code> <pre> <a>. Anything that
 * came from a person — a name, a subject, a room — goes through escapeHtml
 * first, because a child called "A<B" must not silently break every message
 * their parent receives.
 */

export type Loc = "tg" | "ru" | "en";

export const LOCALES: Loc[] = ["tg", "ru", "en"];

export function asLocale(value: string | null | undefined): Loc {
  return value === "ru" || value === "en" ? value : "tg";
}

export interface Named {
  tg?: string | null;
  ru?: string | null;
  en?: string | null;
}

/** A name the school stores in three languages, shown in the one asked for. */
export function pick(name: Named | null | undefined, locale: Loc): string {
  return escapeHtml(pickRaw(name, locale));
}

/** The same, unescaped: for a table, which escapes its whole body at once. */
export function pickRaw(name: Named | null | undefined, locale: Loc): string {
  if (!name) return "";
  return name[locale] || name.tg || name.ru || name.en || "";
}

const RULE = "━━━━━━━━━━━━━━";

const WORDS = {
  tg: {
    greeting: "Салом!",
    intro: "Ман боти волидайн ҳастам. Дар бораи баҳоҳо ва давомоти фарзандатон ба шумо хабар медиҳам.",
    subscribeTitle: "Обуна лозим аст",
    subscribeBody: "Пеш аз оғоз ба канали расмии мактабҳои Истаравшан обуна шавед:",
    subscribeAfter: "Баъди обуна тугмаи «Санҷидан»-ро пахш кунед.",
    subscribeButton: "Обуна шудан",
    checkButton: "Санҷидан",
    subscribeMissing: "Ҳанӯз обуна нашудаед. Обуна шавед ва боз санҷед.",
    subscribeOk: "Обуна тасдиқ шуд. Ташаккур!",
    askChild: "Акнун фарзандатонро илова кунед.",
    askChildHow: "Никнейм ё логини фарзандатонро нависед — масалан",
    askCode: "Ҳоло <b>рамзи волидайн</b>-ро нависед.",
    askCodeHow: "Онро мактаб дар варақа додааст (8 ҳарф).",
    notFound: "Чунин хонанда ёфт нашуд. Имлоро санҷед ё логини мактабиро нависед.",
    ambiguous: "Чанд хонанда бо ҳамин ном ҳаст. Лутфан логини мактабиро нависед (масалан MT10009).",
    noCode: "Барои ин хонанда ҳанӯз рамзи волидайн сохта нашудааст. Ба мактаб муроҷиат кунед.",
    wrongCode: "Рамз нодуруст аст. Бори дигар кӯшиш кунед.",
    blocked: "Хеле зиёд кӯшиш кардед. Пас аз 15 дақиқа боз кӯшиш кунед.",
    linked: "Тайёр!",
    linkedBody: "Акнун ҳар бор ки муаллим баҳо мегузорад, ман ба шумо хабар медиҳам.",
    menuTitle: "Чиро нишон диҳам?",
    noChildren: "Ҳанӯз фарзанде илова накардаед.",
    today: "Имрӯз",
    week: "Ҳафта",
    schedule: "Ҷадвал",
    addChild: "Фарзанди дигар",
    language: "Забон",
    back: "Бозгашт",
    grades: "Баҳоҳо",
    attendance: "Давомот",
    timetable: "Ҷадвали дарсӣ",
    newGrade: "Баҳои нав",
    changedGrade: "Баҳо иваз шуд",
    dayReport: "Ҳисоботи рӯз",
    lesson: "дарси",
    nothingToday: "Имрӯз баҳо ва қайд нест.",
    nothingWeek: "Дар ин ҳафта баҳо ва қайд нест.",
    noTimetable: "Барои ин рӯз ҷадвал нест.",
    average: "Миёна",
    room: "синфхона",
    absent: "ғоиб",
    late: "дер монд",
    excused: "бо сабаби узрнок",
    final: "чорякӣ",
    chooseLanguage: "Забонро интихоб кунед",
    languageSet: "Забон иваз шуд.",
    help: "Фармонҳо: /start — оғоз, /menu — меню, /add — иловаи фарзанд, /lang — забон",
    unknown: "Фармон нашинохтам. /menu-ро пахш кунед.",
    morning: "Субҳ ба хайр",
    day: "Рӯз ба хайр",
    evening: "Шом ба хайр",
    night: "Шаб ба хайр",
    welcomeTitle: "Хуш омадед ба боти волидайн!",
    whatYouGet: "Ин бот ба шумо мефиристад:",
    getGrades: "📝 баҳои нав — 12 дақиқа баъди гузоштан",
    getAbsence: "🚩 ғоиб ё дер омадан — бо номи фан ва соати дарс",
    getDigest: "🌆 ҳисоботи рӯз — ҳар бегоҳ соати 18:00",
    getMenu: "📅 ҷадвал ва ҳисоботи ҳафта — ҳар вақт аз меню",
    nextStep: "Қадами оянда:",
    chooseLanguageFirst: "Забонро интихоб кунед",
    colSubject: "Фан",
    colMark: "Баҳо",
    colDate: "Сана",
    colStatus: "Ҳолат",
    colRoom: "Ҳуҷра",
    absentShort: "ғоиб",
    lateShort: "дер",
    excusedShort: "узрнок",
  },
  ru: {
    greeting: "Здравствуйте!",
    intro: "Я бот для родителей. Я сообщаю вам об оценках и посещаемости вашего ребёнка.",
    subscribeTitle: "Нужна подписка",
    subscribeBody: "Перед началом подпишитесь на официальный канал школ Истаравшана:",
    subscribeAfter: "После подписки нажмите «Проверить».",
    subscribeButton: "Подписаться",
    checkButton: "Проверить",
    subscribeMissing: "Подписка пока не найдена. Подпишитесь и проверьте ещё раз.",
    subscribeOk: "Подписка подтверждена. Спасибо!",
    askChild: "Теперь добавьте ребёнка.",
    askChildHow: "Напишите никнейм или школьный логин ребёнка — например",
    askCode: "Теперь напишите <b>родительский код</b>.",
    askCodeHow: "Школа выдала его на листке (8 символов).",
    notFound: "Такой ученик не найден. Проверьте написание или укажите школьный логин.",
    ambiguous: "Под этим именем несколько учеников. Укажите школьный логин (например MT10009).",
    noCode: "Для этого ученика код ещё не выпущен. Обратитесь в школу.",
    wrongCode: "Код неверный. Попробуйте ещё раз.",
    blocked: "Слишком много попыток. Повторите через 15 минут.",
    linked: "Готово!",
    linkedBody: "Теперь каждый раз, когда учитель ставит оценку, я вам сообщу.",
    menuTitle: "Что показать?",
    noChildren: "Вы ещё не добавили ребёнка.",
    today: "Сегодня",
    week: "Неделя",
    schedule: "Расписание",
    addChild: "Ещё ребёнок",
    language: "Язык",
    back: "Назад",
    grades: "Оценки",
    attendance: "Посещаемость",
    timetable: "Расписание уроков",
    newGrade: "Новая оценка",
    changedGrade: "Оценка изменена",
    dayReport: "Итоги дня",
    lesson: "урок",
    nothingToday: "Сегодня оценок и отметок нет.",
    nothingWeek: "За эту неделю оценок и отметок нет.",
    noTimetable: "На этот день расписания нет.",
    average: "Средний балл",
    room: "кабинет",
    absent: "отсутствовал",
    late: "опоздал",
    excused: "по уважительной причине",
    final: "четвертная",
    chooseLanguage: "Выберите язык",
    languageSet: "Язык изменён.",
    help: "Команды: /start — начать, /menu — меню, /add — добавить ребёнка, /lang — язык",
    unknown: "Не понял команду. Нажмите /menu.",
    morning: "Доброе утро",
    day: "Добрый день",
    evening: "Добрый вечер",
    night: "Доброй ночи",
    welcomeTitle: "Добро пожаловать в бот для родителей!",
    whatYouGet: "Этот бот будет присылать вам:",
    getGrades: "📝 новую оценку — через 12 минут после выставления",
    getAbsence: "🚩 пропуск или опоздание — с предметом и номером урока",
    getDigest: "🌆 итоги дня — каждый вечер в 18:00",
    getMenu: "📅 расписание и итоги недели — в любой момент из меню",
    nextStep: "Следующий шаг:",
    chooseLanguageFirst: "Выберите язык",
    colSubject: "Предмет",
    colMark: "Оценка",
    colDate: "Дата",
    colStatus: "Статус",
    colRoom: "Каб.",
    absentShort: "нет",
    lateShort: "опозд.",
    excusedShort: "уваж.",
  },
  en: {
    greeting: "Hello!",
    intro: "I am the parents' bot. I tell you about your child's marks and attendance.",
    subscribeTitle: "Subscription required",
    subscribeBody: "Before we start, please follow the official channel of Istaravshan schools:",
    subscribeAfter: "Once you have followed it, tap “Check”.",
    subscribeButton: "Subscribe",
    checkButton: "Check",
    subscribeMissing: "No subscription found yet. Follow the channel and check again.",
    subscribeOk: "Subscription confirmed. Thank you!",
    askChild: "Now add your child.",
    askChildHow: "Send your child's nickname or school login — for example",
    askCode: "Now send the <b>parent code</b>.",
    askCodeHow: "The school handed it to you on paper (8 characters).",
    notFound: "No such pupil. Check the spelling, or use the school login instead.",
    ambiguous: "Several pupils answer to that name. Please use the school login (e.g. MT10009).",
    noCode: "No parent code has been issued for this pupil yet. Please ask the school.",
    wrongCode: "That code is not right. Try again.",
    blocked: "Too many attempts. Try again in 15 minutes.",
    linked: "All set!",
    linkedBody: "From now on I will tell you whenever a teacher enters a mark.",
    menuTitle: "What would you like to see?",
    noChildren: "You have not added a child yet.",
    today: "Today",
    week: "Week",
    schedule: "Timetable",
    addChild: "Another child",
    language: "Language",
    back: "Back",
    grades: "Marks",
    attendance: "Attendance",
    timetable: "Timetable",
    newGrade: "New mark",
    changedGrade: "Mark changed",
    dayReport: "The day",
    lesson: "period",
    nothingToday: "No marks or notes today.",
    nothingWeek: "No marks or notes this week.",
    noTimetable: "No lessons listed for that day.",
    average: "Average",
    room: "room",
    absent: "absent",
    late: "late",
    excused: "excused",
    final: "term mark",
    chooseLanguage: "Choose a language",
    languageSet: "Language changed.",
    help: "Commands: /start — begin, /menu — menu, /add — add a child, /lang — language",
    unknown: "I did not understand that. Tap /menu.",
    morning: "Good morning",
    day: "Good afternoon",
    evening: "Good evening",
    night: "Good night",
    welcomeTitle: "Welcome to the parents' bot!",
    whatYouGet: "This bot will send you:",
    getGrades: "📝 every new mark — 12 minutes after it is entered",
    getAbsence: "🚩 an absence or a late arrival — with the subject and period",
    getDigest: "🌆 the day's summary — every evening at 18:00",
    getMenu: "📅 the timetable and the week — any time from the menu",
    nextStep: "Next step:",
    chooseLanguageFirst: "Choose a language",
    colSubject: "Subject",
    colMark: "Mark",
    colDate: "Date",
    colStatus: "Status",
    colRoom: "Room",
    absentShort: "absent",
    lateShort: "late",
    excusedShort: "excused",
  },
} as const;

export const words = (locale: Loc) => WORDS[locale];

/** dd.MM.yyyy — the form on every Tajik school form. */
export function day(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}.${m}.${y}` : iso;
}

/** A mark reads faster as a colour than as a number out of five. */
export function markDot(score: number, max: number): string {
  // Out of five: 5 is green, 4 blue, 3 yellow, and 2 is the mark a parent needs
  // to see at a glance, so it is red. Written as a share, the same reading
  // holds for a subject marked out of a hundred.
  const share = max > 0 ? score / max : 0;
  if (share >= 0.9) return "🟢";
  if (share >= 0.7) return "🔵";
  if (share >= 0.55) return "🟡";
  return "🔴";
}

export function statusDot(status: string): string {
  return status === "late" ? "🟡" : status === "excused" ? "🔵" : "🔴";
}

export function statusWord(status: string, locale: Loc): string {
  const w = words(locale);
  return status === "late" ? w.late : status === "excused" ? w.excused : w.absent;
}

export function number(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

/** A mark as it is written on a school form: "5", or "18/20" when not out of five. */
export function markText(score: number, max: number): string {
  return max === 5 ? number(score) : `${number(score)}/${number(max)}`;
}

function shortStatus(status: string, locale: Loc): string {
  const w = words(locale);
  return status === "late" ? w.lateShort : status === "excused" ? w.excusedShort : w.absentShort;
}

/** dd.MM — enough inside a week, and short enough for a phone-wide table. */
export function dayMonth(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return d && m ? `${d}.${m}` : iso;
}

type Align = "left" | "right" | "center";

/** Counted by characters, not UTF-16 units, so a letter is one column. */
function columns(value: string): number {
  return Array.from(value).length;
}

function cell(value: string, width: number, align: Align): string {
  const chars = Array.from(value.replace(/\s+/g, " ").trim());
  const text = chars.length > width ? `${chars.slice(0, width - 1).join("")}…` : chars.join("");
  const room = width - columns(text);
  if (align === "right") return " ".repeat(room) + text;
  if (align === "center") return " ".repeat(Math.floor(room / 2)) + text + " ".repeat(Math.ceil(room / 2));
  return text + " ".repeat(room);
}

/**
 * A table Telegram draws in its monospace font, framed with box-drawing lines.
 *
 * At most about 32 columns fit a phone's chat bubble before lines wrap, so
 * the widest column is given what the others leave and long names end in an
 * ellipsis. No emoji inside: they are two columns wide in some fonts and one
 * in others, and a single one would pull a whole column out of line.
 */
export function table(
  head: string[],
  rows: string[][],
  spec: Array<{ align: Align; max?: number }>,
  total = 32
): string {
  const natural = spec.map((column, index) =>
    Math.min(column.max ?? 99, Math.max(columns(head[index] ?? ""), ...rows.map((row) => columns(row[index] ?? ""))))
  );
  // Borders and a space either side of every cell.
  const frame = 1 + spec.length * 3;
  const widest = natural.indexOf(Math.max(...natural));
  const others = natural.reduce((sum, width, index) => (index === widest ? sum : sum + width), 0);
  const widths = natural.map((width, index) => (index === widest ? Math.max(4, Math.min(width, total - frame - others)) : width));
  const line = (left: string, middle: string, right: string) => left + widths.map((w) => "─".repeat(w + 2)).join(middle) + right;
  const row = (values: string[], header = false) =>
    "│" + values.map((value, index) => ` ${cell(value, widths[index]!, header ? "left" : spec[index]!.align)} `).join("│") + "│";
  const body = [line("╭", "┬", "╮"), row(head, true), line("├", "┼", "┤"), ...rows.map((values) => row(values)), line("╰", "┴", "╯")];
  return `<pre>${escapeHtml(body.join("\n"))}</pre>`;
}

export interface Child {
  name: string;
  class?: string | null;
}

function childLine(child: Child): string {
  const cls = child.class ? ` · ${escapeHtml(child.class)}` : "";
  return `👦 <b>${escapeHtml(child.name)}</b>${cls}`;
}

function footer(school?: { name?: string | null } | null): string {
  return school?.name ? `\n${RULE}\n<i>${escapeHtml(school.name)}</i>` : "";
}

// ------------------------------------------------------------------ the gate

export function welcome(locale: Loc, channel: string, schoolName?: string | null): {
  text: string;
  keyboard: InlineKeyboard;
} {
  const w = words(locale);
  const handle = channel.replace(/^@/, "");
  const text = [
    `🏫 <b>${escapeHtml(schoolName || "Истаравшан")}</b>`,
    "",
    `${w.greeting} ${w.intro}`,
    "",
    RULE,
    `📢 <b>${w.subscribeTitle}</b>`,
    w.subscribeBody,
    `👉 @${escapeHtml(handle)}`,
    "",
    w.subscribeAfter,
  ].join("\n");
  return {
    text,
    keyboard: [
      [{ text: `📢 ${w.subscribeButton}`, url: `https://t.me/${handle}`, style: "primary" }],
      [{ text: `✅ ${w.checkButton}`, callback_data: "check", style: "success" }],
    ],
  };
}

export function stillNotSubscribed(locale: Loc, channel: string): { text: string; keyboard: InlineKeyboard } {
  const w = words(locale);
  const handle = channel.replace(/^@/, "");
  return {
    text: `⚠️ ${w.subscribeMissing}\n\n👉 @${escapeHtml(handle)}`,
    keyboard: [
      [{ text: `📢 ${w.subscribeButton}`, url: `https://t.me/${handle}`, style: "primary" }],
      [{ text: `✅ ${w.checkButton}`, callback_data: "check", style: "success" }],
    ],
  };
}

/**
 * The first thing /start shows: the language, before anything else is said.
 *
 * The chat does not have a language yet, so the question is asked in all
 * three at once and each button names its language in itself.
 */
export function startLanguage(): { text: string; keyboard: InlineKeyboard } {
  return {
    text: [
      "🏫 <b>Салом! · Здравствуйте! · Hello!</b>",
      "",
      `🌐 ${WORDS.tg.chooseLanguageFirst}`,
      `🌐 ${WORDS.ru.chooseLanguageFirst}`,
      `🌐 ${WORDS.en.chooseLanguageFirst}`,
    ].join("\n"),
    keyboard: [
      [{ text: "🇹🇯 Тоҷикӣ", callback_data: "sl:tg", style: "primary" }],
      [{ text: "🇷🇺 Русский", callback_data: "sl:ru", style: "primary" }],
      [{ text: "🇬🇧 English", callback_data: "sl:en", style: "primary" }],
    ],
  };
}

export type DayPart = "morning" | "day" | "evening" | "night";

/**
 * Which greeting the hour calls for, on the school's clock: субҳ until noon,
 * рӯз through the afternoon, шом from six and шаб from ten — the same hours
 * the portal greets people by.
 */
export function dayPartAt(at: Date, timeZone = "Asia/Dushanbe"): DayPart {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(at)) % 24;
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "day";
  if (hour >= 18 && hour < 22) return "evening";
  return "night";
}

const PART_ICON: Record<DayPart, string> = { morning: "🌅", day: "☀️", evening: "🌇", night: "🌙" };

/** Telegram refuses a photo caption over this many characters. */
export const CAPTION_LIMIT = 1024;

/**
 * The first greeting, under the school's photograph, once the subscription is
 * confirmed: the hour's greeting, what the bot will send and when, and the one
 * thing to do next. Short enough to be a caption — Telegram stops at 1024.
 */
export function firstGreeting(
  locale: Loc,
  options: { at?: Date; timeZone?: string; schoolName?: string | null; hasChildren?: boolean } = {}
): string {
  const w = words(locale);
  const part = dayPartAt(options.at ?? new Date(), options.timeZone);
  const next = options.hasChildren ? `👇 ${w.menuTitle}` : `👨‍👩‍👦 <b>${w.askChild}</b>\n${w.askChildHow} <code>MT10009</code>.`;
  const head = [
    `${PART_ICON[part]} <b>${w[part]}!</b> ${w.welcomeTitle}`,
    `🏫 <i>${escapeHtml((options.schoolName || "Истаравшан").slice(0, 120))}</i>`,
    "",
    `✅ ${w.subscribeOk}`,
  ];
  const offer = ["", `<b>${w.whatYouGet}</b>`, w.getGrades, w.getAbsence, w.getDigest, w.getMenu];
  const tail = ["", `<b>${w.nextStep}</b>`, next];
  const full = [...head, ...offer, ...tail].join("\n");
  // Whole lines are dropped rather than the text cut, so no tag is ever left
  // open: first the list of what the bot sends, which the menu repeats.
  return full.length <= CAPTION_LIMIT ? full : [...head, ...tail].join("\n");
}

export function askForChild(locale: Loc): string {
  const w = words(locale);
  return [`✅ ${w.subscribeOk}`, "", `👨‍👩‍👦 <b>${w.askChild}</b>`, "", `${w.askChildHow} <code>MT10009</code>.`].join("\n");
}

export function askForCode(locale: Loc): string {
  const w = words(locale);
  return [`🔐 ${w.askCode}`, w.askCodeHow].join("\n");
}

export function linked(locale: Loc, child: Child): string {
  const w = words(locale);
  return [`🎉 <b>${w.linked}</b>`, "", childLine(child), "", w.linkedBody].join("\n");
}

// ------------------------------------------------------------------ the menu

export function menu(locale: Loc, children: Array<{ id: string } & Child>): {
  text: string;
  keyboard: InlineKeyboard;
} {
  const w = words(locale);
  if (children.length === 0) {
    return {
      text: `👨‍👩‍👦 ${w.noChildren}\n\n${w.askChildHow} <code>MT10009</code>.`,
      keyboard: [[{ text: `➕ ${w.addChild}`, callback_data: "add", style: "success" }]],
    };
  }
  // One button to a row: a row's buttons share its width, and a whole row is
  // the size a thumb finds without looking.
  const keyboard: InlineKeyboard = children.map((child) => [
    { text: `👤 ${child.name}${child.class ? ` · ${child.class}` : ""}`, callback_data: `c:${child.id}`, style: "primary" },
  ]);
  keyboard.push([{ text: `➕ ${w.addChild}`, callback_data: "add", style: "success" }]);
  keyboard.push([{ text: `🌐 ${w.language}`, callback_data: "lang" }]);
  return { text: `👨‍👩‍👦 <b>${w.menuTitle}</b>`, keyboard };
}

export function childMenu(locale: Loc, child: Child, id: string): { text: string; keyboard: InlineKeyboard } {
  const w = words(locale);
  return {
    text: `${childLine(child)}\n\n${w.menuTitle}`,
    keyboard: [
      [{ text: `📊 ${w.today}`, callback_data: `r:${id}:day`, style: "primary" }],
      [{ text: `📅 ${w.week}`, callback_data: `r:${id}:week`, style: "primary" }],
      [{ text: `🕘 ${w.schedule}`, callback_data: `r:${id}:timetable`, style: "success" }],
      [{ text: `↩️ ${w.back}`, callback_data: "menu" }],
    ],
  };
}

export function languageMenu(locale: Loc): { text: string; keyboard: InlineKeyboard } {
  return {
    text: `🌐 <b>${words(locale).chooseLanguage}</b>`,
    keyboard: [
      [{ text: "🇹🇯 Тоҷикӣ", callback_data: "l:tg", style: locale === "tg" ? "success" : "primary" }],
      [{ text: "🇷🇺 Русский", callback_data: "l:ru", style: locale === "ru" ? "success" : "primary" }],
      [{ text: "🇬🇧 English", callback_data: "l:en", style: locale === "en" ? "success" : "primary" }],
      [{ text: `↩️ ${words(locale).back}`, callback_data: "menu" }],
    ],
  };
}

// --------------------------------------------------------- what gets pushed

export interface GradeNews {
  score: number;
  max: number;
  date: string;
  final?: boolean;
  subject: Named;
  work: Named;
}

export function gradeMessage(
  locale: Loc,
  child: Child,
  grade: GradeNews,
  school?: { name?: string | null } | null,
  changed = false
): string {
  const w = words(locale);
  const lines = [
    `📝 <b>${changed ? w.changedGrade : w.newGrade}</b>`,
    "",
    childLine(child),
    `📚 ${pick(grade.subject, locale)}`,
    `🗓 ${day(grade.date)} · ${pick(grade.work, locale)}${grade.final ? ` (${w.final})` : ""}`,
    "",
    `${markDot(grade.score, grade.max)} <b>${number(grade.score)}</b> / ${number(grade.max)}`,
  ];
  return lines.join("\n") + footer(school);
}

export interface AbsenceNews {
  status: string;
  date: string;
  period?: number | null;
  subject?: Named | null;
}

export function absenceMessage(
  locale: Loc,
  child: Child,
  absence: AbsenceNews,
  school?: { name?: string | null } | null
): string {
  const w = words(locale);
  const subject = pick(absence.subject, locale);
  const where = [subject, absence.period ? `${w.lesson} ${absence.period}` : null].filter(Boolean).join(" · ");
  return (
    [
      `${statusDot(absence.status)} <b>${w.attendance}</b>`,
      "",
      childLine(child),
      where ? `📚 ${where}` : null,
      `🗓 ${day(absence.date)}`,
      "",
      `❗️ <b>${statusWord(absence.status, locale)}</b>`,
    ]
      .filter((line) => line !== null)
      .join("\n") + footer(school)
  );
}

export interface Report {
  child: Child;
  from?: string;
  to?: string;
  grades: Array<{ date: string; score: number; max: number; subject: Named; work: Named; final?: boolean }>;
  attendance: Array<{ date: string; status: string; period?: number | null; subject?: Named | null }>;
  timetable?: Array<{ period: number; subject: Named; room?: string | null; teacher?: string | null }>;
}

/**
 * Telegram refuses a message over 4096 characters outright, so a week with an
 * unusual number of marks would reach the parent as nothing at all. The lists
 * are cut with a count of what was left out, and the whole thing is trimmed as
 * a last resort — at a line break, so the cut never lands inside a tag.
 */
const LIMIT = 4096;
const MOST_GRADES = 25;
const MOST_ABSENCES = 15;

function fit(text: string): string {
  if (text.length <= LIMIT) return text;
  const cut = text.lastIndexOf("\n", LIMIT - 2);
  return `${text.slice(0, cut > 0 ? cut : LIMIT - 2)}\n…`;
}

/** The end-of-day message, and the same thing when a parent asks for it. */
export function reportMessage(
  locale: Loc,
  report: Report,
  kind: "day" | "week" | "timetable",
  school?: { name?: string | null } | null
): string {
  const w = words(locale);
  const heading =
    kind === "timetable"
      ? `🕘 <b>${w.timetable}</b>`
      : kind === "week"
        ? `📅 <b>${w.week}</b> · ${day(report.from)} – ${day(report.to)}`
        : `🌆 <b>${w.dayReport}</b> · ${day(report.to)}`;

  const lines: string[] = [heading, "", childLine(report.child)];

  if (kind === "timetable") {
    const rows = report.timetable ?? [];
    lines.push("");
    if (rows.length === 0) {
      lines.push(`— ${w.noTimetable}`);
    } else {
      lines.push(
        table(
          ["№", w.colSubject, w.colRoom],
          rows.map((row) => [String(row.period), pickRaw(row.subject, locale), row.room ?? "—"]),
          [{ align: "right" }, { align: "left" }, { align: "center", max: 6 }]
        )
      );
      const teachers = rows.filter((row) => row.teacher);
      if (teachers.length > 0) {
        lines.push(teachers.map((row) => `<b>${row.period}.</b> <i>${escapeHtml(row.teacher!)}</i>`).join("\n"));
      }
    }
    return fit(lines.join("\n") + footer(school));
  }

  if (report.grades.length === 0 && report.attendance.length === 0) {
    lines.push("", `— ${kind === "week" ? w.nothingWeek : w.nothingToday}`);
    return fit(lines.join("\n") + footer(school));
  }

  if (report.grades.length > 0) {
    const shown = report.grades.slice(0, MOST_GRADES);
    lines.push("", `📝 <b>${w.grades}</b>`);
    lines.push(
      kind === "week"
        ? table(
            [w.colDate, w.colSubject, w.colMark],
            shown.map((g) => [dayMonth(g.date), pickRaw(g.subject, locale), markText(g.score, g.max)]),
            [{ align: "left" }, { align: "left" }, { align: "center", max: 6 }]
          )
        : table(
            [w.colSubject, w.colMark],
            shown.map((g) => [pickRaw(g.subject, locale), markText(g.score, g.max)]),
            [{ align: "left" }, { align: "center", max: 6 }]
          )
    );
    if (report.grades.length > MOST_GRADES) lines.push(`<i>… +${report.grades.length - MOST_GRADES}</i>`);
  }

  if (report.attendance.length > 0) {
    const shown = report.attendance.slice(0, MOST_ABSENCES);
    const where = (a: Report["attendance"][number]) =>
      [pickRaw(a.subject, locale), a.period ? `${a.period}` : null].filter(Boolean).join(" · ") || "—";
    lines.push("", `🚩 <b>${w.attendance}</b>`);
    lines.push(
      kind === "week"
        ? table(
            [w.colDate, w.colSubject, w.colStatus],
            shown.map((a) => [dayMonth(a.date), where(a), shortStatus(a.status, locale)]),
            [{ align: "left" }, { align: "left" }, { align: "left", max: 7 }]
          )
        : table(
            [w.colSubject, w.colStatus],
            shown.map((a) => [where(a), shortStatus(a.status, locale)]),
            [{ align: "left" }, { align: "left", max: 7 }]
          )
    );
    if (report.attendance.length > MOST_ABSENCES) {
      lines.push(`<i>… +${report.attendance.length - MOST_ABSENCES}</i>`);
    }
  }

  // Last, under everything it is drawn from. Sitting between the marks and the
  // absences, the rule above it looked like a section had ended when it had
  // not. A running average only says something when there is more than one
  // mark, and a term mark is a verdict rather than part of the sum.
  const counted = report.grades.filter((g) => !g.final && g.max > 0);
  if (counted.length > 1) {
    // On the five-point scale every mark is read on: 18 out of 20 counts as
    // 4.5, not as eighteen.
    const mean = counted.reduce((sum, g) => sum + (g.max === 5 ? g.score : (g.score / g.max) * 5), 0) / counted.length;
    // No rule of its own: the footer draws one directly underneath, and two in
    // a row look like a mistake.
    lines.push("", `${w.average}: <b>${mean.toFixed(1)}</b>`);
  }

  return fit(lines.join("\n") + footer(school));
}

/**
 * What goes under the report picture: which report, for whom — the picture
 * says the rest — and the school, as under every message.
 */
export function reportCaption(
  locale: Loc,
  report: Report,
  kind: "day" | "week" | "timetable",
  school?: { name?: string | null } | null
): string {
  const w = words(locale);
  const heading =
    kind === "timetable"
      ? `🕘 <b>${w.timetable}</b>`
      : kind === "week"
        ? `📅 <b>${w.week}</b> · ${day(report.from)} – ${day(report.to)}`
        : `🌆 <b>${w.dayReport}</b> · ${day(report.to)}`;
  return `${heading}\n${childLine(report.child)}${footer(school)}`;
}

export function backKeyboard(locale: Loc, childId?: string): InlineKeyboard {
  const w = words(locale);
  return [[{ text: `↩️ ${w.back}`, callback_data: childId ? `c:${childId}` : "menu", style: "primary" }]];
}
