import "server-only";
import { headers } from "next/headers";
import { publicEnv } from "@/lib/env";
import { isTelegramConfigured, sendMessage } from "@/lib/telegram/api";
import { asLocale } from "@/lib/telegram/messages";
import { createClient } from "@/lib/supabase/server";
import { credentialsMessage } from "@/features/accounts/credentials-message";

interface Recipient {
  login: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  nickname: string | null;
  class_name: string | null;
  chats: Array<{ chat_id: number; locale: string }> | null;
}

export interface SentCredentials {
  /** Pupils whose parents were told. */
  pupils: number;
  /** Messages delivered, one per parent's chat. */
  messages: number;
}

async function siteUrl(): Promise<string> {
  if (publicEnv.NEXT_PUBLIC_APP_URL) return publicEnv.NEXT_PUBLIC_APP_URL;
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "mtmuraqami7.vercel.app";
  return `https://${host}`;
}

/**
 * Sends each young pupil's new login to the parents who follow them in the
 * bot. The database picks who (account_credentials_recipients: only pupils
 * the caller manages, only up to the grade their parents run, only chats that
 * proved the parent code); this only writes and posts.
 *
 * The passwords pass through here on their way from the answer that issued
 * them to Telegram, and are kept nowhere.
 */
export async function sendCredentialsToParents(entries: Array<{ login: string; password: string }>): Promise<SentCredentials> {
  if (!isTelegramConfigured() || entries.length === 0) return { pupils: 0, messages: 0 };
  const passwords = new Map(entries.map((entry) => [entry.login.toUpperCase(), entry.password]));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("account_credentials_recipients", { p_logins: [...passwords.keys()] });
  if (error || !Array.isArray(data)) return { pupils: 0, messages: 0 };

  const site = await siteUrl();
  let pupils = 0;
  let messages = 0;
  let sentThisSecond = 0;
  for (const recipient of data as unknown as Recipient[]) {
    const password = passwords.get(recipient.login.toUpperCase());
    if (!password || !recipient.chats?.length) continue;
    let told = false;
    for (const chat of recipient.chats) {
      // Telegram allows about thirty messages a second; a class of parents
      // is sent at a pace it will not throttle.
      if (sentThisSecond >= 25) {
        await new Promise((resolve) => setTimeout(resolve, 1100));
        sentThisSecond = 0;
      }
      sentThisSecond += 1;
      try {
        await sendMessage(chat.chat_id, credentialsMessage({ ...recipient, password }, asLocale(chat.locale), site));
        messages += 1;
        told = true;
      } catch {
        // A parent who blocked the bot is not a reason to stop telling the rest.
      }
    }
    if (told) pupils += 1;
  }
  return { pupils, messages };
}
