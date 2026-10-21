import { escapeHtml, type Loc } from "../../lib/telegram/messages.ts";

/**
 * The message a parent gets in the bot with their young child's login.
 *
 * The youngest pupils' accounts are run by their parents, so the parents are
 * told everything they need to sign the child in — who, which class, the
 * login, the password and the nickname — laid out as a small table in the
 * bot's monospace, and a line on keeping it to themselves.
 *
 * Pure, so it can be tested without Telegram.
 */

export interface CredentialsEntry {
  first_name: string;
  last_name: string;
  middle_name: string | null;
  nickname: string | null;
  class_name: string | null;
  login: string;
  password: string;
}

const WORDS: Record<Loc, {
  title: string;
  name: string;
  class: string;
  login: string;
  password: string;
  nickname: string;
  site: string;
  app: string;
  keep: string;
}> = {
  tg: {
    title: "🔐 <b>Маълумоти воридшавии фарзанди шумо</b>",
    name: "Ном",
    class: "Синф",
    login: "Логин",
    password: "Парол",
    nickname: "Никнейм",
    site: "🌐 Сомона",
    app: "📱 Барнома",
    keep: "Паролро ба касе нишон надиҳед. Пас аз воридшавӣ онро дар «Танзимот» иваз кардан мумкин аст.",
  },
  ru: {
    title: "🔐 <b>Данные для входа вашего ребёнка</b>",
    name: "Имя",
    class: "Класс",
    login: "Логин",
    password: "Пароль",
    nickname: "Никнейм",
    site: "🌐 Сайт",
    app: "📱 Приложение",
    keep: "Никому не показывайте пароль. После входа его можно сменить в «Настройках».",
  },
  en: {
    title: "🔐 <b>Your child's sign-in details</b>",
    name: "Name",
    class: "Class",
    login: "Login",
    password: "Password",
    nickname: "Nickname",
    site: "🌐 Website",
    app: "📱 App",
    keep: "Do not share the password. It can be changed under Settings after signing in.",
  },
};

export function credentialsMessage(entry: CredentialsEntry, locale: Loc, siteUrl: string): string {
  const w = WORDS[locale];
  const rows: Array<[string, string]> = [
    [w.name, [entry.last_name, entry.first_name, entry.middle_name].filter(Boolean).join(" ")],
    [w.class, entry.class_name ?? "—"],
    [w.login, entry.login],
    [w.password, entry.password],
  ];
  if (entry.nickname) rows.push([w.nickname, entry.nickname]);
  const width = Math.max(...rows.map(([label]) => label.length));
  // One escape, of the finished table: the <pre> holds text, and a name with
  // an ampersand in it should read as one.
  const table = rows.map(([label, value]) => `${label.padEnd(width)}  ${value}`).join("\n");
  const site = siteUrl.replace(/\/+$/, "");
  return [
    w.title,
    "",
    `<pre>${escapeHtml(table)}</pre>`,
    `${w.site}: ${escapeHtml(site)}/login`,
    `${w.app}: ${escapeHtml(site)}/app`,
    "",
    `<i>${escapeHtml(w.keep)}</i>`,
  ].join("\n");
}
