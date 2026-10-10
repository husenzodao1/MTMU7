/**
 * Which files a conversation takes, and how they are described.
 *
 * A school sends documents, tables, slides, archives, recordings and short
 * videos — never a program. The list here is the same one the bucket enforces
 * (migration 00071); this side exists so the person hears "that kind of file
 * cannot be sent" at once, rather than after a failed upload, and so the file
 * is labelled by its own extension rather than by whatever type a browser
 * guessed for it.
 *
 * Pure, so it can be tested without a browser.
 */

export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export type FileKind = "pdf" | "doc" | "sheet" | "slides" | "text" | "archive" | "audio" | "video" | "image";

const BY_EXTENSION: Record<string, { mime: string; kind: FileKind }> = {
  pdf: { mime: "application/pdf", kind: "pdf" },
  doc: { mime: "application/msword", kind: "doc" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "doc" },
  odt: { mime: "application/vnd.oasis.opendocument.text", kind: "doc" },
  rtf: { mime: "application/rtf", kind: "doc" },
  xls: { mime: "application/vnd.ms-excel", kind: "sheet" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "sheet" },
  ods: { mime: "application/vnd.oasis.opendocument.spreadsheet", kind: "sheet" },
  csv: { mime: "text/csv", kind: "sheet" },
  ppt: { mime: "application/vnd.ms-powerpoint", kind: "slides" },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", kind: "slides" },
  odp: { mime: "application/vnd.oasis.opendocument.presentation", kind: "slides" },
  txt: { mime: "text/plain", kind: "text" },
  zip: { mime: "application/zip", kind: "archive" },
  rar: { mime: "application/vnd.rar", kind: "archive" },
  "7z": { mime: "application/x-7z-compressed", kind: "archive" },
  mp3: { mime: "audio/mpeg", kind: "audio" },
  m4a: { mime: "audio/mp4", kind: "audio" },
  aac: { mime: "audio/aac", kind: "audio" },
  ogg: { mime: "audio/ogg", kind: "audio" },
  oga: { mime: "audio/ogg", kind: "audio" },
  opus: { mime: "audio/ogg", kind: "audio" },
  wav: { mime: "audio/wav", kind: "audio" },
  weba: { mime: "audio/webm", kind: "audio" },
  mp4: { mime: "video/mp4", kind: "video" },
  m4v: { mime: "video/mp4", kind: "video" },
  mov: { mime: "video/quicktime", kind: "video" },
  webm: { mime: "video/webm", kind: "video" },
  jpg: { mime: "image/jpeg", kind: "image" },
  jpeg: { mime: "image/jpeg", kind: "image" },
  png: { mime: "image/png", kind: "image" },
  webp: { mime: "image/webp", kind: "image" },
  gif: { mime: "image/gif", kind: "image" },
  heic: { mime: "image/heic", kind: "image" },
  heif: { mime: "image/heif", kind: "image" },
};

/** What the file picker is told to offer. */
export const FILE_ACCEPT = Object.keys(BY_EXTENSION)
  .map((extension) => `.${extension}`)
  .join(",");

export function extensionOf(name: string): string {
  const match = /\.([a-z0-9]{1,5})$/i.exec(name.trim());
  return match ? match[1]!.toLowerCase() : "";
}

export type FileCheck =
  | { ok: true; name: string; mime: string; kind: FileKind; extension: string }
  | { ok: false; error: "not_allowed" | "too_large" | "empty" };

/** Whether a file may be sent, and as what. */
export function checkFile(name: string, size: number): FileCheck {
  if (size <= 0) return { ok: false, error: "empty" };
  if (size > MAX_FILE_BYTES) return { ok: false, error: "too_large" };
  const extension = extensionOf(name);
  const known = BY_EXTENSION[extension];
  if (!known) return { ok: false, error: "not_allowed" };
  return { ok: true, name: cleanFileName(name, extension), mime: known.mime, kind: known.kind, extension };
}

export function kindOf(name: string | null | undefined, mime?: string | null): FileKind {
  const known = name ? BY_EXTENSION[extensionOf(name)] : undefined;
  if (known) return known.kind;
  if (mime?.startsWith("audio/")) return "audio";
  if (mime?.startsWith("video/")) return "video";
  if (mime?.startsWith("image/")) return "image";
  return "doc";
}

/**
 * The name as the other side will see it: no folders, no control characters,
 * nothing a file system would refuse, and at most 120 characters with the
 * extension kept.
 */
export function cleanFileName(name: string, extension = extensionOf(name)): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  let clean = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").replace(/\s+/g, " ").trim();
  if (!clean || clean === `.${extension}`) clean = `file.${extension}`;
  if (clean.length > 120) {
    const suffix = extension ? `.${extension}` : "";
    clean = `${clean.slice(0, 120 - suffix.length).trimEnd()}${suffix}`;
  }
  return clean;
}

/** 812 B, 48 KB, 3.4 MB — in the reader's own decimal separator. */
export function formatBytes(bytes: number | null | undefined, locale: string): string {
  const value = Math.max(0, bytes ?? 0);
  const units = locale === "en" ? ["B", "KB", "MB"] : locale === "ru" ? ["Б", "КБ", "МБ"] : ["Б", "КБ", "МБ"];
  if (value < 1024) return `${value} ${units[0]}`;
  const kb = value / 1024;
  const format = (n: number) => new Intl.NumberFormat(locale === "tg" ? "ru" : locale, { maximumFractionDigits: n < 10 ? 1 : 0 }).format(n);
  if (kb < 1024) return `${format(kb)} ${units[1]}`;
  return `${format(kb / 1024)} ${units[2]}`;
}

/** 0:07, 1:42 — a voice note's length. */
export function formatDuration(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.round(seconds ?? 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * The web addresses in a message, so they can be links. Only http and https,
 * and a trailing full stop or bracket stays with the sentence.
 */
export function splitLinks(text: string): Array<{ text: string; href?: string }> {
  const parts: Array<{ text: string; href?: string }> = [];
  const pattern = /\bhttps?:\/\/[^\s<>"']+/gi;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    let url = match[0];
    const trailing = /[.,;:!?)\]}»"']+$/.exec(url);
    if (trailing) url = url.slice(0, -trailing[0].length);
    const start = match.index ?? 0;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: url, href: url });
    last = start + url.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
