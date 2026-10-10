import "server-only";
import { createPrivilegedClient } from "@/lib/supabase/privileged";
import type { Loc } from "@/lib/telegram/messages";
import type { AbsenceNews, Child, GradeNews, Report } from "@/lib/telegram/messages";

/**
 * The bot's half of the database.
 *
 * Every telegram_* function is executable by service_role alone, so none of
 * them appear in the generated types. Rather than scatter casts through the
 * conversation, they are all named once here, with the shapes the rest of the
 * bot expects. The cast is on the client, never on `client.rpc` itself: a
 * detached rpc loses its receiver and throws inside supabase-js.
 */

interface Rpc {
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

function client(): Rpc {
  return createPrivilegedClient() as unknown as Rpc;
}

async function call<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await client().rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message ?? "failed"}`);
  return data as T;
}

export interface ChatState {
  locale: Loc;
  state: "idle" | "awaiting_child" | "awaiting_code";
  subscribed: boolean;
  blocked: boolean;
  children: Array<{ id: string } & Child>;
}

export const touchChat = (chat: number, locale?: string) =>
  call<ChatState>("telegram_touch", { p_chat: chat, p_locale: locale ?? null });

export const setLocale = (chat: number, locale: Loc) =>
  call<void>("telegram_set_locale", { p_chat: chat, p_locale: locale });

export const setSubscribed = (chat: number, ok: boolean) =>
  call<void>("telegram_set_subscribed", { p_chat: chat, p_ok: ok });

export const setState = (chat: number, state: ChatState["state"]) =>
  call<void>("telegram_set_state", { p_chat: chat, p_state: state });

export const findChild = (chat: number, needle: string) =>
  call<{ found: boolean; ambiguous?: boolean; noCode?: boolean }>("telegram_find_child", {
    p_chat: chat,
    p_needle: needle,
  });

export const confirmChild = (chat: number, code: string) =>
  call<{ ok: boolean; reason?: string; child?: Child }>("telegram_confirm_child", { p_chat: chat, p_code: code });

export const report = (chat: number, student: string, kind: string) =>
  call<Report>("telegram_report", { p_chat: chat, p_student: student, p_kind: kind, p_date: null });

export const forgetChat = (chat: number) => call<void>("telegram_forget", { p_chat: chat });

export interface DueMessage {
  id: string;
  chat: number;
  locale: Loc;
  kind: "grade" | "absence" | "digest";
  school: { name: string | null; slug: string } | null;
  child: Child;
  grade: GradeNews | null;
  absence: AbsenceNews | null;
  digest: Report | null;
}

export const dueMessages = (limit: number) => call<DueMessage[]>("telegram_due", { p_limit: limit });

export const markDelivered = (ids: string[]) => call<void>("telegram_delivered", { p_ids: ids });

export const markFailed = (id: string, error: string) =>
  call<void>("telegram_failed", { p_id: id, p_error: error });

export const enqueueDigests = () => call<number>("telegram_enqueue_digests");
