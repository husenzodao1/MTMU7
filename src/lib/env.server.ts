import "server-only";
import { z } from "zod";

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  DEFAULT_SCHOOL_SLUG: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .optional(),
  CRON_SECRET: z.string().min(32).optional(),
});

/** Server-only configuration. Never import from client components. */
export const serverEnv = serverSchema.parse({
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
  DEFAULT_SCHOOL_SLUG: process.env.DEFAULT_SCHOOL_SLUG || undefined,
  CRON_SECRET: process.env.CRON_SECRET || undefined,
});
