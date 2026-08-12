"use client";

import { useActionState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { sendMessageAction } from "./actions";
import { Send, X } from "lucide-react";

export function MessageInput({
  conversationId,
  replyToId,
  replyToContent,
  onCancelReply,
}: {
  conversationId: string;
  replyToId: string | null;
  replyToContent: string | null;
  onCancelReply: () => void;
}) {
  const t = useTranslations("messages");
  const formRef = useRef<HTMLFormElement>(null);

  const boundAction = sendMessageAction.bind(null, conversationId, replyToId);
  const [state, action, isPending] = useActionState(boundAction, {
    error: null,
  });

  useEffect(() => {
    if (!state.error && !isPending) {
      formRef.current?.reset();
      onCancelReply();
    }
  }, [state, isPending, onCancelReply]);

  return (
    <div className="border-t border-neutral-200 bg-white px-4 py-3">
      {replyToId && replyToContent && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-primary-50 px-3 py-1.5 text-xs text-neutral-600">
          <span className="font-medium">{t("replyTo")}:</span>
          <span className="flex-1 truncate">{replyToContent}</span>
          <button type="button" onClick={onCancelReply}>
            <X className="h-3 w-3 text-neutral-400" />
          </button>
        </div>
      )}
      <form ref={formRef} action={action} className="flex items-center gap-2">
        <input
          type="text"
          name="content"
          placeholder={t("typeMessage")}
          autoComplete="off"
          required
          className="flex-1 rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm outline-none transition-colors duration-[var(--duration-fast)] focus:border-primary-300 focus:bg-white"
        />
        <Button
          type="submit"
          size="icon"
          loading={isPending}
          className="h-10 w-10 shrink-0 rounded-full"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
      {state.error && (
        <p className="mt-1 text-xs text-red-500">{state.error}</p>
      )}
    </div>
  );
}
