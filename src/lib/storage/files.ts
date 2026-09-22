/**
 * Upload rules shared by the browser (pre-check) and the server (authoritative
 * check before a storage path is registered in the database). Buckets enforce
 * size and MIME limits as well (migration 00028).
 */

export type UploadKind = "image" | "avatar" | "book" | "cover" | "document" | "homework";

interface Rule {
  bucket: string;
  maxBytes: number;
  types: Record<string, string[]>;
}

const IMAGE_TYPES = { "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/webp": ["webp"] };

export const UPLOAD_RULES: Record<UploadKind, Rule> = {
  image: { bucket: "public-media", maxBytes: 10 * 1024 * 1024, types: { ...IMAGE_TYPES, "image/avif": ["avif"] } },
  avatar: { bucket: "avatars", maxBytes: 4 * 1024 * 1024, types: IMAGE_TYPES },
  cover: { bucket: "library-covers", maxBytes: 5 * 1024 * 1024, types: IMAGE_TYPES },
  book: {
    bucket: "library-files",
    maxBytes: 100 * 1024 * 1024,
    types: { "application/pdf": ["pdf"], "application/epub+zip": ["epub"], "audio/mpeg": ["mp3"] },
  },
  document: {
    bucket: "documents",
    maxBytes: 50 * 1024 * 1024,
    types: {
      "application/pdf": ["pdf"],
      "application/msword": ["doc"],
      "application/vnd.ms-excel": ["xls"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["pptx"],
      "image/jpeg": ["jpg", "jpeg"],
      "image/png": ["png"],
    },
  },
  homework: {
    bucket: "homework",
    maxBytes: 25 * 1024 * 1024,
    types: {
      "application/pdf": ["pdf"],
      ...IMAGE_TYPES,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
      "text/plain": ["txt"],
    },
  },
};

export type FileCheck = { ok: true; extension: string } | { ok: false; error: "file_missing" | "file_too_large" | "file_type" };

export function fileExtension(name: string): string {
  const match = /\.([a-z0-9]{1,8})$/i.exec(name.trim());
  return match ? match[1]!.toLowerCase() : "";
}

export function checkFile(kind: UploadKind, file: { name: string; type: string; size: number }): FileCheck {
  const rule = UPLOAD_RULES[kind];
  if (!file || file.size <= 0) return { ok: false, error: "file_missing" };
  if (file.size > rule.maxBytes) return { ok: false, error: "file_too_large" };
  const allowedExtensions = rule.types[file.type];
  const extension = fileExtension(file.name);
  if (!allowedExtensions || !allowedExtensions.includes(extension)) return { ok: false, error: "file_type" };
  return { ok: true, extension };
}

/** Magic-byte signatures, checked server-side for files that pass through the server. */
export function sniffMime(bytes: Uint8Array): string | null {
  const starts = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (starts([0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66], 4)) return "image/avif";
  if (starts([0x50, 0x4b, 0x03, 0x04])) return "application/zip";
  if (starts([0x49, 0x44, 0x33]) || starts([0xff, 0xfb])) return "audio/mpeg";
  return null;
}

const ZIP_BASED = new Set([
  "application/epub+zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

/** True when the file content matches its declared type (or the type has no reliable signature). */
export function contentMatchesType(declared: string, bytes: Uint8Array): boolean {
  const sniffed = sniffMime(bytes);
  if (ZIP_BASED.has(declared)) return sniffed === "application/zip";
  if (declared === "text/plain" || declared === "application/msword" || declared === "application/vnd.ms-excel") {
    return sniffed === null || sniffed === declared;
  }
  return sniffed === declared;
}

/**
 * Validates that a storage path produced by an upload belongs to the school
 * folder and the expected area, with a random file name (no traversal).
 */
export function isValidStoragePath(path: string, schoolId: string, area: string): boolean {
  const pattern = new RegExp(`^${schoolId}/${area}/[0-9a-f-]{36}\\.[a-z0-9]{1,8}$`);
  return pattern.test(path) && !path.includes("..");
}

export function newStoragePath(schoolId: string, area: string, extension: string): string {
  return `${schoolId}/${area}/${crypto.randomUUID()}.${extension}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
