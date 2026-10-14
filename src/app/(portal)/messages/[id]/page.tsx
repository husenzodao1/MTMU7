import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadThread } from "@/features/messages/load-thread";
import { Thread } from "@/features/messages/thread";
import { requireModule } from "@/lib/auth/guards";

export const metadata: Metadata = { robots: { index: false } };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireModule("messages");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  // RLS returns the conversation only to its members.
  const thread = await loadThread(access, id);
  if (!thread) notFound();
  return <Thread key={id} {...thread} />;
}
