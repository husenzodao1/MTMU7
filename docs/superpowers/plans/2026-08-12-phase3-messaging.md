# Phase 3: Messaging Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full messaging module with conversation list, message thread, real-time updates, and contact search — governed by school structure, RBAC, and RLS.

**Architecture:** Server-side module/permission gating via `isModuleAccessible("messages")` and `canPerformAction("messages", "messages.*")`. All data flows through RLS-protected Supabase queries. Client-side Supabase Realtime for live message delivery. Responsive split-view layout (sidebar + thread on desktop, full-screen switching on mobile).

**Tech Stack:** Next.js 16 (App Router, Server Components), TypeScript strict (`noUncheckedIndexedAccess`), Supabase (RLS + Realtime), Tailwind CSS 4, next-intl (tg/ru), Zod, Lucide React, cva

## Global Constraints

- **No inline `"use server"` in client components.** Always use `.bind()` pattern for server action arguments.
- **`params` and `searchParams` are Promises** in Next.js 16 — must `await` them.
- **Database type placeholder:** all Supabase queries use `as never` casts: `.from("table" as never).select("cols" as never).eq("col" as never, val)`.
- **Four authorization layers:** (1) RLS at database, (2) Middleware route check, (3) Server actions verify permissions, (4) UI hides for UX only.
- **Module access chain:** module enabled (`school_modules`) → role sees module (`module_role_access`) → role has permission (`role_permissions`).
- **Existing permissions:** `messages.read`, `messages.create`, `messages.manage` (seeded in 00012_seed.sql).
- **Existing tables:** conversations, conversation_members, messages, message_attachments — with RLS policies and cross-school triggers already in migrations.
- **Soft delete:** conversations use `is_active`, messages use `is_deleted`.
- **Design system:** Use existing UI components from `src/components/ui/`. Animation tokens: `--duration-fast/normal/slow`, `--ease-default/spring/out/in`. Support `prefers-reduced-motion`.
- **iOS-like UX:** Smooth transitions, loading/skeleton states, responsive.
- **i18n:** All user-visible strings via `useTranslations()` / `getTranslations()`. Tajik primary, Russian secondary.
- **No mock data as business logic.**

---

### Task 1: Module Guard Layout + Conversation List Server Component

**Files:**
- Create: `src/app/(dashboard)/messages/layout.tsx`
- Create: `src/app/(dashboard)/messages/page.tsx`
- Create: `src/app/(dashboard)/messages/conversations-list.tsx`
- Create: `src/app/(dashboard)/messages/actions.ts`
- Modify: `src/i18n/tg.json` (add `messages` section)
- Modify: `src/i18n/ru.json` (add `messages` section)

**Interfaces:**
- Consumes: `isModuleAccessible("messages")` from `src/lib/modules/check.ts`, `getUserWithRole()` from `src/lib/auth/get-user-with-role.ts`, `createServerClient()` from `src/lib/supabase/server.ts`, `ErrorState` from `src/components/ui/error-state.tsx`, `EmptyState` from `src/components/ui/empty-state.tsx`
- Produces: `ConversationItem` interface (id, name, type, lastMessage, lastMessageAt, unreadCount, avatarUrl, members), `ConversationsList` client component

- [ ] **Step 1: Add i18n keys for messaging module**

Add to `src/i18n/tg.json` a new `"messages"` section (NOT inside `"admin"`):

```json
"messages": {
  "title": "Паёмҳо",
  "conversations": "Суҳбатҳо",
  "newConversation": "Суҳбати нав",
  "noConversations": "Ҳоло суҳбате нест",
  "noConversationsDesc": "Суҳбати навро оғоз кунед",
  "searchConversations": "Ҷустуҷӯи суҳбат",
  "typeMessage": "Паём нависед...",
  "send": "Фиристодан",
  "reply": "Ҷавоб додан",
  "edit": "Таҳрир",
  "delete": "Нест кардан",
  "pin": "Часпондан",
  "unpin": "Часп бардоштан",
  "edited": "таҳриршуда",
  "deleted": "нест карда шуд",
  "you": "Шумо",
  "online": "Онлайн",
  "offline": "Офлайн",
  "members": "Аъзоҳо",
  "addMembers": "Илова кардани аъзоҳо",
  "leaveConversation": "Тарк кардан",
  "conversationInfo": "Маълумоти суҳбат",
  "direct": "Шахсӣ",
  "group": "Гурӯҳӣ",
  "classGroup": "Синфи",
  "announcement": "Эълон",
  "today": "Имрӯз",
  "yesterday": "Дирӯз",
  "attachFile": "Замима кардан",
  "replyTo": "Ҷавоб ба",
  "messageDeleted": "Ин паём нест карда шуд",
  "searchUsers": "Ҷустуҷӯи корбарон",
  "selectUser": "Корбарро интихоб кунед",
  "noMessages": "Ҳоло паёме нест",
  "noMessagesDesc": "Аввалин паёмро фиристед",
  "startConversation": "Суҳбатро оғоз кунед",
  "moduleDisabled": "Бахши паёмҳо ғайрифаъол аст",
  "noAccess": "Шумо ба ин бахш дастрасӣ надоред"
}
```

Add corresponding Russian translations to `src/i18n/ru.json`:

```json
"messages": {
  "title": "Сообщения",
  "conversations": "Беседы",
  "newConversation": "Новая беседа",
  "noConversations": "Нет бесед",
  "noConversationsDesc": "Начните новую беседу",
  "searchConversations": "Поиск бесед",
  "typeMessage": "Введите сообщение...",
  "send": "Отправить",
  "reply": "Ответить",
  "edit": "Редактировать",
  "delete": "Удалить",
  "pin": "Закрепить",
  "unpin": "Открепить",
  "edited": "изменено",
  "deleted": "удалено",
  "you": "Вы",
  "online": "Онлайн",
  "offline": "Офлайн",
  "members": "Участники",
  "addMembers": "Добавить участников",
  "leaveConversation": "Покинуть",
  "conversationInfo": "Информация о беседе",
  "direct": "Личное",
  "group": "Групповое",
  "classGroup": "Классное",
  "announcement": "Объявление",
  "today": "Сегодня",
  "yesterday": "Вчера",
  "attachFile": "Прикрепить файл",
  "replyTo": "Ответ на",
  "messageDeleted": "Сообщение удалено",
  "searchUsers": "Поиск пользователей",
  "selectUser": "Выберите пользователя",
  "noMessages": "Нет сообщений",
  "noMessagesDesc": "Отправьте первое сообщение",
  "startConversation": "Начните беседу",
  "moduleDisabled": "Модуль сообщений отключён",
  "noAccess": "У вас нет доступа к этому разделу"
}
```

- [ ] **Step 2: Create the messaging module layout with guard**

Create `src/app/(dashboard)/messages/layout.tsx`:

```typescript
import { isModuleAccessible } from "@/lib/modules/check";
import { ErrorState } from "@/components/ui/error-state";
import { getTranslations } from "next-intl/server";

export default async function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const accessible = await isModuleAccessible("messages");

  if (!accessible) {
    const t = await getTranslations("messages");
    return (
      <ErrorState
        title={t("moduleDisabled")}
        description={t("noAccess")}
      />
    );
  }

  return <>{children}</>;
}
```

- [ ] **Step 3: Create server actions for loading conversations**

Create `src/app/(dashboard)/messages/actions.ts`:

```typescript
"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { canPerformAction } from "@/lib/modules/check";
import { redirect } from "next/navigation";

export async function getConversations() {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const canRead = await canPerformAction("messages", "messages.read");
  if (!canRead) return [];

  const supabase = await createServerClient();

  // Get conversations where user is a member
  const { data: memberships } = await supabase
    .from("conversation_members" as never)
    .select("conversation_id" as never)
    .eq("user_id" as never, user.id);

  if (!memberships || memberships.length === 0) return [];

  const conversationIds = (memberships as Array<{ conversation_id: string }>).map(
    (m) => m.conversation_id
  );

  const { data: conversations } = await supabase
    .from("conversations" as never)
    .select("*" as never)
    .in("id" as never, conversationIds)
    .eq("is_active" as never, true)
    .order("updated_at" as never, { ascending: false });

  if (!conversations) return [];

  // For each conversation, get last message + unread count + members
  const result = [];
  for (const conv of conversations as Array<Record<string, unknown>>) {
    const { data: lastMsg } = await supabase
      .from("messages" as never)
      .select("content, sender_id, created_at, type" as never)
      .eq("conversation_id" as never, conv.id)
      .eq("is_deleted" as never, false)
      .order("created_at" as never, { ascending: false })
      .limit(1)
      .single();

    const { data: membership } = await supabase
      .from("conversation_members" as never)
      .select("last_read_at" as never)
      .eq("conversation_id" as never, conv.id)
      .eq("user_id" as never, user.id)
      .single();

    const lastReadAt = (membership as Record<string, unknown> | null)?.last_read_at as string | null;

    let unreadCount = 0;
    if (lastReadAt) {
      const { count } = await supabase
        .from("messages" as never)
        .select("id" as never, { count: "exact", head: true })
        .eq("conversation_id" as never, conv.id)
        .eq("is_deleted" as never, false)
        .gt("created_at" as never, lastReadAt);
      unreadCount = count ?? 0;
    }

    const { data: members } = await supabase
      .from("conversation_members" as never)
      .select(`
        user_id,
        role,
        users!inner(first_name, last_name, avatar_url)
      ` as never)
      .eq("conversation_id" as never, conv.id)
      .limit(5);

    const membersList = (members as Array<Record<string, unknown>> | null)?.map((m) => {
      const u = m.users as Record<string, unknown>;
      return {
        userId: m.user_id as string,
        firstName: u.first_name as string,
        lastName: u.last_name as string,
        avatarUrl: u.avatar_url as string | null,
        role: m.role as string,
      };
    }) ?? [];

    const lastMessage = lastMsg as Record<string, unknown> | null;

    result.push({
      id: conv.id as string,
      type: conv.type as string,
      name: conv.name as string | null,
      avatarUrl: conv.avatar_url as string | null,
      classId: conv.class_id as string | null,
      isActive: conv.is_active as boolean,
      updatedAt: conv.updated_at as string,
      lastMessage: lastMessage ? {
        content: lastMessage.content as string,
        senderId: lastMessage.sender_id as string,
        createdAt: lastMessage.created_at as string,
        type: lastMessage.type as string,
      } : null,
      unreadCount,
      members: membersList,
    });
  }

  return result;
}
```

- [ ] **Step 4: Create conversations list client component**

Create `src/app/(dashboard)/messages/conversations-list.tsx`:

```typescript
"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { MessageSquare, Users, Megaphone, User } from "lucide-react";
import Link from "next/link";

interface ConversationMember {
  userId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role: string;
}

export interface ConversationItem {
  id: string;
  type: string;
  name: string | null;
  avatarUrl: string | null;
  classId: string | null;
  isActive: boolean;
  updatedAt: string;
  lastMessage: {
    content: string;
    senderId: string;
    createdAt: string;
    type: string;
  } | null;
  unreadCount: number;
  members: ConversationMember[];
}

function getConversationName(conv: ConversationItem, currentUserId: string): string {
  if (conv.name) return conv.name;
  if (conv.type === "direct") {
    const other = conv.members.find((m) => m.userId !== currentUserId);
    return other ? `${other.firstName} ${other.lastName}` : "...";
  }
  return conv.members.map((m) => m.firstName).join(", ");
}

function getConversationIcon(type: string) {
  switch (type) {
    case "direct": return User;
    case "group": return Users;
    case "announcement": return Megaphone;
    case "class_group": return Users;
    default: return MessageSquare;
  }
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays === 1) return "Дирӯз";
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: "short" });
  }
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}

export function ConversationsList({
  conversations,
  currentUserId,
  activeConversationId,
}: {
  conversations: ConversationItem[];
  currentUserId: string;
  activeConversationId?: string;
}) {
  const t = useTranslations("messages");

  if (conversations.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquare className="h-12 w-12" />}
        title={t("noConversations")}
        description={t("noConversationsDesc")}
      />
    );
  }

  return (
    <div className="flex flex-col">
      {conversations.map((conv) => {
        const Icon = getConversationIcon(conv.type);
        const name = getConversationName(conv, currentUserId);
        const isActive = conv.id === activeConversationId;

        return (
          <Link
            key={conv.id}
            href={`/messages/${conv.id}`}
            className={cn(
              "flex items-center gap-3 border-b border-neutral-100 px-4 py-3 transition-colors duration-[var(--duration-fast)]",
              isActive
                ? "bg-primary-50 border-l-2 border-l-primary-500"
                : "hover:bg-neutral-50"
            )}
          >
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarFallback className="bg-primary-100 text-primary-700">
                <Icon className="h-5 w-5" />
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className={cn(
                  "truncate text-sm",
                  conv.unreadCount > 0 ? "font-semibold text-neutral-900" : "font-medium text-neutral-700"
                )}>
                  {name}
                </span>
                {conv.lastMessage && (
                  <span className="shrink-0 text-xs text-neutral-400">
                    {formatTime(conv.lastMessage.createdAt)}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <p className={cn(
                  "truncate text-xs",
                  conv.unreadCount > 0 ? "font-medium text-neutral-600" : "text-neutral-400"
                )}>
                  {conv.lastMessage?.content || t("noMessages")}
                </p>
                {conv.unreadCount > 0 && (
                  <Badge className="ml-2 h-5 min-w-[20px] shrink-0 rounded-full bg-primary-500 px-1.5 text-[10px] text-white">
                    {conv.unreadCount}
                  </Badge>
                )}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Create the main messages page**

Create `src/app/(dashboard)/messages/page.tsx`:

```typescript
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getConversations } from "./actions";
import { ConversationsList } from "./conversations-list";
import { EmptyState } from "@/components/ui/empty-state";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function MessagesPage() {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const t = await getTranslations("messages");
  const conversations = await getConversations();

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-xl border border-neutral-200 bg-white">
      {/* Sidebar: conversation list */}
      <div className="flex w-full flex-col border-r border-neutral-200 lg:w-80 xl:w-96">
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <h1 className="text-lg font-semibold text-neutral-900">
            {t("title")}
          </h1>
          <Link href="/messages/new">
            <Button size="sm" variant="default">
              {t("newConversation")}
            </Button>
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ConversationsList
            conversations={conversations}
            currentUserId={user.id}
          />
        </div>
      </div>

      {/* Main area: empty state on desktop when no conversation selected */}
      <div className="hidden flex-1 items-center justify-center lg:flex">
        <EmptyState
          icon={<MessageSquare className="h-16 w-16" />}
          title={t("startConversation")}
          description={t("noConversationsDesc")}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors related to the new files.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/messages/ src/i18n/tg.json src/i18n/ru.json
git commit -m "feat: add messaging module layout with guard and conversation list"
```

---

### Task 2: Conversation Thread — Message List + Send

**Files:**
- Create: `src/app/(dashboard)/messages/[conversationId]/page.tsx`
- Create: `src/app/(dashboard)/messages/[conversationId]/message-thread.tsx`
- Create: `src/app/(dashboard)/messages/[conversationId]/message-input.tsx`
- Create: `src/app/(dashboard)/messages/[conversationId]/actions.ts`

**Interfaces:**
- Consumes: `ConversationItem` from Task 1, `getUserWithRole()`, `createServerClient()`, `canPerformAction("messages", "messages.create")`, `Avatar`, `Badge`, `Button`, `Input` from UI components
- Produces: `MessageItem` interface (id, conversationId, senderId, senderName, senderAvatar, content, type, replyToId, replyToContent, isPinned, isEdited, isDeleted, createdAt), `sendMessageAction(conversationId: string, content: string, replyToId?: string)`, `MessageThread` client component, `MessageInput` client component

- [ ] **Step 1: Create server actions for messages**

Create `src/app/(dashboard)/messages/[conversationId]/actions.ts`:

```typescript
"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { canPerformAction } from "@/lib/modules/check";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const sendMessageSchema = z.object({
  content: z.string().min(1).max(5000),
});

export async function getMessages(conversationId: string) {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const canRead = await canPerformAction("messages", "messages.read");
  if (!canRead) return { messages: [], conversationName: "" };

  const supabase = await createServerClient();

  // Verify user is member of conversation (defense in depth — RLS also enforces)
  const { data: membership } = await supabase
    .from("conversation_members" as never)
    .select("id" as never)
    .eq("conversation_id" as never, conversationId)
    .eq("user_id" as never, user.id)
    .single();

  if (!membership) return { messages: [], conversationName: "" };

  // Get conversation info
  const { data: conv } = await supabase
    .from("conversations" as never)
    .select("name, type, class_id" as never)
    .eq("id" as never, conversationId)
    .single();

  // Get messages with sender info
  const { data: messages } = await supabase
    .from("messages" as never)
    .select(`
      id, content, type, sender_id, reply_to_id,
      is_pinned, is_edited, is_deleted,
      created_at, edited_at,
      users:sender_id(first_name, last_name, avatar_url)
    ` as never)
    .eq("conversation_id" as never, conversationId)
    .order("created_at" as never, { ascending: true })
    .limit(100);

  // Get members for conversation name resolution
  const { data: members } = await supabase
    .from("conversation_members" as never)
    .select(`
      user_id, role,
      users!inner(first_name, last_name, avatar_url)
    ` as never)
    .eq("conversation_id" as never, conversationId);

  // Update last_read_at
  await supabase
    .from("conversation_members" as never)
    .update({ last_read_at: new Date().toISOString() } as never)
    .eq("conversation_id" as never, conversationId)
    .eq("user_id" as never, user.id);

  const convData = conv as Record<string, unknown> | null;
  let conversationName = (convData?.name as string) || "";
  if (!conversationName && convData?.type === "direct") {
    const otherMember = (members as Array<Record<string, unknown>> | null)?.find(
      (m) => m.user_id !== user.id
    );
    if (otherMember) {
      const u = otherMember.users as Record<string, unknown>;
      conversationName = `${u.first_name} ${u.last_name}`;
    }
  }

  const formattedMessages = ((messages as Array<Record<string, unknown>>) ?? []).map((msg) => {
    const sender = msg.users as Record<string, unknown> | null;
    return {
      id: msg.id as string,
      conversationId,
      senderId: msg.sender_id as string | null,
      senderName: sender ? `${sender.first_name} ${sender.last_name}` : "Система",
      senderAvatar: sender?.avatar_url as string | null,
      content: msg.content as string,
      type: msg.type as string,
      replyToId: msg.reply_to_id as string | null,
      isPinned: msg.is_pinned as boolean,
      isEdited: msg.is_edited as boolean,
      isDeleted: msg.is_deleted as boolean,
      createdAt: msg.created_at as string,
    };
  });

  const membersList = ((members as Array<Record<string, unknown>>) ?? []).map((m) => {
    const u = m.users as Record<string, unknown>;
    return {
      userId: m.user_id as string,
      firstName: u.first_name as string,
      lastName: u.last_name as string,
      avatarUrl: u.avatar_url as string | null,
      role: m.role as string,
    };
  });

  return {
    messages: formattedMessages,
    conversationName,
    conversationType: convData?.type as string,
    members: membersList,
  };
}

export async function sendMessageAction(
  conversationId: string,
  replyToId: string | null,
  _prev: { error: string | null },
  formData: FormData
) {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const canSend = await canPerformAction("messages", "messages.create");
  if (!canSend) return { error: "Дастрасӣ манъ аст" };

  const content = formData.get("content") as string;
  const parsed = sendMessageSchema.safeParse({ content });
  if (!parsed.success) return { error: "Паём холӣ аст" };

  const supabase = await createServerClient();

  // Verify membership (defense in depth)
  const { data: membership } = await supabase
    .from("conversation_members" as never)
    .select("id" as never)
    .eq("conversation_id" as never, conversationId)
    .eq("user_id" as never, user.id)
    .single();

  if (!membership) return { error: "Шумо аъзои ин суҳбат нестед" };

  const { error } = await supabase
    .from("messages" as never)
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      school_id: user.schoolId,
      content: parsed.data.content,
      type: "text",
      reply_to_id: replyToId,
    } as never);

  if (error) return { error: "Хатои фиристодан" };

  // Update conversation updated_at for sorting
  await supabase
    .from("conversations" as never)
    .update({ updated_at: new Date().toISOString() } as never)
    .eq("id" as never, conversationId);

  revalidatePath("/messages");
  return { error: null };
}
```

- [ ] **Step 2: Create the message thread component**

Create `src/app/(dashboard)/messages/[conversationId]/message-thread.tsx`:

```typescript
"use client";

import { useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Pin, Reply } from "lucide-react";

export interface MessageItem {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderName: string;
  senderAvatar: string | null;
  content: string;
  type: string;
  replyToId: string | null;
  isPinned: boolean;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: string;
}

function formatMessageTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MessageBubble({
  message,
  isOwn,
  onReply,
  allMessages,
}: {
  message: MessageItem;
  isOwn: boolean;
  onReply: (id: string) => void;
  allMessages: MessageItem[];
}) {
  const t = useTranslations("messages");

  const replyTarget = message.replyToId
    ? allMessages.find((m) => m.id === message.replyToId)
    : null;

  if (message.isDeleted) {
    return (
      <div className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
        <div className="rounded-2xl bg-neutral-100 px-4 py-2 text-sm italic text-neutral-400">
          {t("messageDeleted")}
        </div>
      </div>
    );
  }

  if (message.type === "system") {
    return (
      <div className="py-2 text-center text-xs text-neutral-400">
        {message.content}
      </div>
    );
  }

  return (
    <div className={cn("group flex gap-2", isOwn ? "flex-row-reverse" : "flex-row")}>
      {!isOwn && (
        <Avatar className="mt-1 h-8 w-8 shrink-0">
          <AvatarFallback className="bg-primary-100 text-xs text-primary-700">
            {message.senderName.charAt(0)}
          </AvatarFallback>
        </Avatar>
      )}
      <div className={cn("max-w-[75%]", isOwn ? "items-end" : "items-start")}>
        {!isOwn && (
          <span className="mb-0.5 block text-xs font-medium text-neutral-500">
            {message.senderName}
          </span>
        )}
        {replyTarget && (
          <div className="mb-1 rounded-lg border-l-2 border-primary-300 bg-primary-50 px-3 py-1 text-xs text-neutral-500">
            <span className="font-medium">{replyTarget.senderName}:</span>{" "}
            {replyTarget.content.slice(0, 80)}
          </div>
        )}
        <div
          className={cn(
            "rounded-2xl px-4 py-2 text-sm transition-shadow duration-[var(--duration-fast)]",
            isOwn
              ? "bg-primary-500 text-white"
              : "bg-neutral-100 text-neutral-800"
          )}
        >
          {message.content}
        </div>
        <div className={cn("mt-0.5 flex items-center gap-1 text-[10px] text-neutral-400",
          isOwn ? "justify-end" : "justify-start"
        )}>
          {formatMessageTime(message.createdAt)}
          {message.isEdited && <span>· {t("edited")}</span>}
          {message.isPinned && <Pin className="h-3 w-3" />}
          <button
            type="button"
            onClick={() => onReply(message.id)}
            className="ml-1 opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover:opacity-100"
          >
            <Reply className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function MessageThread({
  messages,
  currentUserId,
  onReply,
}: {
  messages: MessageItem[];
  currentUserId: string;
  onReply: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  return (
    <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          isOwn={msg.senderId === currentUserId}
          onReply={onReply}
          allMessages={messages}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create the message input component**

Create `src/app/(dashboard)/messages/[conversationId]/message-input.tsx`:

```typescript
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
  const [state, action, isPending] = useActionState(boundAction, { error: null });

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
```

- [ ] **Step 4: Create the conversation page (server component)**

Create `src/app/(dashboard)/messages/[conversationId]/page.tsx`:

```typescript
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { redirect } from "next/navigation";
import { getMessages } from "./actions";
import { getConversations } from "../actions";
import { ConversationView } from "./conversation-view";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const [messageData, conversations] = await Promise.all([
    getMessages(conversationId),
    getConversations(),
  ]);

  return (
    <ConversationView
      conversationId={conversationId}
      currentUserId={user.id}
      messages={messageData.messages}
      conversationName={messageData.conversationName}
      conversationType={messageData.conversationType ?? "direct"}
      members={messageData.members ?? []}
      conversations={conversations}
    />
  );
}
```

Note: This page references `ConversationView`, a client wrapper that wires `MessageThread` + `MessageInput` + `ConversationsList`. Create it alongside:

Create `src/app/(dashboard)/messages/[conversationId]/conversation-view.tsx`:

```typescript
"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { MessageThread, type MessageItem } from "./message-thread";
import { MessageInput } from "./message-input";
import { ConversationsList, type ConversationItem } from "../conversations-list";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users, Megaphone, User, MessageSquare } from "lucide-react";
import Link from "next/link";

interface Member {
  userId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role: string;
}

function getTypeIcon(type: string) {
  switch (type) {
    case "direct": return User;
    case "group": return Users;
    case "announcement": return Megaphone;
    case "class_group": return Users;
    default: return MessageSquare;
  }
}

export function ConversationView({
  conversationId,
  currentUserId,
  messages,
  conversationName,
  conversationType,
  members,
  conversations,
}: {
  conversationId: string;
  currentUserId: string;
  messages: MessageItem[];
  conversationName: string;
  conversationType: string;
  members: Member[];
  conversations: ConversationItem[];
}) {
  const t = useTranslations("messages");
  const [replyToId, setReplyToId] = useState<string | null>(null);

  const replyToMessage = replyToId
    ? messages.find((m) => m.id === replyToId)
    : null;

  const handleReply = useCallback((id: string) => {
    setReplyToId(id);
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyToId(null);
  }, []);

  const Icon = getTypeIcon(conversationType);

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-xl border border-neutral-200 bg-white">
      {/* Sidebar: conversation list (hidden on mobile) */}
      <div className="hidden w-80 flex-col border-r border-neutral-200 lg:flex xl:w-96">
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-neutral-900">{t("title")}</h2>
          <Link href="/messages/new">
            <Button size="sm" variant="default">{t("newConversation")}</Button>
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ConversationsList
            conversations={conversations}
            currentUserId={currentUserId}
            activeConversationId={conversationId}
          />
        </div>
      </div>

      {/* Main: message thread */}
      <div className="flex flex-1 flex-col">
        {/* Thread header */}
        <div className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3">
          <Link href="/messages" className="lg:hidden">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <Icon className="h-5 w-5 text-neutral-400" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-neutral-900">
              {conversationName}
            </h2>
            <p className="text-xs text-neutral-400">
              {members.length} {t("members")}
            </p>
          </div>
        </div>

        <MessageThread
          messages={messages}
          currentUserId={currentUserId}
          onReply={handleReply}
        />

        <MessageInput
          conversationId={conversationId}
          replyToId={replyToId}
          replyToContent={replyToMessage?.content ?? null}
          onCancelReply={handleCancelReply}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors related to conversation thread files.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/messages/\[conversationId\]/
git commit -m "feat: add conversation thread with message list, send, and reply"
```

---

### Task 3: New Conversation — Contact Search + Create

**Files:**
- Create: `src/app/(dashboard)/messages/new/page.tsx`
- Create: `src/app/(dashboard)/messages/new/new-conversation-form.tsx`
- Create: `src/app/(dashboard)/messages/new/actions.ts`

**Interfaces:**
- Consumes: `getUserWithRole()`, `createServerClient()`, `canPerformAction("messages", "messages.create")`, `Button`, `Input`, `Avatar` from UI components
- Produces: `searchContactsAction(query: string): Promise<Contact[]>`, `createConversationAction(userId: string): redirects to /messages/[id]`, `Contact` interface (id, firstName, lastName, avatarUrl, role)

- [ ] **Step 1: Create server actions for contact search and conversation creation**

Create `src/app/(dashboard)/messages/new/actions.ts`:

```typescript
"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { canPerformAction } from "@/lib/modules/check";
import { redirect } from "next/navigation";
import { z } from "zod";

export async function searchContacts(query: string) {
  const user = await getUserWithRole();
  if (!user) return [];

  const canRead = await canPerformAction("messages", "messages.read");
  if (!canRead) return [];

  if (!query || query.length < 2) return [];

  const supabase = await createServerClient();

  // Search users in same school, exclude self, only active users
  // RLS ensures school isolation
  const { data: users } = await supabase
    .from("users" as never)
    .select(`
      id, first_name, last_name, avatar_url,
      user_roles(
        roles:role_id(name_tg, slug)
      )
    ` as never)
    .neq("id" as never, user.id)
    .eq("is_active" as never, true)
    .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%` as never)
    .limit(20);

  return ((users as Array<Record<string, unknown>>) ?? []).map((u) => {
    const roles = u.user_roles as Array<Record<string, unknown>> | null;
    const primaryRole = roles?.[0]?.roles as Record<string, unknown> | null;
    return {
      id: u.id as string,
      firstName: u.first_name as string,
      lastName: u.last_name as string,
      avatarUrl: u.avatar_url as string | null,
      roleName: (primaryRole?.name_tg as string) ?? "",
    };
  });
}

export async function createDirectConversation(targetUserId: string) {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const canCreate = await canPerformAction("messages", "messages.create");
  if (!canCreate) redirect("/messages?error=forbidden");

  const supabase = await createServerClient();

  // Check if direct conversation already exists between these two users
  const { data: existingMemberships } = await supabase
    .from("conversation_members" as never)
    .select("conversation_id" as never)
    .eq("user_id" as never, user.id);

  const { data: targetMemberships } = await supabase
    .from("conversation_members" as never)
    .select("conversation_id" as never)
    .eq("user_id" as never, targetUserId);

  const myConvIds = new Set(
    ((existingMemberships as Array<Record<string, unknown>>) ?? []).map(
      (m) => m.conversation_id as string
    )
  );
  const targetConvIds = ((targetMemberships as Array<Record<string, unknown>>) ?? []).map(
    (m) => m.conversation_id as string
  );
  const sharedConvIds = targetConvIds.filter((id) => myConvIds.has(id));

  if (sharedConvIds.length > 0) {
    // Check if any shared conversation is a direct type
    const { data: directConvs } = await supabase
      .from("conversations" as never)
      .select("id" as never)
      .in("id" as never, sharedConvIds)
      .eq("type" as never, "direct")
      .eq("is_active" as never, true)
      .limit(1);

    if (directConvs && (directConvs as Array<Record<string, unknown>>).length > 0) {
      const existing = (directConvs as Array<Record<string, unknown>>)[0];
      redirect(`/messages/${existing.id}`);
    }
  }

  // Create new direct conversation
  const { data: newConv, error: convError } = await supabase
    .from("conversations" as never)
    .insert({
      school_id: user.schoolId,
      type: "direct",
      created_by: user.id,
    } as never)
    .select("id" as never)
    .single();

  if (convError || !newConv) redirect("/messages?error=create_failed");

  const convId = (newConv as Record<string, unknown>).id as string;

  // Add both users as members
  await supabase
    .from("conversation_members" as never)
    .insert([
      {
        conversation_id: convId,
        user_id: user.id,
        school_id: user.schoolId,
        role: "admin",
      },
      {
        conversation_id: convId,
        user_id: targetUserId,
        school_id: user.schoolId,
        role: "member",
      },
    ] as never);

  redirect(`/messages/${convId}`);
}
```

- [ ] **Step 2: Create the new conversation form component**

Create `src/app/(dashboard)/messages/new/new-conversation-form.tsx`:

```typescript
"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { searchContacts, createDirectConversation } from "./actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, MessageSquare, User } from "lucide-react";

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  roleName: string;
}

export function NewConversationForm() {
  const t = useTranslations("messages");
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = useCallback(async (value: string) => {
    setQuery(value);
    if (value.length < 2) {
      setContacts([]);
      return;
    }
    setIsSearching(true);
    const results = await searchContacts(value);
    setContacts(results);
    setIsSearching(false);
  }, []);

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          {t("newConversation")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={t("searchUsers")}
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 py-2.5 pl-10 pr-4 text-sm outline-none transition-colors duration-[var(--duration-fast)] focus:border-primary-300 focus:bg-white"
          />
        </div>

        {isSearching && (
          <div className="py-4 text-center text-sm text-neutral-400">
            {t("searchUsers")}...
          </div>
        )}

        <div className="space-y-1">
          {contacts.map((contact) => (
            <form
              key={contact.id}
              action={createDirectConversation.bind(null, contact.id)}
            >
              <button
                type="submit"
                className="flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors duration-[var(--duration-fast)] hover:bg-neutral-50"
              >
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary-100 text-primary-700">
                    <User className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-neutral-800">
                    {contact.firstName} {contact.lastName}
                  </p>
                  {contact.roleName && (
                    <p className="text-xs text-neutral-400">{contact.roleName}</p>
                  )}
                </div>
              </button>
            </form>
          ))}
        </div>

        {query.length >= 2 && !isSearching && contacts.length === 0 && (
          <p className="py-4 text-center text-sm text-neutral-400">
            {t("noConversations")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Create the new conversation page**

Create `src/app/(dashboard)/messages/new/page.tsx`:

```typescript
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { redirect } from "next/navigation";
import { NewConversationForm } from "./new-conversation-form";

export default async function NewConversationPage() {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl py-8">
      <NewConversationForm />
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors related to new conversation files.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/messages/new/
git commit -m "feat: add new conversation page with contact search"
```

---

### Task 4: Message Actions — Edit, Delete, Pin

**Files:**
- Modify: `src/app/(dashboard)/messages/[conversationId]/actions.ts` (add edit/delete/pin actions)
- Modify: `src/app/(dashboard)/messages/[conversationId]/message-thread.tsx` (add action buttons)

**Interfaces:**
- Consumes: `getUserWithRole()`, `createServerClient()`, `canPerformAction("messages", "messages.manage")`, `hasPermission("messages.manage")`
- Produces: `editMessageAction(messageId: string, content: string)`, `deleteMessageAction(messageId: string)`, `pinMessageAction(messageId: string, isPinned: boolean)`

- [ ] **Step 1: Add server actions for edit, delete, pin**

Append to `src/app/(dashboard)/messages/[conversationId]/actions.ts`:

```typescript
export async function editMessageAction(
  messageId: string,
  _prev: { error: string | null },
  formData: FormData
) {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const content = formData.get("content") as string;
  const parsed = sendMessageSchema.safeParse({ content });
  if (!parsed.success) return { error: "Паём холӣ аст" };

  const supabase = await createServerClient();

  // Only allow editing own messages — RLS also enforces this
  const { error } = await supabase
    .from("messages" as never)
    .update({
      content: parsed.data.content,
      is_edited: true,
      edited_at: new Date().toISOString(),
    } as never)
    .eq("id" as never, messageId)
    .eq("sender_id" as never, user.id);

  if (error) return { error: "Хатои таҳрир" };

  revalidatePath("/messages");
  return { error: null };
}

export async function deleteMessageAction(messageId: string) {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const supabase = await createServerClient();

  // Soft delete own messages — RLS enforces sender_id = auth.uid()
  await supabase
    .from("messages" as never)
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    } as never)
    .eq("id" as never, messageId)
    .eq("sender_id" as never, user.id);

  revalidatePath("/messages");
}

export async function pinMessageAction(messageId: string, isPinned: boolean) {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  // Only users with messages.manage can pin
  const canManage = await canPerformAction("messages", "messages.manage");
  if (!canManage) return;

  const supabase = await createServerClient();

  await supabase
    .from("messages" as never)
    .update({ is_pinned: isPinned } as never)
    .eq("id" as never, messageId);

  revalidatePath("/messages");
}
```

- [ ] **Step 2: Add action menu to message bubbles**

Update `MessageBubble` in `message-thread.tsx` to include a dropdown with edit/delete/pin actions. Use the `.bind()` pattern for `deleteMessageAction.bind(null, message.id)` and `pinMessageAction.bind(null, message.id, !message.isPinned)`. For edit, toggle an inline edit form with `useActionState(editMessageAction.bind(null, message.id), { error: null })`.

The action menu should appear on hover (desktop) / long-press style (always visible on mobile as a subtle "..." button). Use `DropdownMenu` from `src/components/ui/dropdown-menu.tsx`.

Menu items:
- Reply (always visible, calls existing `onReply`)
- Edit (only for own messages, not deleted)
- Delete (only for own messages, not deleted)
- Pin/Unpin (only for users with `messages.manage` permission — pass `canManage: boolean` as prop)

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/messages/\[conversationId\]/
git commit -m "feat: add message edit, delete, and pin actions"
```

---

### Task 5: Realtime — Live Message Updates

**Files:**
- Create: `src/app/(dashboard)/messages/[conversationId]/use-realtime-messages.ts`
- Modify: `src/app/(dashboard)/messages/[conversationId]/conversation-view.tsx` (integrate realtime hook)

**Interfaces:**
- Consumes: `createClient()` from `src/lib/supabase/client.ts`, `MessageItem` from Task 2
- Produces: `useRealtimeMessages(conversationId: string, initialMessages: MessageItem[], currentUserId: string): MessageItem[]`

- [ ] **Step 1: Create the realtime messages hook**

Create `src/app/(dashboard)/messages/[conversationId]/use-realtime-messages.ts`:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MessageItem } from "./message-thread";

export function useRealtimeMessages(
  conversationId: string,
  initialMessages: MessageItem[],
  currentUserId: string
) {
  const [messages, setMessages] = useState(initialMessages);

  // Reset when conversation changes
  useEffect(() => {
    setMessages(initialMessages);
  }, [conversationId, initialMessages]);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes" as "system",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload: { new: Record<string, unknown> }) => {
          const newMsg = payload.new;

          // Don't duplicate if we sent it via the form (optimistic)
          if (newMsg.sender_id === currentUserId) return;

          // Fetch sender info
          const { data: sender } = await supabase
            .from("users" as never)
            .select("first_name, last_name, avatar_url" as never)
            .eq("id" as never, newMsg.sender_id)
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
        "postgres_changes" as "system",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const updated = payload.new;
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
      };
      setMessages((prev) => [...prev, optimistic]);
    },
    [conversationId, currentUserId]
  );

  return { messages, addOptimisticMessage };
}
```

- [ ] **Step 2: Integrate realtime hook into ConversationView**

Update `conversation-view.tsx` to use `useRealtimeMessages`:

Replace direct `messages` prop usage with:
```typescript
const { messages: liveMessages, addOptimisticMessage } = useRealtimeMessages(
  conversationId,
  messages,
  currentUserId
);
```

Pass `liveMessages` to `MessageThread` instead of `messages`.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/messages/\[conversationId\]/
git commit -m "feat: add realtime message updates via Supabase channels"
```

---

### Task 6: Conversation Info Panel + Member Management

**Files:**
- Create: `src/app/(dashboard)/messages/[conversationId]/conversation-info.tsx`
- Modify: `src/app/(dashboard)/messages/[conversationId]/actions.ts` (add member management actions)
- Modify: `src/app/(dashboard)/messages/[conversationId]/conversation-view.tsx` (add info panel toggle)

**Interfaces:**
- Consumes: `Member` type from Task 2, `getUserWithRole()`, `createServerClient()`, `canPerformAction("messages", "messages.manage")`, `Avatar`, `Badge`, `Button`, `Card`
- Produces: `ConversationInfo` component, `addMemberAction(conversationId, userId)`, `removeMemberAction(conversationId, userId)`, `leaveConversationAction(conversationId)`

- [ ] **Step 1: Add member management server actions**

Append to `src/app/(dashboard)/messages/[conversationId]/actions.ts`:

```typescript
export async function addMemberAction(conversationId: string, userId: string) {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const canManage = await canPerformAction("messages", "messages.manage");
  if (!canManage) return;

  const supabase = await createServerClient();

  await supabase
    .from("conversation_members" as never)
    .insert({
      conversation_id: conversationId,
      user_id: userId,
      school_id: user.schoolId,
      role: "member",
    } as never);

  revalidatePath("/messages");
}

export async function removeMemberAction(conversationId: string, userId: string) {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const canManage = await canPerformAction("messages", "messages.manage");
  if (!canManage) return;

  const supabase = await createServerClient();

  await supabase
    .from("conversation_members" as never)
    .delete()
    .eq("conversation_id" as never, conversationId)
    .eq("user_id" as never, userId);

  revalidatePath("/messages");
}

export async function leaveConversationAction(conversationId: string) {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const supabase = await createServerClient();

  await supabase
    .from("conversation_members" as never)
    .delete()
    .eq("conversation_id" as never, conversationId)
    .eq("user_id" as never, user.id);

  redirect("/messages");
}
```

- [ ] **Step 2: Create conversation info panel**

Create `src/app/(dashboard)/messages/[conversationId]/conversation-info.tsx`:

This component displays:
- Conversation name/type with icon
- Member list with names, roles, avatar initials
- "Leave conversation" button (calls `leaveConversationAction.bind(null, conversationId)`)
- For admins with `messages.manage`: "Remove" button per member (calls `removeMemberAction.bind(null, conversationId, member.userId)`)
- Slide-in from right on desktop, full-screen overlay on mobile
- Uses existing design tokens for animations

- [ ] **Step 3: Add info panel toggle to ConversationView**

Add an info icon button to the thread header. On click, toggle `showInfo` state. Render `ConversationInfo` conditionally on the right side.

- [ ] **Step 4: Verify TypeScript compiles and commit**

```bash
npx tsc --noEmit
git add src/app/\(dashboard\)/messages/\[conversationId\]/
git commit -m "feat: add conversation info panel with member management"
```

---

### Task 7: Build Verification and Visual Testing

**Files:**
- No new files

**Interfaces:**
- Consumes: All Task 1-6 outputs

- [ ] **Step 1: Run TypeScript compiler**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 2: Run production build**

Run: `npx next build`
Expected: build succeeds, messaging routes (`/messages`, `/messages/new`, `/messages/[conversationId]`) appear in output.

- [ ] **Step 3: Fix any build errors**

If Turbopack errors appear (especially inline `"use server"` violations), fix using `.bind()` pattern as established in Phase 2.

- [ ] **Step 4: Start dev server and verify**

Run: dev server on port 3000.

Check:
1. `/messages` route shows conversation list (or empty state if no data)
2. `/messages/new` shows contact search form
3. Login redirect works for unauthenticated users
4. Module guard shows error if messages module is disabled
5. No console errors, no server errors

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build issues in messaging module"
```

- [ ] **Step 6: Update progress ledger**

Update `.superpowers/sdd/<plan>/progress.md` with all task completions and commit hashes.
