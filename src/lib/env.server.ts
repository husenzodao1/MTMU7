import "server-only";
import { z } from "zod";

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  DEFAULT_SCHOOL_SLUG: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .optional(),
  CRON_SECRET: z.string().min(32).optional(),
  // Lets the sign-in action turn the login the school issued into the address
  // Supabase signs people in by. Without it nobody can sign in by login — see
  // public.login_lookup in migration 00045 for why the mapping is gated at all.
  LOGIN_LOOKUP_SECRET: z.string().min(32).optional(),
  // The parents' bot. Without a token there is no bot: every route that needs
  // one refuses rather than half-working, and the portal is unaffected.
  TELEGRAM_BOT_TOKEN: z
    .string()
    .regex(/^\d{6,}:[A-Za-z0-9_-]{30,}$/, "expected a token of the form 123456:ABC-DEF…")
    .optional(),
  // Telegram echoes this in X-Telegram-Bot-Api-Secret-Token on every update, so
  // the webhook can tell Telegram apart from anybody who found the URL.
  TELEGRAM_WEBHOOK_SECRET: z.string().min(32).optional(),
  // The channel a parent must be following before the bot will talk to them.
  TELEGRAM_CHANNEL: z.string().regex(/^@[A-Za-z0-9_]{4,64}$/).optional(),
});

/** Server-only configuration. Never import from client components. */
export const serverEnv = serverSchema.parse({
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
  DEFAULT_SCHOOL_SLUG: process.env.DEFAULT_SCHOOL_SLUG || undefined,
  CRON_SECRET: process.env.CRON_SECRET || undefined,
  LOGIN_LOOKUP_SECRET: process.env.LOGIN_LOOKUP_SECRET || undefined,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || undefined,
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET || undefined,
  TELEGRAM_CHANNEL: process.env.TELEGRAM_CHANNEL || undefined,
});

/** The channel the school publishes to, and the bot insists on. */
export const TELEGRAM_CHANNEL = serverEnv.TELEGRAM_CHANNEL ?? "@istaravshan_schools";
