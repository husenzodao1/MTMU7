import { z } from "zod";

/**
 * Identifier check for values that come from this database.
 *
 * Postgres stores any 128-bit value in a uuid column, and the platform's seeded
 * rows use readable identifiers such as 00000000-0000-0000-0001-000000000004.
 * Zod's own uuid() enforces the RFC version and variant nibbles and rejects
 * those, which silently turned "signed in" into "no account" once a role id
 * reached the schema. The shape is what matters here; the database is the
 * authority on whether the row exists.
 */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const uuid = z.string().regex(UUID_PATTERN);

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
