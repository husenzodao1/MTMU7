"use client";

import { useActionState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { sendMessageAction } from "./actions";
import { Send, X } from "lucide-react";

export function MessageInput({
  conversationId,
  replyToId,
  replyToContent,
  onCancelReply,
  onOptimisticSend,
}: {
  conversationId: string;
  replyToId: string | null;
  replyToContent: string | null;
  onCancelReply: () => void;
  onOptimisticSend: (content: string, replyToId: string | null) => void;
}) {
  const t = useTranslations("messages");
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const boundAction = sendMessageAction.bind(null, conversationId, replyToId);
  const [state, action, isPending] = useActionState(boundAction, { error: null });

  useEffect(() => {
    if (!state.error && !isPending) {
      formRef.current?.reset();
      onCancelReply();
      inputRef.current?.focus();
      // Refresh server data so conversations list shows the new last message
      router.refresh();
    }
  }, [state, isPending, onCancelReply, router]);

  return (
    <div className="shrink-0 border-t border-neutral-100 bg-white px-3 py-2.5">
      {replyToId && replyToContent && (
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-indigo-50 px-3 py-1.5 text-xs text-neutral-600">
          <div className="w-0.5 self-stretch rounded-full bg-indigo-400" />
          <span className="flex-1 truncate text-neutral-500">{replyToContent}</span>
          <button type="button" onClick={onCancelReply} className="shrink-0 rounded p-0.5 hover:bg-indigo-100">
            <X className="h-3 w-3 text-neutral-400" />
          </button>
        </div>
      )}
      <form
        ref={formRef}
        action={action}
        className="flex items-center gap-2"
        onSubmit={(e) => {
          const val = inputRef.current?.value?.trim();
          if (val) onOptimisticSend(val, replyToId);
        }}
      >
        <input
          ref={inputRef}
          type="text"
          name="content"
          placeholder={t("typeMessage")}
          autoComplete="off"
          required
          className="flex-1 rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm outline-none transition-all focus:border-indigo-300 focus:bg-white focus:ring-1 focus:ring-indigo-100"
        />
        <button
          type="submit"
          disabled={isPending}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-transform active:scale-90 disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #818cf8 0%, #4f46e5 100%)" }}
        >
          <Send className="h-4 w-4 text-white" />
        </button>
      </form>
      {state.error && (
        <p className="mt-1 text-xs text-red-500">{t(state.error as never)}</p>
      )}
    </div>
  );
}
