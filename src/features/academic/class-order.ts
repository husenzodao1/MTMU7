/**
 * Classes in the order a Tajik school reads them out: by form, and within a
 * form А, Б, В, Г, Ғ, Д — not the order of the Unicode table, which puts Ғ
 * after every Russian letter.
 */
const LETTERS = ["А", "Б", "В", "Г", "Ғ", "Д", "Е", "Ё", "Ж", "З", "И", "Ӣ", "Й", "К", "Қ", "Л", "М", "Н", "О", "П", "Р", "С", "Т", "У", "Ӯ", "Ф", "Х", "Ҳ", "Ч", "Ҷ", "Ш"];

export function classSortKey(name: string): [number, number, string] {
  const match = /^\s*(\d{1,2})\s*(.*)$/.exec(name.toUpperCase());
  const grade = match ? Number(match[1]) : 99;
  const rest = (match?.[2] ?? name).trim();
  const letter = LETTERS.indexOf(rest.charAt(0));
  return [grade, letter === -1 ? 99 : letter, rest];
}

export function compareClassNames(a: string, b: string): number {
  const [ga, la, ra] = classSortKey(a);
  const [gb, lb, rb] = classSortKey(b);
  return ga - gb || la - lb || ra.localeCompare(rb);
}
