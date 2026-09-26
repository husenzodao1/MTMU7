"use server";

import { z } from "zod";
import { done, failure, formDataToObject, keepValues, parseInput, success, type FormState } from "@/lib/actions/result";
import { getAuthSchool } from "@/lib/site/auth-school";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  name: z.string().trim().min(1, "validation.required").max(120, "validation.too_big"),
  // A phone number or an address — whichever this person will answer.
  contact: z.string().trim().min(3, "validation.required").max(160, "validation.too_big"),
  message: z.string().trim().min(1, "validation.required").max(2000, "validation.too_big"),
  // Left empty by people and filled by the bots that fill every field.
  website: z.string().max(0).optional().or(z.literal("")),
});

/**
 * A note to the school's support desk from somebody who cannot sign in —
 * the person whose Google address was not recognised, or who never received a
 * login. The database checks the lengths again and limits how often one
 * contact, and one school, can be written to.
 */
export async function submitSupportRequestAction(_state: FormState, formData: FormData): Promise<FormState> {
  const kept = keepValues(formData);
  const input = parseInput(requestSchema, formDataToObject(formData), kept);
  if (!input.ok) return done(input.result);
  // A bot that filled the trap is told it worked and nothing is written.
  if (input.data.website) return done(success("common.support.guest.sent"));

  const school = await getAuthSchool();
  if (!school) return done(failure("errors.unexpected", undefined, kept));

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_support_request", {
    p_school_id: school.id,
    p_name: input.data.name,
    p_contact: input.data.contact,
    p_message: input.data.message,
  });
  if (error) {
    const limited = /rate_limited/.test(error.message ?? "");
    return done(failure(limited ? "errors.rate_limited" : "errors.unexpected", undefined, kept));
  }
  return done(success("common.support.guest.sent"));
}
