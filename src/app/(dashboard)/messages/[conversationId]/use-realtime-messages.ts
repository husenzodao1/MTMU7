"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MessageItem } from "./message-thread";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export function useRealtimeMessages(
  conversationId: string,
  initialMessages: MessageItem[],
  currentUserId: string
) {
  const [messages, setMessages] = useState(initialMessages);
  const [prevId, setPrevId] = useState(conversationId);

  if (prevId !== conversationId) {
    setPrevId(conversationId);
    setMessages(initialMessages);
  }

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        async (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const newMsg = payload.new as Record<string, unknown>;
          if (!newMsg.id) return;
          // Client-side filter — only process messages for this conversation
          if (newMsg.conversation_id !== conversationId) return;

          if (newMsg.sender_id === currentUserId) {
            // Replace oldest optimistic message with confirmed one
            setMessages((prev) => {
              const tempIdx = prev.findIndex((m) => m.isOptimistic);
              if (tempIdx === -1) return prev;
              const updated = [...prev];
              updated[tempIdx] = { ...updated[tempIdx], id: newMsg.id as string, isOptimistic: false, createdAt: newMsg.created_at as string } as MessageItem;
              return updated;
            });
            return;
          }

          const { data: sender } = await supabase
            .from("users" as never)
            .select("first_name, last_name, avatar_url" as never)
            .eq("id" as never, newMsg.sender_id as never)
            .single();

          const senderData = sender as Record<string, unknown> | null;

          const message: MessageItem = {
            id: newMsg.id as string,
            conversationId,
            senderId: newMsg.sender_id as string,
            senderName: senderData
              ? `${senderData.first_name} ${senderData.last_name}`
              : "...",
            senderAvatar: senderData?.avatar_url as string | null,
            content: newMsg.content as string,
            type: newMsg.type as string,
            replyToId: newMsg.reply_to_id as string | null,
            isPinned: newMsg.is_pinned as boolean,
            isEdited: newMsg.is_edited as boolean,
            isDeleted: newMsg.is_deleted as boolean,
            createdAt: newMsg.created_at as string,
          };

          setMessages((prev) => [...prev, message]);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const updated = payload.new as Record<string, unknown>;
          if (!updated.id) return;
          if (updated.conversation_id !== conversationId) return;

          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === updated.id
                ? {
                    ...msg,
                    content: updated.content as string,
                    isPinned: updated.is_pinned as boolean,
                    isEdited: updated.is_edited as boolean,
                    isDeleted: updated.is_deleted as boolean,
                  }
                : msg
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId]);

  const addOptimisticMessage = useCallback(
    (content: string, replyToId: string | null) => {
      const optimistic: MessageItem = {
        id: `temp-${Date.now()}`,
        conversationId,
        senderId: currentUserId,
        senderName: "",
        senderAvatar: null,
        content,
        type: "text",
        replyToId,
        isPinned: false,
        isEdited: false,
        isDeleted: false,
        createdAt: new Date().toISOString(),
        isOptimistic: true,
      };
      setMessages((prev) => [...prev, optimistic]);
    },
    [conversationId, currentUserId]
  );

  return { messages, addOptimisticMessage };
}
