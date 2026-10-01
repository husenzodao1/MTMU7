import "server-only";
import { failure, type ActionResult } from "@/lib/actions/result";
import { dbErrorKey, type PostgrestLikeError } from "@/lib/actions/db-error-key";

/**
 * Maps a PostgREST / Postgres error to a safe, translatable result. Raw
 * database messages are never returned to the client.
 */
export function mapDbError(error: PostgrestLikeError | null | undefined, fallback = "errors.unexpected"): ActionResult<never> {
  if (!error) return failure(fallback);
  const key = dbErrorKey(error);
  if (key) return failure(key);
  console.error("[db-error]", { code: error.code, message: (error.message ?? "").slice(0, 300) });
  return failure(fallback);
}
