/**
 * A person's number as WhatsApp takes it, or null when it cannot be one.
 *
 * WhatsApp lives on mobile numbers only, and nobody outside WhatsApp can ask
 * whether a given number has it — so a number is accepted only where it can:
 *
 * - a Tajik number, however it was typed ("92 947 5028", "+992 92 947 5028",
 *   "00992929475028"), whose nine digits are not a landline (those begin
 *   with 3: Dushanbe 37…, Istaravshan 3454…);
 * - a Russian mobile, typed with 8 or 7 in front (8 912 345 67 89);
 * - any other number written in full international form (+…).
 *
 * Anything else — too short, a landline, letters — gives no WhatsApp at all.
 */
export function whatsappNumber(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  if (/[a-zа-яё]/iu.test(text)) return null;
  const typed = text.replace(/\D/g, "");
  // Nine digits are a Tajik number even when they begin with 00 (00 123 4567);
  // longer, a leading 00 is the international prefix.
  const local = typed.length === 9 && !text.startsWith("+");
  const international = !local && (text.startsWith("+") || typed.startsWith("00"));
  const digits = local ? typed : typed.replace(/^00/, "");

  const tajik = local ? digits : digits.length === 12 && digits.startsWith("992") ? digits.slice(3) : null;
  if (tajik !== null) return tajik.startsWith("3") ? null : `992${tajik}`;
  if (digits.startsWith("992")) return null;

  if (!international && digits.length === 11 && /^[78]9/.test(digits)) return `7${digits.slice(1)}`;
  if (international && digits.length >= 10 && digits.length <= 15 && !digits.startsWith("0")) return digits;
  return null;
}

/** The link that opens a chat with this person in WhatsApp, or null when the number cannot have it. */
export function whatsappLink(raw: string | null | undefined): string | null {
  const number = whatsappNumber(raw);
  return number ? `https://wa.me/${number}` : null;
}
