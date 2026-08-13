# Phase 5: Polish, Integration & Production Readiness

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform placeholder pages into real data-driven views, add notifications/profiles/settings, polish UX/UI to premium iOS-like quality, verify security/i18n/responsive/accessibility, and produce a final production build.

**Architecture:** Server Components by default, Client Components only for interactivity (forms, toggles, realtime). All data flows through server actions with auth + school_id enforcement. Supabase RLS as the last defense line. Signed URLs for all storage access. No separate permissions for user-own-data operations — `auth.uid()` + RLS is sufficient.

**Tech Stack:** Next.js 16.3.0 (App Router, Turbopack), TypeScript strict (`noUncheckedIndexedAccess`), Supabase (PostgreSQL + Auth + RLS + Realtime + Storage), Tailwind CSS 4 (`@theme`), next-intl (tg default, ru secondary), Zod, Lucide React, cva, Radix UI.

## Global Constraints

- `params` and `searchParams` are `Promise` — must `await` them
- Inline `"use server"` closures inside `"use client"` components are NOT allowed — use `.bind()` pattern
- `LayoutProps` type not available — use `{ children: React.ReactNode }`
- All Supabase queries use `as never` type assertions (database types are `Record<string, never>`)
- Every table query must scope by `school_id` (tenant isolation) or `user_id` (user-own-data)
- Server actions must verify auth (`getUserWithRole()`) before any DB operation; `user_id` and `school_id` always come from the server, never from form data
- Storage: private buckets, tenant-aware paths `{school_id}/{item_id}/{filename}`, signed URLs only
- i18n: every user-facing string must use `useTranslations()`/`getTranslations()` with keys in both `tg.json` and `ru.json`
- No hardcoded data — all values from DB
- Animations must serve UX purpose (help user understand state/transitions), not decoration
- `prefers-reduced-motion` must disable non-essential animations
- CSS custom properties for animation timing: `--duration-fast/normal/slow`, `--ease-default/spring/out/in`
- Error messages shown to users must be human-readable (i18n); never expose SQL/Supabase/stack traces
- Notification retention: read → 90 days, unread → 365 days; user can hard-delete only own read notifications; admin cannot delete other users' notifications

## Permissions Decision

**No new permissions created in Phase 5.** Analysis:

| Proposed Permission | Decision | Reason |
|---|---|---|
| `notifications.read` | **Not needed** | RLS `notifications_select` enforces `user_id = auth.uid()`. Server action checks `getUserWithRole()`. Every authenticated user sees only their own notifications. Adding a permission that's always granted to all roles is noise. |
| `profile.read` | **Not needed** | RLS `users_select` + `users_update_self` already allow reading/updating own record via `auth.uid()`. No scenario where a user should be denied access to their own profile. |
| `profile.update` | **Not needed** | RLS `users_update_self` restricts UPDATE to `id = auth.uid()`. Server action further limits editable fields to `phone`, `middle_name` only. Permission would duplicate RLS. |
| `settings.read` | **Not needed** | New `user_settings` table will have RLS scoped to `user_id = auth.uid()`. Identical to notifications case. |
| `settings.update` | **Not needed** | Same — RLS + server-side `getUserWithRole()` where `user_id` and `school_id` are set by the server. |

Existing `notifications.manage` (admin-only, for school notification_settings) remains unchanged.

---

## Summary: New Pages, Actions, DB Changes

### New Pages
| Route | Type | Description |
|---|---|---|
| `/dashboard` | **Modify** existing | Replace `--` placeholders with real stats scoped by user's school, role, and accessible modules |
| `/notifications` | **New** | Notification list with read/unread/mark/delete. Retention: read=90d, unread=365d |
| `/profile` | **New** | User profile view + edit (only `phone`, `middle_name` editable). Read-only: name, email, school, roles, publicId |
| `/settings` | **New** | User preferences: language (tg/ru), notification on/off per type |

### New Server Actions
| File | Actions | Auth Model |
|---|---|---|
| `src/app/(dashboard)/dashboard/actions.ts` | `getDashboardStats()` — counts scoped by school + user role + accessible modules | `getUserWithRole()` + `isModuleAccessible()` per stat |
| `src/app/(dashboard)/notifications/actions.ts` | `getNotifications()`, `markAsRead(id)`, `markAllAsRead()`, `deleteReadNotifications()`, `getUnreadCount()` | `getUserWithRole()` + RLS `user_id = auth.uid()` |
| `src/app/(dashboard)/profile/actions.ts` | `updateProfile(formData)` — only `phone`, `middle_name`; `user_id` from server | `getUserWithRole()` + RLS `users_update_self` |
| `src/app/(dashboard)/settings/actions.ts` | `getUserSettings()`, `updateUserSettings(formData)` — `user_id` and `school_id` from server, never from form | `getUserWithRole()` + RLS `user_id = auth.uid()` |

### Database Changes (new migration `00013_user_settings.sql`)

```sql
CREATE TABLE public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  locale VARCHAR(5) NOT NULL DEFAULT 'tg',
  notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  notification_types JSONB NOT NULL DEFAULT '{"message":true,"grade":true,"homework":true,"schedule":true,"attendance":true,"announcement":true,"document":true,"library":true,"system":true}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_settings_user_unique UNIQUE (user_id),
  CONSTRAINT user_settings_locale_check CHECK (locale IN ('tg', 'ru'))
);
```

**Security guarantees on `user_settings`:**
- `user_id` and `school_id` are set ONLY by the server action (from `getUserWithRole()`), never from form data
- RLS SELECT: `user_id = auth.uid()` — cannot read others' settings
- RLS INSERT: `user_id = auth.uid() AND school_id = current_user_school_id()` — cannot insert for others or wrong school
- RLS UPDATE: USING `user_id = auth.uid()` WITH CHECK `user_id = auth.uid()` — cannot change to another user
- No UPDATE policy allows changing `user_id` or `school_id` (they're not in the server action's update payload)
- No DELETE policy — settings cannot be deleted

### New Permissions
**None.** See Permissions Decision above.

### Parts Requiring Runtime Supabase
- Dashboard stats queries (counting real data)
- Notification CRUD (RLS enforcement)
- Profile self-update (RLS enforcement)
- Settings upsert (new table + RLS)
- Storage signed URLs (library covers/files)
- Full RLS policy verification
- Auth session refresh and middleware behavior
- Notification retention cleanup (requires cron/scheduled function)

---

## Task Breakdown

### Task 1: Database Migration — `user_settings` Table

**Files:**
- Create: `supabase/migrations/00013_user_settings.sql`

**Interfaces:**
- Produces: `user_settings` table with RLS policies enforcing `auth.uid()` ownership

- [ ] **Step 1: Create user_settings migration**

Create `supabase/migrations/00013_user_settings.sql`:

```sql
-- User settings for personal preferences
CREATE TABLE public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  locale VARCHAR(5) NOT NULL DEFAULT 'tg',
  notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  notification_types JSONB NOT NULL DEFAULT '{"message":true,"grade":true,"homework":true,"schedule":true,"attendance":true,"announcement":true,"document":true,"library":true,"system":true}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_settings_user_unique UNIQUE (user_id),
  CONSTRAINT user_settings_locale_check CHECK (locale IN ('tg', 'ru'))
);

CREATE INDEX idx_user_settings_user ON public.user_settings(user_id);

-- RLS: user can only access their own settings
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_settings_select ON public.user_settings FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY user_settings_insert ON public.user_settings FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND school_id = public.current_user_school_id());

CREATE POLICY user_settings_update ON public.user_settings FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND school_id = public.current_user_school_id());

-- No DELETE policy — settings are never deleted, only updated

-- Trigger for updated_at
CREATE TRIGGER set_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00013_user_settings.sql
git commit -m "feat: add user_settings table with RLS scoped to auth.uid()"
```

---

### Task 2: Dashboard — Real Data from DB

**Files:**
- Create: `src/app/(dashboard)/dashboard/actions.ts`
- Modify: `src/app/(dashboard)/dashboard/page.tsx`
- Modify: `src/i18n/tg.json` — add `dashboard` section
- Modify: `src/i18n/ru.json` — add `dashboard` section

**Interfaces:**
- Consumes: `getUserWithRole()`, `createServerClient()`, `isModuleAccessible()`, `getTranslations()`, `StatCard`
- Produces: `getDashboardStats(): Promise<DashboardStats | null>`

**Dashboard scoping rules:**
- All counts scoped to user's `school_id`
- Notification count scoped to user's `user_id`
- Module stats shown ONLY if the user's role has access to that module (via `isModuleAccessible()`, not just `isModuleEnabled()`)
- Zero hardcoded values — everything from DB

- [ ] **Step 1: Create dashboard server actions**

Create `src/app/(dashboard)/dashboard/actions.ts`:

```typescript
"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { isModuleAccessible } from "@/lib/modules/check";

export interface DashboardStats {
  totalUsers: number;
  unreadNotifications: number;
  totalMessages: number | null;
  totalLibraryItems: number | null;
}

export async function getDashboardStats(): Promise<DashboardStats | null> {
  const user = await getUserWithRole();
  if (!user) return null;

  const supabase = await createServerClient();

  const [usersResult, notificationsResult, canAccessMessages, canAccessLibrary] =
    await Promise.all([
      supabase
        .from("users" as never)
        .select("id" as never, { count: "exact", head: true })
        .eq("school_id" as never, user.schoolId)
        .eq("is_active" as never, true),
      supabase
        .from("notifications" as never)
        .select("id" as never, { count: "exact", head: true })
        .eq("user_id" as never, user.id)
        .eq("is_read" as never, false),
      isModuleAccessible("messages"),
      isModuleAccessible("library"),
    ]);

  let totalMessages: number | null = null;
  if (canAccessMessages) {
    const { count } = await supabase
      .from("messages" as never)
      .select("id" as never, { count: "exact", head: true })
      .eq("school_id" as never, user.schoolId);
    totalMessages = count ?? 0;
  }

  let totalLibraryItems: number | null = null;
  if (canAccessLibrary) {
    const { count } = await supabase
      .from("library_items" as never)
      .select("id" as never, { count: "exact", head: true })
      .eq("school_id" as never, user.schoolId)
      .eq("is_published" as never, true);
    totalLibraryItems = count ?? 0;
  }

  return {
    totalUsers: usersResult.count ?? 0,
    unreadNotifications: notificationsResult.count ?? 0,
    totalMessages,
    totalLibraryItems,
  };
}
```

- [ ] **Step 2: Rewrite dashboard page with real data**

Rewrite `src/app/(dashboard)/dashboard/page.tsx` — Server Component, no `"use client"`:

```typescript
import { getTranslations } from "next-intl/server";
import { Users, MessageSquare, BookOpen, Bell } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { getDashboardStats } from "./actions";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const t = await getTranslations();
  const stats = await getDashboardStats();
  if (!stats) redirect("/login");

  return (
    <div className="space-y-6 animate-in">
      <h1 className="text-2xl font-bold text-neutral-900">
        {t("nav.dashboard")}
      </h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("dashboard.totalUsers")}
          value={stats.totalUsers}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label={t("dashboard.unreadNotifications")}
          value={stats.unreadNotifications}
          icon={<Bell className="h-5 w-5" />}
        />
        {stats.totalMessages !== null && (
          <StatCard
            label={t("dashboard.totalMessages")}
            value={stats.totalMessages}
            icon={<MessageSquare className="h-5 w-5" />}
          />
        )}
        {stats.totalLibraryItems !== null && (
          <StatCard
            label={t("dashboard.totalLibrary")}
            value={stats.totalLibraryItems}
            icon={<BookOpen className="h-5 w-5" />}
          />
        )}
      </div>
    </div>
  );
}
```

`null` means "user has no access to this module" → card not rendered (not shown with 0).

- [ ] **Step 3: Add i18n keys for dashboard**

Add `"dashboard"` section to `tg.json`:
```json
"dashboard": {
  "totalUsers": "Корбарон",
  "totalMessages": "Паёмҳо",
  "totalLibrary": "Китобҳо",
  "unreadNotifications": "Нахонда"
}
```

Add `"dashboard"` section to `ru.json`:
```json
"dashboard": {
  "totalUsers": "Пользователи",
  "totalMessages": "Сообщения",
  "totalLibrary": "Книги",
  "unreadNotifications": "Непрочитанные"
}
```

- [ ] **Step 4: Verify TypeScript compilation**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/dashboard/actions.ts src/app/(dashboard)/dashboard/page.tsx src/i18n/tg.json src/i18n/ru.json
git commit -m "feat: replace dashboard placeholders with real DB stats scoped by school/role/modules"
```

---

### Task 3: Notifications Page

**Files:**
- Create: `src/app/(dashboard)/notifications/actions.ts`
- Create: `src/app/(dashboard)/notifications/page.tsx`
- Create: `src/app/(dashboard)/notifications/notification-list.tsx`
- Modify: `src/components/layout/header.tsx` — bell links to `/notifications`
- Modify: `src/app/(dashboard)/layout.tsx` — pass unread count
- Modify: `src/app/(dashboard)/dashboard-shell.tsx` — accept + forward unread count
- Modify: `src/i18n/tg.json` — add `notifications` section
- Modify: `src/i18n/ru.json` — add `notifications` section

**Interfaces:**
- Consumes: `getUserWithRole()`, `createServerClient()`, `getTranslations()`
- Produces: `NotificationItem` interface, `getNotifications()`, `markAsRead(id)`, `markAllAsRead()`, `deleteReadNotifications()`, `getUnreadCount()`

**Retention policy (enforced):**
- Read notifications: retained 90 days (cleanup deferred to Supabase cron — not implemented here, documented as runtime requirement)
- Unread notifications: retained 365 days (same)
- User can hard-delete ONLY their own read notifications — enforced by RLS `notifications_delete_own_read` (`user_id = auth.uid() AND is_read = true`)
- Admin CANNOT delete other users' notifications — no admin delete policy exists and none will be added
- Server action `deleteReadNotifications()` additionally checks `getUserWithRole()` and only deletes where `user_id = user.id AND is_read = true`

- [ ] **Step 1: Create notification server actions**

Create `src/app/(dashboard)/notifications/actions.ts`:

```typescript
"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";

export interface NotificationItem {
  id: string;
  type: string;
  module: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export async function getNotifications(): Promise<NotificationItem[]> {
  const user = await getUserWithRole();
  if (!user) return [];

  const supabase = await createServerClient();
  const { data } = await supabase
    .from("notifications" as never)
    .select("*" as never)
    .eq("user_id" as never, user.id)
    .order("created_at" as never, { ascending: false })
    .limit(100);

  if (!data) return [];

  return (data as Array<Record<string, unknown>>).map((n) => ({
    id: n.id as string,
    type: n.type as string,
    module: n.module as string,
    title: n.title as string,
    body: n.body as string | null,
    data: n.data as Record<string, unknown> | null,
    isRead: n.is_read as boolean,
    readAt: n.read_at as string | null,
    createdAt: n.created_at as string,
  }));
}

export async function markAsRead(notificationId: string): Promise<void> {
  const user = await getUserWithRole();
  if (!user) return;

  const supabase = await createServerClient();
  await supabase
    .from("notifications" as never)
    .update({ is_read: true, read_at: new Date().toISOString() } as never)
    .eq("id" as never, notificationId as never)
    .eq("user_id" as never, user.id);
}

export async function markAllAsRead(): Promise<void> {
  const user = await getUserWithRole();
  if (!user) return;

  const supabase = await createServerClient();
  await supabase
    .from("notifications" as never)
    .update({ is_read: true, read_at: new Date().toISOString() } as never)
    .eq("user_id" as never, user.id)
    .eq("is_read" as never, false);
}

export async function deleteReadNotifications(): Promise<void> {
  const user = await getUserWithRole();
  if (!user) return;

  const supabase = await createServerClient();
  // RLS additionally enforces: user_id = auth.uid() AND is_read = true
  await supabase
    .from("notifications" as never)
    .delete()
    .eq("user_id" as never, user.id)
    .eq("is_read" as never, true);
}

export async function getUnreadCount(): Promise<number> {
  const user = await getUserWithRole();
  if (!user) return 0;

  const supabase = await createServerClient();
  const { count } = await supabase
    .from("notifications" as never)
    .select("id" as never, { count: "exact", head: true })
    .eq("user_id" as never, user.id)
    .eq("is_read" as never, false);

  return count ?? 0;
}
```

- [ ] **Step 2: Create notification list client component**

Create `src/app/(dashboard)/notifications/notification-list.tsx` — `"use client"`:

- List of notifications grouped by date (today / yesterday / earlier)
- Each notification row: type-specific icon, title, body preview (truncated), relative time, read/unread dot indicator
- Unread row has subtle `bg-primary-50` background with spring-like fade on mark-as-read
- Click row → calls `markAsRead.bind(null, id)` and navigates if `data.href` exists
- "Mark all as read" button — `markAllAsRead.bind(null)` as form action
- "Delete read" button — `deleteReadNotifications.bind(null)` as form action, with confirmation dialog
- `EmptyState` with `Bell` icon when no notifications
- Type-specific icons: `MessageSquare` (message), `GraduationCap` (grade), `FileText` (homework), `Calendar` (schedule), `ClipboardCheck` (attendance), `Megaphone` (announcement), `BookOpen` (library), `Settings` (system)
- Smooth transitions: items animate in with staggered `animation-delay`, read/unread state changes fade

- [ ] **Step 3: Create notifications page (server component)**

Create `src/app/(dashboard)/notifications/page.tsx` — Server Component:

```typescript
import { getTranslations } from "next-intl/server";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { redirect } from "next/navigation";
import { getNotifications } from "./actions";
import { NotificationList } from "./notification-list";

export default async function NotificationsPage() {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const t = await getTranslations("notifications");
  const notifications = await getNotifications();

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6 animate-in">
      <h1 className="text-2xl font-bold text-neutral-900">{t("title")}</h1>
      <NotificationList notifications={notifications} />
    </div>
  );
}
```

- [ ] **Step 4: Add i18n keys for notifications**

Add `"notifications"` section to `tg.json`:
```json
"notifications": {
  "title": "Огоҳиномаҳо",
  "markAllRead": "Ҳамаро хонда қайд кардан",
  "deleteRead": "Хондашударо нест кардан",
  "deleteReadConfirm": "Шумо мутмаин ҳастед? Ин амал бозгашт надорад.",
  "noNotifications": "Огоҳиномае нест",
  "noNotificationsDesc": "Ҳангоми пайдо шудани огоҳиномаи нав, инҷо намоиш дода мешавад",
  "today": "Имрӯз",
  "yesterday": "Дирӯз",
  "earlier": "Пештар",
  "justNow": "Ҳоло",
  "minutesAgo": "{count} дақиқа пеш",
  "hoursAgo": "{count} соат пеш",
  "daysAgo": "{count} рӯз пеш"
}
```

Add `"notifications"` section to `ru.json`:
```json
"notifications": {
  "title": "Уведомления",
  "markAllRead": "Отметить все прочитанными",
  "deleteRead": "Удалить прочитанные",
  "deleteReadConfirm": "Вы уверены? Это действие необратимо.",
  "noNotifications": "Нет уведомлений",
  "noNotificationsDesc": "Новые уведомления появятся здесь",
  "today": "Сегодня",
  "yesterday": "Вчера",
  "earlier": "Ранее",
  "justNow": "Только что",
  "minutesAgo": "{count} мин. назад",
  "hoursAgo": "{count} ч. назад",
  "daysAgo": "{count} дн. назад"
}
```

- [ ] **Step 5: Wire notification bell in Header and layout**

Modify `src/components/layout/header.tsx`: wrap Bell button in `Link href="/notifications"`.

Modify `src/app/(dashboard)/dashboard-shell.tsx`: add `notificationCount` prop, pass to `Header`.

Modify `src/app/(dashboard)/layout.tsx`: call `getUnreadCount()` and pass result to `DashboardShell`.

- [ ] **Step 6: Verify TypeScript compilation**

Run: `npx tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add src/app/(dashboard)/notifications/ src/components/layout/header.tsx src/app/(dashboard)/layout.tsx src/app/(dashboard)/dashboard-shell.tsx src/i18n/tg.json src/i18n/ru.json
git commit -m "feat: add notifications page with retention-aware read/delete and header badge"
```

---

### Task 4: Profile Page

**Files:**
- Create: `src/app/(dashboard)/profile/actions.ts`
- Create: `src/app/(dashboard)/profile/page.tsx`
- Create: `src/app/(dashboard)/profile/profile-form.tsx`
- Modify: `src/i18n/tg.json` — extend `profile` section
- Modify: `src/i18n/ru.json` — extend `profile` section

**Interfaces:**
- Consumes: `getUserWithRole()`, `createServerClient()`, `getTranslations()`
- Produces: `getFullProfile()`, `updateProfile(formData)`

**Security rules:**
- `user_id` comes from `getUserWithRole()`, never from form data
- Only `phone` and `middle_name` are accepted from form — all other fields ignored
- RLS `users_update_self` enforces `id = auth.uid()` at DB level
- Read-only display: first_name, last_name, email, publicId, school, roles, date_of_birth, gender
- Avatar upload deferred to runtime Supabase (noted in UI as disabled)

- [ ] **Step 1: Create profile server actions**

Create `src/app/(dashboard)/profile/actions.ts`:

```typescript
"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { z } from "zod";

export interface FullProfile {
  id: string;
  publicId: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  email: string;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  avatarUrl: string | null;
  schoolName: string;
  roles: Array<{ nameTg: string; nameRu: string }>;
}

export async function getFullProfile(): Promise<FullProfile | null> {
  const user = await getUserWithRole();
  if (!user) return null;

  const supabase = await createServerClient();
  const { data } = await supabase
    .from("users" as never)
    .select("public_id, first_name, last_name, middle_name, email, phone, date_of_birth, gender, avatar_url, schools!inner(name_tg)" as never)
    .eq("id" as never, user.id)
    .single();

  if (!data) return null;

  const row = data as Record<string, unknown>;
  const school = row.schools as Record<string, unknown>;

  return {
    id: user.id,
    publicId: row.public_id as string,
    firstName: row.first_name as string,
    lastName: row.last_name as string,
    middleName: row.middle_name as string | null,
    email: row.email as string,
    phone: row.phone as string | null,
    dateOfBirth: row.date_of_birth as string | null,
    gender: row.gender as string | null,
    avatarUrl: row.avatar_url as string | null,
    schoolName: school.name_tg as string,
    roles: user.roles.map((r) => ({ nameTg: r.nameTg, nameRu: r.nameRu })),
  };
}

const updateProfileSchema = z.object({
  phone: z.string().max(50).optional().or(z.literal("")),
  middle_name: z.string().max(100).optional().or(z.literal("")),
});

export async function updateProfile(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const user = await getUserWithRole();
  if (!user) return { error: "Unauthorized" };

  const parsed = updateProfileSchema.safeParse({
    phone: formData.get("phone"),
    middle_name: formData.get("middle_name"),
  });

  if (!parsed.success) return { error: "Validation failed" };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("users" as never)
    .update({
      phone: parsed.data.phone || null,
      middle_name: parsed.data.middle_name || null,
    } as never)
    .eq("id" as never, user.id);

  if (error) return { error: error.message };
  return { success: true };
}
```

- [ ] **Step 2: Create profile form (client component)**

Create `src/app/(dashboard)/profile/profile-form.tsx` — `"use client"`:

- `Avatar` component at top (read-only, no upload button yet)
- Read-only fields rendered as styled text (not disabled inputs): firstName, lastName, email, publicId, schoolName, roles (as badges), dateOfBirth, gender
- Editable fields: `phone` and `middle_name` as `<input>` with proper labels
- Uses `useActionState(updateProfile, null)`
- Save button with `loading={isPending}` state
- Success → show success message (toast or inline)
- Error → show human-readable error, never technical details

- [ ] **Step 3: Create profile page (server component)**

Create `src/app/(dashboard)/profile/page.tsx` — Server Component:

```typescript
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getFullProfile } from "./actions";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const t = await getTranslations("profile");
  const profile = await getFullProfile();
  if (!profile) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6 animate-in">
      <h1 className="text-2xl font-bold text-neutral-900">{t("title")}</h1>
      <ProfileForm profile={profile} />
    </div>
  );
}
```

- [ ] **Step 4: Add i18n keys for profile**

Extend `"profile"` section in `tg.json` with:
```json
"editProfile": "Таҳрири профил",
"saveChanges": "Нигоҳ доштан",
"profileUpdated": "Профил навсозӣ шуд",
"school": "Мактаб",
"roles": "Нақшҳо",
"readOnly": "Танҳо барои хондан",
"personalInfo": "Маълумоти шахсӣ",
"contactInfo": "Маълумоти тамос"
```

Extend `"profile"` section in `ru.json` with:
```json
"editProfile": "Редактировать профиль",
"saveChanges": "Сохранить",
"profileUpdated": "Профиль обновлён",
"school": "Школа",
"roles": "Роли",
"readOnly": "Только для чтения",
"personalInfo": "Личная информация",
"contactInfo": "Контактная информация"
```

- [ ] **Step 5: Verify TypeScript compilation**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/app/(dashboard)/profile/ src/i18n/tg.json src/i18n/ru.json
git commit -m "feat: add profile page with server-enforced editable fields"
```

---

### Task 5: Settings Page

**Files:**
- Create: `src/app/(dashboard)/settings/actions.ts`
- Create: `src/app/(dashboard)/settings/page.tsx`
- Create: `src/app/(dashboard)/settings/settings-form.tsx`
- Modify: `src/i18n/tg.json` — add `settings` section
- Modify: `src/i18n/ru.json` — add `settings` section

**Interfaces:**
- Consumes: `getUserWithRole()`, `createServerClient()`, `getTranslations()`
- Produces: `getUserSettings()`, `updateUserSettings(formData)`

**Security rules:**
- `user_id` and `school_id` set by server from `getUserWithRole()`, never from form
- Upsert uses `onConflict: "user_id"` — cannot create settings for another user
- RLS INSERT WITH CHECK: `user_id = auth.uid() AND school_id = current_user_school_id()`
- RLS UPDATE: `user_id = auth.uid()`
- Form only sends `locale` and notification toggles — no identity fields

- [ ] **Step 1: Create settings server actions**

Create `src/app/(dashboard)/settings/actions.ts`:

```typescript
"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { z } from "zod";

export interface UserSettings {
  locale: string;
  notificationsEnabled: boolean;
  notificationTypes: Record<string, boolean>;
}

const settingsSchema = z.object({
  locale: z.enum(["tg", "ru"]),
  notifications_enabled: z.coerce.boolean(),
  notification_message: z.coerce.boolean().optional(),
  notification_grade: z.coerce.boolean().optional(),
  notification_homework: z.coerce.boolean().optional(),
  notification_schedule: z.coerce.boolean().optional(),
  notification_attendance: z.coerce.boolean().optional(),
  notification_announcement: z.coerce.boolean().optional(),
  notification_library: z.coerce.boolean().optional(),
  notification_system: z.coerce.boolean().optional(),
});

export async function getUserSettings(): Promise<UserSettings> {
  const user = await getUserWithRole();
  if (!user) {
    return {
      locale: "tg",
      notificationsEnabled: true,
      notificationTypes: {
        message: true, grade: true, homework: true, schedule: true,
        attendance: true, announcement: true, library: true, system: true,
      },
    };
  }

  const supabase = await createServerClient();
  const { data } = await supabase
    .from("user_settings" as never)
    .select("locale, notifications_enabled, notification_types" as never)
    .eq("user_id" as never, user.id)
    .single();

  if (!data) {
    return {
      locale: "tg",
      notificationsEnabled: true,
      notificationTypes: {
        message: true, grade: true, homework: true, schedule: true,
        attendance: true, announcement: true, library: true, system: true,
      },
    };
  }

  const row = data as Record<string, unknown>;
  return {
    locale: row.locale as string,
    notificationsEnabled: row.notifications_enabled as boolean,
    notificationTypes: row.notification_types as Record<string, boolean>,
  };
}

export async function updateUserSettings(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const user = await getUserWithRole();
  if (!user) return { error: "Unauthorized" };

  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    raw[key] = value;
  }

  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) return { error: "Validation failed" };

  const notificationTypes: Record<string, boolean> = {
    message: parsed.data.notification_message ?? true,
    grade: parsed.data.notification_grade ?? true,
    homework: parsed.data.notification_homework ?? true,
    schedule: parsed.data.notification_schedule ?? true,
    attendance: parsed.data.notification_attendance ?? true,
    announcement: parsed.data.notification_announcement ?? true,
    library: parsed.data.notification_library ?? true,
    system: parsed.data.notification_system ?? true,
  };

  const supabase = await createServerClient();
  // user_id and school_id come from server — never from form
  const { error } = await supabase
    .from("user_settings" as never)
    .upsert(
      {
        user_id: user.id,
        school_id: user.schoolId,
        locale: parsed.data.locale,
        notifications_enabled: parsed.data.notifications_enabled,
        notification_types: notificationTypes,
      } as never,
      { onConflict: "user_id" as never }
    );

  if (error) return { error: error.message };
  return { success: true };
}
```

- [ ] **Step 2: Create settings form (client component)**

Create `src/app/(dashboard)/settings/settings-form.tsx` — `"use client"`:

- Language selector as two styled radio buttons (Тоҷикӣ / Русский), not a dropdown — iOS-like segmented control feel
- Card for notification settings:
  - Master toggle "Enable notifications" — iOS-like switch
  - Per-type toggles (message, grade, homework, schedule, attendance, announcement, library, system) — each as a row with label + switch
  - Disabled state when master toggle is off (visually muted, not interactive)
- Uses `useActionState(updateUserSettings, null)`
- Save button with `loading={isPending}`
- Success → inline success message with fade-in animation
- All labels via `useTranslations("settings")`

- [ ] **Step 3: Create settings page (server component)**

Create `src/app/(dashboard)/settings/page.tsx` — Server Component:

```typescript
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getUserSettings } from "./actions";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const user = await getUserWithRole();
  if (!user) redirect("/login");

  const t = await getTranslations("settings");
  const settings = await getUserSettings();

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6 animate-in">
      <h1 className="text-2xl font-bold text-neutral-900">{t("title")}</h1>
      <SettingsForm settings={settings} />
    </div>
  );
}
```

- [ ] **Step 4: Add i18n keys for settings**

Add `"settings"` section to `tg.json`:
```json
"settings": {
  "title": "Танзимот",
  "language": "Забон",
  "tajik": "Тоҷикӣ",
  "russian": "Русский",
  "notificationSettings": "Танзимоти огоҳиномаҳо",
  "enableNotifications": "Фаъол кардани огоҳиномаҳо",
  "notifMessage": "Паёмҳо",
  "notifGrade": "Баҳоҳо",
  "notifHomework": "Вазифаи хонагӣ",
  "notifSchedule": "Ҷадвал",
  "notifAttendance": "Ҳозирӣ",
  "notifAnnouncement": "Эълонҳо",
  "notifLibrary": "Китобхона",
  "notifSystem": "Системавӣ",
  "saved": "Танзимот нигоҳ дошта шуд"
}
```

Add `"settings"` section to `ru.json`:
```json
"settings": {
  "title": "Настройки",
  "language": "Язык",
  "tajik": "Таджикский",
  "russian": "Русский",
  "notificationSettings": "Настройки уведомлений",
  "enableNotifications": "Включить уведомления",
  "notifMessage": "Сообщения",
  "notifGrade": "Оценки",
  "notifHomework": "Домашние задания",
  "notifSchedule": "Расписание",
  "notifAttendance": "Посещаемость",
  "notifAnnouncement": "Объявления",
  "notifLibrary": "Библиотека",
  "notifSystem": "Системные",
  "saved": "Настройки сохранены"
}
```

- [ ] **Step 5: Verify TypeScript compilation**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/00013_user_settings.sql src/app/(dashboard)/settings/ src/i18n/tg.json src/i18n/ru.json
git commit -m "feat: add settings page with language and notification preferences"
```

---

### Task 6: UX/UI Polish — iOS-like Animations, Skeletons, Transitions

**Files:**
- Modify: `src/styles/globals.css` — page transitions, spring easing, micro-interactions
- Create: `src/app/(dashboard)/dashboard/loading.tsx`
- Create: `src/app/(dashboard)/notifications/loading.tsx`
- Create: `src/app/(dashboard)/profile/loading.tsx`
- Create: `src/app/(dashboard)/settings/loading.tsx`
- Create: `src/app/(dashboard)/library/loading.tsx`
- Create: `src/app/(dashboard)/messages/loading.tsx`
- Create: `src/app/(dashboard)/admin/loading.tsx`

**Interfaces:**
- Consumes: `Skeleton` component, CSS custom properties (`--duration-*`, `--ease-*`)
- Produces: Per-page loading skeletons, iOS-like animation system

**UX principles (not decoration):**
- Page transition: subtle fade+slide tells user "new content arrived"
- Skeleton loading: shows structure before data, prevents layout shift
- Spring micro-interactions: hover/press/focus feedback confirms user input
- Staggered list appearance: helps user scan new content
- Reduced motion: all non-essential animations disabled via `prefers-reduced-motion`
- No jarring layout shifts between mobile ↔ desktop

- [ ] **Step 1: Enhance animation system in globals.css**

Add to `src/styles/globals.css` (after existing animation variables):

```css
/* Page transitions */
@keyframes page-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-in {
  animation: page-in var(--duration-normal) var(--ease-out) both;
}

/* Staggered list items */
@keyframes list-item-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-list-item {
  animation: list-item-in var(--duration-fast) var(--ease-out) both;
}

/* Spring press feedback for interactive cards/buttons */
.press-scale {
  transition: transform var(--duration-fast) var(--ease-spring);
}
.press-scale:active {
  transform: scale(0.97);
}

/* Fade for state changes (read/unread, toggle) */
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.animate-fade-in {
  animation: fade-in var(--duration-fast) var(--ease-default) both;
}

/* Reduced motion: disable all non-essential animations */
@media (prefers-reduced-motion: reduce) {
  .animate-in,
  .animate-list-item,
  .animate-fade-in,
  .animate-scale-in {
    animation: none;
  }
  .press-scale:active {
    transform: none;
  }
}
```

- [ ] **Step 2: Create per-page loading skeletons**

Each `loading.tsx` mirrors its page's layout with `Skeleton` components:

**`dashboard/loading.tsx`:** title skeleton + 4-card grid skeletons
**`notifications/loading.tsx`:** title skeleton + action bar skeleton + 5 notification row skeletons (icon + text lines)
**`profile/loading.tsx`:** avatar circle skeleton + 6 field row skeletons in 2-col grid
**`settings/loading.tsx`:** title skeleton + 2 card skeletons (language + notifications)
**`library/loading.tsx`:** search bar skeleton + category pills skeleton + 8 book card skeletons in grid
**`messages/loading.tsx`:** conversation list skeleton (6 rows) + chat area skeleton
**`admin/loading.tsx`:** title skeleton + 4 stat card skeletons + table rows skeleton

All loading pages use `animate-in` class and responsive grid matching their page.

- [ ] **Step 3: Apply `animate-in` to all existing page root elements**

Verify every `page.tsx` root `<div>` has `className="... animate-in"`.

- [ ] **Step 4: Add `press-scale` to interactive cards**

Add `press-scale` class to:
- `StatCard` wrapper
- `BookCard` in library
- Notification rows
- Nav items in sidebar (hover state already exists, add press feedback)

- [ ] **Step 5: Verify TypeScript compilation**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/styles/globals.css src/app/(dashboard)/*/loading.tsx src/components/
git commit -m "feat: iOS-like animations, per-page loading skeletons, spring micro-interactions"
```

---

### Task 7: Error Boundaries & Playful Empty States

**Files:**
- Create: `src/app/(dashboard)/dashboard/error.tsx`
- Create: `src/app/(dashboard)/notifications/error.tsx`
- Create: `src/app/(dashboard)/profile/error.tsx`
- Create: `src/app/(dashboard)/settings/error.tsx`
- Create: `src/app/(dashboard)/library/error.tsx`
- Create: `src/app/(dashboard)/messages/error.tsx`
- Create: `src/app/(dashboard)/admin/error.tsx`
- Verify: `src/components/ui/error-state.tsx` uses playful characters
- Verify: all list pages use `EmptyState` with appropriate content

**Interfaces:**
- Consumes: `ErrorState` (with `PlayfulCharacters`), `EmptyState`, i18n `errors.*` keys
- Produces: Error boundary per section, consistent empty states

**Rules:**
- Error boundaries show human-readable message + playful character illustration
- Never expose SQL errors, Supabase errors, stack traces, or technical details to user
- Use existing `errors.generic` / `errors.genericDescription` i18n keys
- `onRetry` prop calls `reset()` to re-render the segment
- Empty states use existing `EmptyState` component with context-appropriate icon and i18n text

- [ ] **Step 1: Create error boundary for each section**

Each `error.tsx` follows the same pattern — `"use client"`:

```typescript
"use client";

import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/ui/error-state";

export default function SectionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  return (
    <div className="animate-in">
      <ErrorState
        title={t("generic")}
        description={t("genericDescription")}
        onRetry={reset}
      />
    </div>
  );
}
```

Create for: dashboard, notifications, profile, settings, library, messages, admin.

- [ ] **Step 2: Audit empty states across all list pages**

Verify each list page uses `EmptyState` when data is empty:
- Notifications: `Bell` icon + `noNotifications` / `noNotificationsDesc`
- Library browse: `BookOpen` icon + `noBooks` text
- Library favorites: `Heart` icon + `noFavorites` text (already exists)
- Library history: `Clock` icon + `noHistory` text (already exists)
- Messages: `MessageSquare` icon + `noMessages` text

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/*/error.tsx
git commit -m "feat: add error boundaries with playful characters for all dashboard sections"
```

---

### Task 8: Responsive Design Verification & Fixes

**Files:**
- Modify: various component files as needed

**Interfaces:**
- Consumes: all page components
- Produces: consistent responsive layout across mobile (375px+) / tablet (768px+) / desktop (1024px+)

**Verification checklist:**
- No horizontal scroll on any viewport
- Smooth transition between breakpoints (no layout jumps)
- Touch targets ≥ 44px on mobile
- Sidebar hidden on mobile, drawer works correctly
- Mobile nav closes on route change (already implemented)

- [ ] **Step 1: Audit and fix responsive grids**

Check every page:
- Dashboard: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` (stat cards)
- Notifications: single column, max-w-3xl centered
- Profile: `grid-cols-1 sm:grid-cols-2` for form fields, max-w-2xl
- Settings: single column, max-w-2xl
- Library browse: `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5` (book cards)
- Library detail: responsive metadata grid
- Messages: conversation list hidden on mobile when chat open, full-width chat
- Admin tables: `overflow-x-auto` wrapper

- [ ] **Step 2: Fix overflow and truncation**

- `overflow-x-auto` on all `<table>` containers
- `max-w-full` on all images
- `truncate` or `line-clamp-2` on long text (book titles, notification bodies)
- Library category horizontal scroll: `overflow-x-auto` with `-webkit-overflow-scrolling: touch`

- [ ] **Step 3: Verify padding and spacing consistency**

- Mobile: `p-4` main content
- Desktop: `p-6` main content (already in `dashboard-shell.tsx`: `p-4 lg:p-6`)
- Consistent `gap-4` between cards, `space-y-6` between sections

- [ ] **Step 4: Verify TypeScript compilation and build**

Run: `npx tsc --noEmit && npx next build`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: responsive layout fixes — grids, overflow, touch targets"
```

---

### Task 9: Accessibility — Keyboard, Focus, Contrast, ARIA

**Files:**
- Modify: `src/styles/globals.css` — focus-visible styles
- Modify: various component files

**Interfaces:**
- Consumes: all interactive components
- Produces: WCAG AA compliant UI

- [ ] **Step 1: Add global focus-visible styles**

Add to `globals.css`:
```css
:focus-visible {
  outline: 2px solid var(--color-primary-500);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
```

- [ ] **Step 2: Audit and fix ARIA attributes**

For each interactive element:
- Icon-only buttons: verify `aria-label` exists (Bell, Menu, Close, LogOut, etc.)
- Notification badge: add `aria-live="polite"` so screen readers announce count changes
- Active nav items: add `aria-current="page"`
- Toggle switches in settings: `role="switch"` + `aria-checked`
- Dialog (delete confirmation): verify `role="dialog"` + `aria-modal="true"` + focus trap
- Notification read/unread: `aria-label` includes read state

- [ ] **Step 3: Verify keyboard navigation**

Full keyboard flow:
- Tab through sidebar → main content → header actions
- Enter/Space activates buttons and links
- Escape closes mobile nav, dialogs, dropdowns
- Focus doesn't get trapped in hidden mobile nav

- [ ] **Step 4: Audit color contrast (WCAG AA)**

| Combination | Ratio | Status |
|---|---|---|
| `neutral-900` on white | 15.4:1 | ✓ headings |
| `neutral-700` on white | 8.6:1 | ✓ body text |
| `neutral-500` on white | 4.6:1 | ✓ secondary text |
| `neutral-400` on white | 3.1:1 | ✗ fails AA — change helper text to `neutral-500` |
| `primary-600` on white | 3.0:1 | acceptable for large text / interactive elements only |
| `error-600` on white | 4.6:1 | ✓ error text |
| White on `primary-600` | 3.0:1 | ✓ for large text on buttons |

Fix: replace `text-neutral-400` with `text-neutral-500` wherever it's used for meaningful text (not purely decorative elements).

- [ ] **Step 5: Verify TypeScript compilation**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/styles/globals.css src/components/ src/app/
git commit -m "fix: accessibility — focus-visible, ARIA, keyboard nav, contrast"
```

---

### Task 10: i18n Verification — Complete Tajik & Russian

**Files:**
- Modify: `src/i18n/tg.json`
- Modify: `src/i18n/ru.json`

**Interfaces:**
- Consumes: all `t("...")` calls across the codebase
- Produces: 100% key coverage in both language files

- [ ] **Step 1: Extract all translation keys from code**

```bash
grep -roh "t(\"[^\"]*\")" src/app src/components | sort -u > /tmp/keys.txt
grep -roh "getTranslations(\"[^\"]*\")" src/app | sort -u >> /tmp/keys.txt
```

- [ ] **Step 2: Cross-reference keys with both language files**

For every key used in code, verify it exists in both `tg.json` and `ru.json`. Add any missing keys.

- [ ] **Step 3: Verify new Phase 5 sections are complete**

Both files must have complete sections for:
- `dashboard` (4 keys)
- `notifications` (12 keys)
- `settings` (15 keys)
- `profile` (extended with 8+ new keys)

- [ ] **Step 4: Verify no orphaned keys**

Check for keys that exist in JSON but are never referenced in code. Remove any orphans.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/tg.json src/i18n/ru.json
git commit -m "fix: complete i18n coverage for Tajik and Russian"
```

---

### Task 11: Security Audit

**Files:**
- Audit-only, fixes as needed

**Interfaces:**
- Consumes: all server actions, RLS policies, middleware
- Produces: verified security posture

**Audit checklist (9 mandatory checks from user requirements):**

- [ ] **Step 1: Cross-school isolation**

For EVERY query in server actions, verify:
- `school_id` comes from `getUserWithRole().schoolId`, never from client
- No joins that could leak data across schools
- Storage paths validated with `startsWith(user.schoolId + "/")`

Files to audit:
- `src/app/(dashboard)/dashboard/actions.ts`
- `src/app/(dashboard)/notifications/actions.ts`
- `src/app/(dashboard)/profile/actions.ts`
- `src/app/(dashboard)/settings/actions.ts`
- `src/app/(dashboard)/library/actions.ts`
- `src/app/(dashboard)/library/[itemId]/actions.ts`
- `src/app/(dashboard)/messages/actions.ts`
- `src/app/(dashboard)/admin/library/actions.ts`
- `src/app/(dashboard)/admin/library/books/actions.ts`
- `src/app/(dashboard)/admin/*/actions.ts`
- `src/lib/storage/library.ts`

- [ ] **Step 2: RLS policy completeness**

Verify in migrations:
- Every table has `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- All SELECT policies scope by `school_id` or `user_id`
- UPDATE policies have both `USING` and `WITH CHECK`
- INSERT policies have `WITH CHECK` including `school_id`
- DELETE policies are restrictive (notifications: only own read; most tables: admin only)
- New `user_settings` table: all 3 policies correctly scope to `auth.uid()`

- [ ] **Step 3: Server actions auth verification**

For EVERY `actions.ts` file, verify:
1. First line after imports: `"use server"`
2. First operation: `getUserWithRole()` or `requireAdmin()`
3. Returns early if auth fails (null user → return empty/error)
4. Checks `hasPermission()` / `canPerformAction()` where module access is required
5. Uses Zod validation for ALL form inputs

- [ ] **Step 4: Impossible to spoof `user_id` or `school_id`**

Verify:
- `user_id` NEVER comes from `formData.get("user_id")` — always from `getUserWithRole().id`
- `school_id` NEVER comes from `formData.get("school_id")` — always from `getUserWithRole().schoolId`
- No server action accepts `user_id` or `school_id` as parameters from the client

- [ ] **Step 5: `auth.uid()` enforcement**

Verify all user-own-data operations use `auth.uid()` at both levels:
- Server action: `.eq("user_id", user.id)` where `user.id` comes from server
- RLS: `user_id = auth.uid()` as the USING clause

- [ ] **Step 6: Storage signed URLs**

Verify in `src/lib/storage/library.ts`:
- All signed URLs generated server-side via `createAdminClient()`
- Expiry is time-limited (1 hour)
- File download requires auth + `library.read` permission + `is_published` check
- Upload requires auth + `library.manage` permission
- Path validation: `filePath.startsWith(user.schoolId + "/")`
- No raw storage paths ever reach client components

- [ ] **Step 7: No sensitive data in client components**

Grep for sensitive patterns in `"use client"` files:
- No `school_id` in client-rendered HTML
- No user IDs in client-rendered HTML (except current user's own)
- No storage paths in client-rendered HTML
- No API keys, tokens, or secrets

- [ ] **Step 8: Direct URL access enforcement**

Verify every page route checks auth:
- `/dashboard` — `getUserWithRole()` → redirect if null
- `/notifications` — `getUserWithRole()` → redirect if null
- `/profile` — `getUserWithRole()` → redirect if null
- `/settings` — `getUserWithRole()` → redirect if null
- `/library/*` — `getUserWithRole()` + `isModuleAccessible("library")` + `canPerformAction("library", "library.read")`
- `/messages/*` — `getUserWithRole()` + module check
- `/admin/*` — `requireAdmin()` checks admin role slug

- [ ] **Step 9: Notification retention compliance**

Verify:
- `deleteReadNotifications()` only deletes where `is_read = true` AND `user_id = user.id`
- RLS `notifications_delete_own_read` enforces `user_id = auth.uid() AND is_read = true`
- No admin delete policy for other users' notifications exists
- Retention cleanup (90/365 days) documented as runtime Supabase cron requirement

- [ ] **Step 10: Document findings and fix**

Fix any issues found. Final status:
```
Security audit — VERIFIED (static analysis)
- Cross-school isolation: VERIFIED
- RLS policies: VERIFIED
- Server actions auth: VERIFIED
- user_id/school_id spoofing: IMPOSSIBLE (server-enforced)
- auth.uid() enforcement: VERIFIED
- Storage signed URLs: VERIFIED
- No sensitive data in client: VERIFIED
- Direct URL access: VERIFIED
- Notification retention: VERIFIED

Runtime verification DEFERRED:
- RLS runtime test with actual Supabase
- Storage signed URL generation
- Auth session refresh flow
- Notification retention cron
```

- [ ] **Step 11: Commit fixes**

```bash
git add -A
git commit -m "security: comprehensive audit — cross-school, RLS, auth, storage, client data"
```

---

### Task 12: Performance Audit

**Files:**
- Audit-only, fixes as needed

**Interfaces:**
- Consumes: all components and server actions
- Produces: optimized queries and rendering

- [ ] **Step 1: Verify Server Component usage**

Pages that MUST be Server Components (no `"use client"`):
- `dashboard/page.tsx`
- `notifications/page.tsx`
- `profile/page.tsx`
- `settings/page.tsx`
- `library/page.tsx`
- `library/[itemId]/page.tsx`
- `library/favorites/page.tsx`
- `library/history/page.tsx`

- [ ] **Step 2: Verify no N+1 queries**

- Dashboard: parallel `Promise.all` for independent counts ✓
- Library browse: single query + batch `createSignedUrls` ✓
- Notifications: single query with limit ✓
- Profile: single query with join ✓

- [ ] **Step 3: Verify count queries use `head: true`**

All `.select("id", { count: "exact", head: true })` — returns count only, no row data.

- [ ] **Step 4: Verify Client Component optimization**

- `DashboardShell`: `useCallback` for handlers ✓
- Notification list: proper `key` props
- Settings form: no unnecessary re-renders on toggle
- Library book cards: proper `key` props

- [ ] **Step 5: Commit fixes**

```bash
git add -A
git commit -m "perf: verify server components, batch queries, no N+1"
```

---

### Task 13: Final Integration Test

**Files:**
- Verify cross-module interactions
- Fix any issues found

**Interfaces:**
- Consumes: all modules
- Produces: verified integration

**Full user path to verify:**
Login → Dashboard → Messages → Library → Notifications → Profile → Settings → Dashboard (return)

- [ ] **Step 1: Verify Login → Dashboard**

- Auth redirect works (unauthenticated → `/login`)
- Dashboard loads with real stats
- Stats scoped to user's school
- Module cards appear only for accessible modules

- [ ] **Step 2: Verify Dashboard → Modules (Messages, Library)**

- Sidebar navigation shows only enabled modules for user's role
- Mobile nav matches sidebar exactly
- Clicking module navigates correctly
- Module layout guard (`isModuleAccessible`) enforces access

- [ ] **Step 3: Verify Modules → Notifications**

- Bell icon in header shows unread count from DB
- Clicking bell navigates to `/notifications`
- Notification list loads correctly
- Mark as read works, badge updates on next navigation
- Delete read works, confirmation dialog appears

- [ ] **Step 4: Verify Notifications → Profile**

- Profile page loads user data from DB
- Read-only fields are not editable
- Editable fields (phone, middle_name) accept input
- Save updates DB through server action
- User roles displayed correctly as badges

- [ ] **Step 5: Verify Profile → Settings**

- Settings page loads (existing settings or defaults)
- Language selector works
- Notification toggles work
- Save persists to `user_settings` table

- [ ] **Step 6: Verify Settings → Dashboard (return)**

- Navigation back to dashboard works
- Stats are still correct
- No stale state from previous pages

- [ ] **Step 7: Verify cross-cutting concerns**

- Loading skeletons appear on slow navigation
- Error boundaries catch and display errors gracefully
- Empty states show when data is empty
- i18n works correctly on all pages (both tg and ru)
- Responsive layout consistent across all pages

- [ ] **Step 8: Commit fixes**

```bash
git add -A
git commit -m "fix: integration fixes for cross-module navigation and state"
```

---

### Task 14: Final Build & Audit

**Files:**
- No new files

**Interfaces:**
- Produces: clean production build, final status report

- [ ] **Step 1: TypeScript compilation**

```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 2: Production build**

```bash
npx next build
```
Expected: all routes compile. Note total route count (expected: 28+ routes).

- [ ] **Step 3: Final route inventory**

List all routes, verify none missing:
- `/` (redirect)
- `/login`
- `/dashboard` (+ loading, error)
- `/notifications` (+ loading, error)
- `/profile` (+ loading, error)
- `/settings` (+ loading, error)
- `/messages` (+ loading, error)
- `/library` (+ loading, error)
- `/library/[itemId]`
- `/library/favorites`
- `/library/history`
- `/admin` (+ loading, error)
- `/admin/library`
- `/admin/library/books`
- `/admin/library/books/new`
- + other admin routes

- [ ] **Step 4: Final security checklist**

- [ ] All server actions start with `"use server"` and check auth
- [ ] All queries scoped by `school_id` or `user_id` (from server)
- [ ] No `user_id`/`school_id` accepted from form data
- [ ] No raw storage URLs exposed to client
- [ ] RLS enabled on all tables including `user_settings`
- [ ] Zod validation on all form inputs
- [ ] No `"use server"` closures in client components
- [ ] Error boundaries never expose technical errors
- [ ] Notification delete enforces `is_read = true`

- [ ] **Step 5: Document Phase 5 completion**

```
Phase 5 — COMPLETE

Features delivered:
- Dashboard: real data from DB, scoped by school/role/modules ✓
- Notifications: list/read/mark/delete with retention policy compliance ✓
- Profile: view + edit (phone, middle_name), server-enforced field whitelist ✓
- Settings: language (tg/ru) + per-type notification preferences ✓
- Loading skeletons: per-page, layout-matching ✓
- Page transitions: iOS-like fade+slide with spring micro-interactions ✓
- Error boundaries: playful characters, human-readable messages ✓
- Empty states: context-appropriate icons and messages ✓
- Responsive: mobile/tablet/desktop verified ✓
- Accessibility: focus-visible, ARIA, keyboard nav, contrast AA ✓
- i18n: complete Tajik + Russian coverage ✓
- Security audit: VERIFIED (static — 9 mandatory checks) ✓
- Performance: server components, batch queries, no N+1 ✓
- Integration: full user path verified ✓
- Production build: CLEAN ✓

No new permissions created (auth.uid() + RLS sufficient).
No changes to existing RLS policies (only new table user_settings).
Notification retention policy preserved (90d read / 365d unread / user-only delete).

Runtime verification DEFERRED:
- RLS policies runtime test
- Storage signed URL generation
- Auth session refresh flow
- Notification retention cron (90d/365d cleanup)
- Realtime notifications
```
