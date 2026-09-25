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
});

/** Server-only configuration. Never import from client components. */
export const serverEnv = serverSchema.parse({
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
  DEFAULT_SCHOOL_SLUG: process.env.DEFAULT_SCHOOL_SLUG || undefined,
  CRON_SECRET: process.env.CRON_SECRET || undefined,
  LOGIN_LOOKUP_SECRET: process.env.LOGIN_LOOKUP_SECRET || undefined,
});
