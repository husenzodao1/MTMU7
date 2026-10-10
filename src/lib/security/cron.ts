import { timingSafeEqual } from "node:crypto";

export function hasValidCronAuthorization(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(header.slice("Bearer ".length), "utf8");
  const expected = Buffer.from(secret, "utf8");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
