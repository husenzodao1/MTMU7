"use client";

import { forgetListOps } from "@/features/messages/list-ops";
import { forgetChatStores } from "@/features/messages/local-store";
import { forgetOutbox } from "@/features/messages/outbox";
import { forgetMarks } from "@/features/messages/read-marks";
import { forgetReads } from "@/features/messages/read-queue";

/** Where a conversation's unsent words are kept, per person and conversation (thread.tsx). */
export const DRAFT_PREFIX = "chat-draft:";

/**
 * Signing out, or a session found ended: nothing of one person's messenger
 * is left on the device for the next — kept messages, the list, unsent
 * messages and their photos, drafts, marks and list changes still to send.
 */
export async function forgetChat(): Promise<void> {
  forgetOutbox();
  forgetReads();
  forgetMarks();
  forgetListOps();
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(DRAFT_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Nothing kept.
  }
  await forgetChatStores();
}
