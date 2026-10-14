/** The second of each Tajik letter pair a hurried hand swaps, as the first (list-params.ts, ALIKE). */
const FOLD: Record<string, string> = { ҳ: "х", қ: "к", ҷ: "ч", ӣ: "и", ӯ: "у", ғ: "г", ё: "е" };

/**
 * Text as a search on the device compares it: lower case, and ҳ қ ҷ ӣ ӯ ғ ё
 * as х к ч и у г е — so "Мехровар" finds Меҳровар. Letter for letter, so a
 * place found in the folded text is the same place in the text itself.
 */
export function fold(text: string): string {
  return text.toLocaleLowerCase().replace(/[ҳқҷӣӯғё]/g, (c) => FOLD[c] ?? c);
}
