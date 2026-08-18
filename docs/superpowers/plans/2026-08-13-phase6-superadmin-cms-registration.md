# Phase 6: Super Admin Bootstrap + Public Landing CMS + Registration/Invitation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure Super Admin bootstrap, a CMS-managed public landing page (school history, directors, photos, events, contacts — all trilingual), email-based registration with invitation codes for school/role binding, and password reset.

**Architecture:** The root route (`/`) becomes a public landing page rendered from CMS data via `anon` RLS policies. Registration uses a 4-step flow: email → OTP → invitation code + password + profile → redirect. Super Admin is seeded via SQL migration and cannot be created through any UI. All admin mutations go through `requireAdmin()` server actions backed by school-scoped RLS.

**Tech Stack:** Next.js 16.3 (App Router, Server Components), TypeScript strict, Supabase (PostgreSQL + Auth OTP + RLS + Storage), Tailwind CSS 4, next-intl (tg/ru/en), Zod, Lucide React

## Global Constraints

- Next.js 16: `params`/`searchParams` are `Promise` — must `await` them
- Next.js 16: No inline `"use server"` closures in `"use client"` files — use `.bind()` pattern or separate action files
- All Supabase queries use `as never` cast due to `Database = Record<string, never>` placeholder
- `school_id` is **never** accepted from the client — always derived server-side
- `user_id` is **never** accepted from the client — always from `auth.uid()` or `getUserWithRole()`
- `is_super_admin` is **never** settable from the client — only via SQL seed migration
- `role_id` from invitation codes **cannot** have `level = 1` (admin) — enforced by DB CHECK
- Invitation codes **cannot** grant `is_super_admin = true` — enforced by column DEFAULT + no UPDATE policy for non-super
- All i18n keys must exist in all three files: `tg.json`, `ru.json`, `en.json`
- Images go through Supabase Storage buckets — never base64 in DB
- Published content (`is_published = true`, `is_visible = true`) is public; drafts are admin-only
- CSS uses existing design tokens: `--duration-fast/normal/slow`, `--ease-default/spring/out/in`
- Existing component patterns: `Card/CardHeader/CardContent/CardTitle`, `Button`, `Input`, `Skeleton`, `ErrorState`, `EmptyState`
- Server actions use `"use server"` at file top, Zod validation, return `{ error: string | null }`
- Admin guard: `requireAdmin()` from `@/lib/admin/guard`

---

## File Structure

### New Files

**Database migrations:**
- `supabase/migrations/00015_super_admin_and_cms.sql` — `is_super_admin` column, `directors` table, `invitation_codes` table, English CMS fields, public RLS policies, Super Admin seed

**Registration flow:**
- `src/app/(public)/register/page.tsx` — Step 1: email input
- `src/app/(public)/register/actions.ts` — `sendOtpAction`, `verifyOtpAction`, `completeRegistrationAction`
- `src/app/(public)/register/register-form.tsx` — Multi-step client form
- `src/app/(public)/register/verify/page.tsx` — Step 2: OTP verification (redirects here after email)
- `src/app/(public)/reset-password/page.tsx` — Password reset page
- `src/app/(public)/reset-password/actions.ts` — `sendResetAction`, `updatePasswordAction`
- `src/app/(public)/reset-password/reset-form.tsx` — Reset password client form

**Public landing page:**
- `src/app/(landing)/layout.tsx` — Public landing layout (no sidebar, no auth)
- `src/app/(landing)/page.tsx` — Server Component, fetches CMS data via anon client
- `src/app/(landing)/sections/hero-section.tsx` — Hero with school photo
- `src/app/(landing)/sections/about-section.tsx` — School history
- `src/app/(landing)/sections/directors-section.tsx` — Directors timeline
- `src/app/(landing)/sections/gallery-section.tsx` — Photo gallery
- `src/app/(landing)/sections/events-section.tsx` — Important events
- `src/app/(landing)/sections/contacts-section.tsx` — Contacts & support
- `src/lib/supabase/anon.ts` — Anon Supabase client (no auth cookies)

**Admin CMS pages:**
- `src/app/(dashboard)/admin/landing/page.tsx` — Landing CMS editor
- `src/app/(dashboard)/admin/landing/actions.ts` — CMS CRUD server actions
- `src/app/(dashboard)/admin/landing/landing-editor.tsx` — Client editor component
- `src/app/(dashboard)/admin/directors/page.tsx` — Directors management
- `src/app/(dashboard)/admin/directors/actions.ts` — Directors CRUD actions
- `src/app/(dashboard)/admin/directors/directors-list.tsx` — Client list component
- `src/app/(dashboard)/admin/directors/director-form.tsx` — Add/edit director form
- `src/app/(dashboard)/admin/invitations/page.tsx` — Invitation codes management
- `src/app/(dashboard)/admin/invitations/actions.ts` — Invitation CRUD actions
- `src/app/(dashboard)/admin/invitations/invitations-list.tsx` — Client list component

**Storage:**
- `src/lib/storage/public-images.ts` — Upload/delete helpers for `public-images` bucket

### Modified Files

- `src/app/page.tsx` — Change from redirect to render `(landing)` route
- `src/lib/supabase/middleware.ts` — Add `/verify`, `/reset-password` to public auth routes; allow `/` as public
- `src/app/(dashboard)/admin/admin-nav.tsx` — Add Landing, Directors, Invitations nav items
- `src/i18n/tg.json` — Add registration, landing, directors, invitations keys
- `src/i18n/ru.json` — Same
- `src/i18n/en.json` — Same
- `src/lib/admin/guard.ts` — Add `requireSuperAdmin()` function

---

### Task 1: Database Migration — Super Admin, Directors, Invitations, CMS Extensions

**Files:**
- Create: `supabase/migrations/00015_super_admin_and_cms.sql`

**Interfaces:**
- Consumes: existing tables `users`, `pages`, `content_blocks`, `schools`, `roles` from migrations 00001-00014
- Produces: `users.is_super_admin` column, `directors` table, `invitation_codes` table, English columns on CMS tables, public RLS policies, Super Admin user seed

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- 00015: Super Admin, Directors, Invitations, CMS English fields
-- ============================================================

-- 1. Add is_super_admin to users (NEVER settable from client)
ALTER TABLE public.users ADD COLUMN is_super_admin BOOLEAN NOT NULL DEFAULT false;

-- 2. Add English fields to CMS tables
ALTER TABLE public.schools ADD COLUMN description_en TEXT;
ALTER TABLE public.pages ADD COLUMN title_en VARCHAR(300);
ALTER TABLE public.content_blocks ADD COLUMN title_en TEXT;
ALTER TABLE public.content_blocks ADD COLUMN body_en TEXT;

-- 3. Directors table
CREATE TABLE public.directors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  full_name_tg VARCHAR(200) NOT NULL,
  full_name_ru VARCHAR(200),
  full_name_en VARCHAR(200),
  position_tg VARCHAR(200) NOT NULL,
  position_ru VARCHAR(200),
  position_en VARCHAR(200),
  photo_url VARCHAR(500),
  year_start INT NOT NULL,
  year_end INT,
  sort_order INT NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT directors_year_range CHECK (year_start >= 1900 AND year_start <= 2100),
  CONSTRAINT directors_year_end_check CHECK (year_end IS NULL OR (year_end >= year_start AND year_end <= 2100))
);

CREATE INDEX idx_directors_school ON public.directors(school_id);
CREATE INDEX idx_directors_school_visible ON public.directors(school_id, is_visible, sort_order);

-- 4. Invitation codes table
CREATE TABLE public.invitation_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  code VARCHAR(8) UNIQUE NOT NULL,
  max_uses INT NOT NULL DEFAULT 1,
  used_count INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT invitation_codes_max_uses_positive CHECK (max_uses >= 1),
  CONSTRAINT invitation_codes_used_count_range CHECK (used_count >= 0 AND used_count <= max_uses)
);

CREATE INDEX idx_invitation_codes_code ON public.invitation_codes(code) WHERE is_active = true;
CREATE INDEX idx_invitation_codes_school ON public.invitation_codes(school_id);

-- Prevent invitation codes from granting admin-level roles (level = 1)
CREATE OR REPLACE FUNCTION public.check_invitation_role_level()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.roles WHERE id = NEW.role_id AND level = 1) THEN
    RAISE EXCEPTION 'Invitation codes cannot grant admin-level roles';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_invitation_role_level
  BEFORE INSERT OR UPDATE ON public.invitation_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.check_invitation_role_level();

-- 5. RLS on directors
ALTER TABLE public.directors ENABLE ROW LEVEL SECURITY;

-- Public (anon) can read visible directors
CREATE POLICY directors_public_read ON public.directors
  FOR SELECT TO anon
  USING (is_visible = true);

-- Authenticated users can read visible directors from their school
CREATE POLICY directors_auth_read ON public.directors
  FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND is_visible = true);

-- Admin can read all directors from their school
CREATE POLICY directors_admin_read ON public.directors
  FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin());

-- Admin can manage directors in their school
CREATE POLICY directors_admin_manage ON public.directors
  FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (school_id = public.current_user_school_id() AND public.current_user_is_admin());

-- 6. RLS on invitation_codes
ALTER TABLE public.invitation_codes ENABLE ROW LEVEL SECURITY;

-- Admin can read codes from their school
CREATE POLICY invitation_codes_admin_read ON public.invitation_codes
  FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin());

-- Admin can manage codes in their school
CREATE POLICY invitation_codes_admin_manage ON public.invitation_codes
  FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (school_id = public.current_user_school_id() AND public.current_user_is_admin());

-- Service role can validate codes during registration (no RLS bypass needed — use admin client)

-- 7. Public RLS policies for CMS (anon access to published content)
CREATE POLICY pages_anon_read ON public.pages
  FOR SELECT TO anon
  USING (is_published = true);

CREATE POLICY content_blocks_anon_read ON public.content_blocks
  FOR SELECT TO anon
  USING (is_visible = true AND (
    page_id IS NULL OR page_id IN (SELECT id FROM public.pages WHERE is_published = true)
  ));

-- 8. Public RLS for schools (anon can read school info)
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

CREATE POLICY schools_anon_read ON public.schools
  FOR SELECT TO anon
  USING (is_active = true);

CREATE POLICY schools_auth_read ON public.schools
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY schools_admin_manage ON public.schools
  FOR ALL TO authenticated
  USING (id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (id = public.current_user_school_id() AND public.current_user_is_admin());

-- 9. Super Admin bootstrap
-- Create auth user for Super Admin (email: juraaaevilyos@gmail.com)
-- This uses raw_app_meta_data to mark as confirmed
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  aud,
  role,
  created_at,
  updated_at,
  confirmation_token
) VALUES (
  '00000000-0000-0000-0000-000000000099',
  '00000000-0000-0000-0000-000000000000',
  'juraaaevilyos@gmail.com',
  crypt('SuperAdmin2026!Mtmu7', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  'authenticated',
  'authenticated',
  now(),
  now(),
  ''
) ON CONFLICT (id) DO NOTHING;

-- Create identity for auth user
INSERT INTO auth.identities (
  id,
  user_id,
  provider_id,
  provider,
  identity_data,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000099',
  '00000000-0000-0000-0000-000000000099',
  'juraaaevilyos@gmail.com',
  'email',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000000099', 'email', 'juraaaevilyos@gmail.com'),
  now(),
  now(),
  now()
) ON CONFLICT (provider, provider_id) DO NOTHING;

-- Create public.users record for Super Admin
INSERT INTO public.users (
  id,
  school_id,
  email,
  first_name,
  last_name,
  is_super_admin
) VALUES (
  '00000000-0000-0000-0000-000000000099',
  '00000000-0000-0000-0000-000000000001',
  'juraaaevilyos@gmail.com',
  'Super',
  'Admin',
  true
) ON CONFLICT (id) DO NOTHING;

-- Assign admin role to Super Admin
INSERT INTO public.user_roles (
  user_id,
  role_id,
  school_id
) VALUES (
  '00000000-0000-0000-0000-000000000099',
  '00000000-0000-0000-0001-000000000001',
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (user_id, role_id, school_id) DO NOTHING;

-- 10. Seed CMS pages for public landing
INSERT INTO public.pages (id, school_id, slug, title_tg, title_ru, title_en, is_published, sort_order) VALUES
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000001', 'landing', 'Саҳифаи асосӣ', 'Главная страница', 'Home Page', true, 1)
ON CONFLICT (school_id, slug) DO NOTHING;

-- Seed content blocks for landing page sections
INSERT INTO public.content_blocks (id, school_id, page_id, section, type, title_tg, title_ru, title_en, body_tg, body_ru, body_en, is_visible, sort_order) VALUES
  ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000001', 'hero', 'text',
   'МТМУ №7', 'МТМУ №7', 'School №7',
   'Мактаби Таълимии Миёнаи Умумии №7 ба номи Мирзие Ҳабибов', 'Среднеобразовательная школа №7 имени Мирзие Хабибова', 'General Secondary School №7 named after Mirzie Habibov',
   true, 1),
  ('00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000001', 'about', 'text',
   'Дар бораи мактаб', 'О школе', 'About School',
   'Маълумот дар бораи таърихи мактаб', 'Информация об истории школы', 'Information about school history',
   true, 2),
  ('00000000-0000-0000-0004-000000000003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000001', 'events', 'text',
   'Рӯйдодҳои муҳим', 'Важные события', 'Important Events',
   'Рӯйдодҳои муҳими мактаб', 'Важные события школы', 'Important school events',
   true, 3),
  ('00000000-0000-0000-0004-000000000004', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000001', 'gallery', 'gallery',
   'Сурат', 'Фотографии', 'Photos',
   NULL, NULL, NULL,
   true, 4),
  ('00000000-0000-0000-0004-000000000005', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000001', 'support', 'text',
   'Тамос ва дастгирӣ', 'Контакты и поддержка', 'Contacts & Support',
   'Барои тамос ба мо нависед', 'Свяжитесь с нами', 'Contact us',
   true, 5)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Verify migration syntax**

Run: `cd /Users/mehrovar/Desktop/maktabi-miyona-7 && npx supabase db lint --level warning 2>&1 | head -20`

If supabase CLI is not available, manually review the SQL for syntax errors. Verify:
- All references to existing tables/columns are correct
- `ON CONFLICT` clauses match existing constraints
- `current_user_school_id()` and `current_user_is_admin()` functions exist (from migration 00011)

- [ ] **Step 3: Verify build still passes**

Run: `npx tsc --noEmit && npx next build`
Expected: Clean build (migration is SQL-only, no TS changes)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00015_super_admin_and_cms.sql
git commit -m "feat: add Super Admin bootstrap, directors, invitation_codes, CMS English fields, public RLS"
```

---

### Task 2: Anon Supabase Client + Admin Guard Extension

**Files:**
- Create: `src/lib/supabase/anon.ts`
- Modify: `src/lib/admin/guard.ts`

**Interfaces:**
- Consumes: `createClient` from `@supabase/supabase-js`, `Database` type, `getUserWithRole()` from `@/lib/auth/get-user-with-role`
- Produces: `createAnonClient(): SupabaseClient` (used by landing page to fetch published CMS data without auth cookies), `requireSuperAdmin(): Promise<UserWithRole>` (used by admin CMS actions)

- [ ] **Step 1: Create the anon client**

Create `src/lib/supabase/anon.ts`:

```typescript
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export function createAnonClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient<Database>(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
```

- [ ] **Step 2: Extend admin guard with `requireSuperAdmin`**

Add to `src/lib/admin/guard.ts` after the existing `requireAdmin` function:

```typescript
export async function requireSuperAdmin(): Promise<UserWithRole> {
  const user = await requireAdmin();

  const supabase = await createServerClient();
  const { data } = await supabase
    .from("users" as never)
    .select("is_super_admin" as never)
    .eq("id" as never, user.id)
    .single();

  const row = data as Record<string, unknown> | null;
  if (!row || row.is_super_admin !== true) {
    redirect("/dashboard?error=forbidden");
  }

  return user;
}
```

Add `import { createServerClient } from "@/lib/supabase/server";` to the imports of `guard.ts` if not already present.

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/anon.ts src/lib/admin/guard.ts
git commit -m "feat: add anon Supabase client and requireSuperAdmin guard"
```

---

### Task 3: Middleware Update — Public Routes

**Files:**
- Modify: `src/lib/supabase/middleware.ts`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: existing middleware structure from `src/lib/supabase/middleware.ts`
- Produces: Updated middleware that allows `/` as public, adds `/verify` and `/reset-password` to guest auth routes, and keeps all existing auth route protections

- [ ] **Step 1: Update middleware to handle new public routes**

In `src/lib/supabase/middleware.ts`, replace the `isPublicAuthRoute` check:

```typescript
  const isPublicAuthRoute =
    request.nextUrl.pathname === "/login" ||
    request.nextUrl.pathname === "/register" ||
    request.nextUrl.pathname.startsWith("/register/") ||
    request.nextUrl.pathname === "/verify" ||
    request.nextUrl.pathname === "/reset-password";

  if (user && isPublicAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }
```

The root `/` route needs no special handling — it's not in `isAuthRoute`, so unauthenticated users can access it. Authenticated users visiting `/` will see the landing page too (it's public).

- [ ] **Step 2: Remove redirect from root page**

Replace `src/app/page.tsx` content — the root page will be handled by the `(landing)` route group in Task 6. For now, make it a simple pass-through:

```typescript
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
```

Keep this as-is for now — Task 6 replaces it with the landing page. This step just confirms the file is ready.

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/middleware.ts
git commit -m "feat: update middleware for registration, verification, and password reset routes"
```

---

### Task 4: Invitation Codes — Admin Management

**Files:**
- Create: `src/app/(dashboard)/admin/invitations/page.tsx`
- Create: `src/app/(dashboard)/admin/invitations/actions.ts`
- Create: `src/app/(dashboard)/admin/invitations/invitations-list.tsx`
- Modify: `src/app/(dashboard)/admin/admin-nav.tsx`

**Interfaces:**
- Consumes: `requireAdmin()` from `@/lib/admin/guard`, `createServerClient()`, existing `Card`, `Button`, `Input`, `Badge` UI components
- Produces: `createInvitationAction(prevState, formData)`, `deleteInvitationAction(id)`, `getInvitationsAction()` — used only within admin invitations page

- [ ] **Step 1: Create invitation actions**

Create `src/app/(dashboard)/admin/invitations/actions.ts`:

```typescript
"use server";

import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

const createInvitationSchema = z.object({
  roleId: z.string().uuid(),
  maxUses: z.coerce.number().int().min(1).max(1000),
  expiresInDays: z.coerce.number().int().min(1).max(365).optional(),
});

export async function createInvitationAction(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const user = await requireAdmin();

  const parsed = createInvitationSchema.safeParse({
    roleId: formData.get("roleId"),
    maxUses: formData.get("maxUses"),
    expiresInDays: formData.get("expiresInDays") || undefined,
  });

  if (!parsed.success) {
    return { error: "invalidData" };
  }

  const supabase = await createServerClient();

  const expiresAt = parsed.data.expiresInDays
    ? new Date(Date.now() + parsed.data.expiresInDays * 86400000).toISOString()
    : null;

  const { error } = await supabase
    .from("invitation_codes" as never)
    .insert({
      school_id: user.schoolId,
      role_id: parsed.data.roleId,
      code: generateCode(),
      max_uses: parsed.data.maxUses,
      expires_at: expiresAt,
      created_by: user.id,
    } as never);

  if (error) {
    if (error.message?.includes("admin-level")) {
      return { error: "cannotGrantAdmin" };
    }
    return { error: "saveFailed" };
  }

  revalidatePath("/admin/invitations");
  return { error: null };
}

export async function deleteInvitationAction(id: string) {
  await requireAdmin();

  const supabase = await createServerClient();
  await supabase
    .from("invitation_codes" as never)
    .update({ is_active: false } as never)
    .eq("id" as never, id);

  revalidatePath("/admin/invitations");
}

export async function getInvitationsAction() {
  const user = await requireAdmin();

  const supabase = await createServerClient();
  const { data } = await supabase
    .from("invitation_codes" as never)
    .select("*, roles:role_id(slug, name_tg, name_ru)" as never)
    .eq("school_id" as never, user.schoolId)
    .eq("is_active" as never, true)
    .order("created_at" as never, { ascending: false });

  return (data ?? []) as Array<Record<string, unknown>>;
}

export async function getRolesForInvitationAction() {
  const user = await requireAdmin();

  const supabase = await createServerClient();
  const { data } = await supabase
    .from("roles" as never)
    .select("id, slug, name_tg, name_ru, level" as never)
    .eq("school_id" as never, user.schoolId)
    .eq("is_active" as never, true)
    .gt("level" as never, 1)
    .order("level" as never, { ascending: true });

  return (data ?? []) as Array<Record<string, unknown>>;
}
```

- [ ] **Step 2: Create invitations list component**

Create `src/app/(dashboard)/admin/invitations/invitations-list.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createInvitationAction, deleteInvitationAction } from "./actions";
import { Copy, Trash2, Plus } from "lucide-react";
import { useState } from "react";

interface InvitationsListProps {
  invitations: Array<Record<string, unknown>>;
  roles: Array<Record<string, unknown>>;
}

export function InvitationsList({ invitations, roles }: InvitationsListProps) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [state, formAction, isPending] = useActionState(createInvitationAction, { error: null });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyCode = async (code: string, id: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6 animate-in">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            {t("createInvitation")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label htmlFor="roleId" className="text-sm font-medium text-neutral-700">
                {t("role")}
              </label>
              <select
                id="roleId"
                name="roleId"
                required
                className="flex h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
              >
                {roles.map((role) => (
                  <option key={String(role.id)} value={String(role.id)}>
                    {String(role.name_tg)} ({String(role.slug)})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="maxUses" className="text-sm font-medium text-neutral-700">
                {t("maxUses")}
              </label>
              <Input id="maxUses" name="maxUses" type="number" defaultValue="1" min="1" max="1000" className="w-24" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="expiresInDays" className="text-sm font-medium text-neutral-700">
                {t("expiresInDays")}
              </label>
              <Input id="expiresInDays" name="expiresInDays" type="number" placeholder="30" min="1" max="365" className="w-24" />
            </div>
            <Button type="submit" loading={isPending}>
              {tc("create")}
            </Button>
          </form>
          {state.error && (
            <p className="mt-2 text-sm text-error-600">{t(state.error)}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("activeInvitations")}</CardTitle>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <p className="text-sm text-neutral-500">{tc("noData")}</p>
          ) : (
            <div className="space-y-3">
              {invitations.map((inv, i) => {
                const role = inv.roles as Record<string, unknown> | null;
                const isExpired = inv.expires_at && new Date(String(inv.expires_at)) < new Date();
                const isFull = Number(inv.used_count) >= Number(inv.max_uses);
                return (
                  <div
                    key={String(inv.id)}
                    className="flex items-center justify-between rounded-lg border border-neutral-200 p-3 animate-list-item"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <div className="flex items-center gap-3">
                      <code className="rounded bg-neutral-100 px-2 py-1 text-sm font-mono font-bold text-neutral-800">
                        {String(inv.code)}
                      </code>
                      <Badge variant={isExpired || isFull ? "secondary" : "default"}>
                        {role ? String(role.name_tg) : "—"}
                      </Badge>
                      <span className="text-xs text-neutral-500">
                        {String(inv.used_count)}/{String(inv.max_uses)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyCode(String(inv.code), String(inv.id))}
                        className="press-scale"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <form action={deleteInvitationAction.bind(null, String(inv.id))}>
                        <Button variant="ghost" size="icon" className="text-error-600 press-scale">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Create invitations page**

Create `src/app/(dashboard)/admin/invitations/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/guard";
import { getInvitationsAction, getRolesForInvitationAction } from "./actions";
import { InvitationsList } from "./invitations-list";

export default async function InvitationsPage() {
  await requireAdmin();
  const t = await getTranslations("admin");
  const [invitations, roles] = await Promise.all([
    getInvitationsAction(),
    getRolesForInvitationAction(),
  ]);

  return (
    <div className="space-y-6 animate-in">
      <h1 className="text-2xl font-bold text-neutral-900">{t("invitations")}</h1>
      <InvitationsList invitations={invitations} roles={roles} />
    </div>
  );
}
```

- [ ] **Step 4: Add invitations to admin nav**

In `src/app/(dashboard)/admin/admin-nav.tsx`, add these imports and nav items:

Add `Ticket, Crown, UserPlus` to the lucide-react import.

Add three items to `adminSections` array before the closing `] as const`:

```typescript
  { label: "admin.landing", href: "/admin/landing", icon: Crown },
  { label: "admin.directors", href: "/admin/directors", icon: Users },
  { label: "admin.invitations", href: "/admin/invitations", icon: Ticket },
```

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: Clean (may have i18n key warnings until Task 11)

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/admin/invitations/ src/app/\(dashboard\)/admin/admin-nav.tsx
git commit -m "feat: add invitation codes management for admin"
```

---

### Task 5: Registration Flow — Email → OTP → Invitation Code → Password

**Files:**
- Create: `src/app/(public)/register/page.tsx`
- Create: `src/app/(public)/register/actions.ts`
- Create: `src/app/(public)/register/register-form.tsx`

**Interfaces:**
- Consumes: `createServerClient()`, `createAdminClient()`, `Input`, `Button` UI components, Supabase Auth OTP methods
- Produces: Complete registration flow — `sendOtpAction`, `verifyOtpAction`, `completeRegistrationAction`

- [ ] **Step 1: Create registration server actions**

Create `src/app/(public)/register/actions.ts`:

```typescript
"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { z } from "zod";

const emailSchema = z.object({
  email: z.string().email(),
});

const otpSchema = z.object({
  email: z.string().email(),
  token: z.string().length(6).regex(/^\d+$/),
});

const completeSchema = z.object({
  invitationCode: z.string().min(6).max(10).regex(/^[A-Z0-9]+$/),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional(),
});

export type RegistrationState = {
  step: "email" | "otp" | "complete";
  email: string | null;
  error: string | null;
};

export async function sendOtpAction(
  prevState: RegistrationState,
  formData: FormData
): Promise<RegistrationState> {
  const parsed = emailSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { ...prevState, error: "invalidEmail" };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: true,
    },
  });

  if (error) {
    return { ...prevState, error: "otpSendFailed" };
  }

  return { step: "otp", email: parsed.data.email, error: null };
}

export async function verifyOtpAction(
  prevState: RegistrationState,
  formData: FormData
): Promise<RegistrationState> {
  const email = prevState.email;
  if (!email) {
    return { step: "email", email: null, error: "sessionExpired" };
  }

  const parsed = otpSchema.safeParse({
    email,
    token: formData.get("token"),
  });

  if (!parsed.success) {
    return { ...prevState, error: "invalidOtp" };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.token,
    type: "email",
  });

  if (error) {
    return { ...prevState, error: "otpVerifyFailed" };
  }

  return { step: "complete", email, error: null };
}

export async function completeRegistrationAction(
  prevState: RegistrationState,
  formData: FormData
): Promise<RegistrationState> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { step: "email", email: null, error: "sessionExpired" };
  }

  const parsed = completeSchema.safeParse({
    invitationCode: formData.get("invitationCode"),
    password: formData.get("password"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    middleName: formData.get("middleName") || undefined,
  });

  if (!parsed.success) {
    return { ...prevState, error: "invalidData" };
  }

  const admin = createAdminClient();

  // Validate invitation code (server-side — school_id and role_id from DB, not client)
  const { data: invitation } = await admin
    .from("invitation_codes" as never)
    .select("id, school_id, role_id, max_uses, used_count, expires_at, is_active" as never)
    .eq("code" as never, parsed.data.invitationCode)
    .eq("is_active" as never, true)
    .single();

  const inv = invitation as Record<string, unknown> | null;
  if (!inv) {
    return { ...prevState, error: "invalidInvitationCode" };
  }

  if (Number(inv.used_count) >= Number(inv.max_uses)) {
    return { ...prevState, error: "invitationCodeUsed" };
  }

  if (inv.expires_at && new Date(String(inv.expires_at)) < new Date()) {
    return { ...prevState, error: "invitationCodeExpired" };
  }

  // Set password
  const { error: pwError } = await admin.auth.admin.updateUserById(user.id, {
    password: parsed.data.password,
  });

  if (pwError) {
    return { ...prevState, error: "passwordSetFailed" };
  }

  // Check if user already has a public.users record
  const { data: existingUser } = await admin
    .from("users" as never)
    .select("id" as never)
    .eq("id" as never, user.id)
    .single();

  if (existingUser) {
    return { ...prevState, error: "alreadyRegistered" };
  }

  // Create public.users record with school_id from invitation code
  const { error: userError } = await admin
    .from("users" as never)
    .insert({
      id: user.id,
      school_id: String(inv.school_id),
      email: user.email!,
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      middle_name: parsed.data.middleName ?? null,
    } as never);

  if (userError) {
    return { ...prevState, error: "registrationFailed" };
  }

  // Assign role from invitation code
  await admin
    .from("user_roles" as never)
    .insert({
      user_id: user.id,
      role_id: String(inv.role_id),
      school_id: String(inv.school_id),
    } as never);

  // Increment used_count
  await admin
    .from("invitation_codes" as never)
    .update({ used_count: Number(inv.used_count) + 1 } as never)
    .eq("id" as never, String(inv.id));

  redirect("/dashboard");
}
```

- [ ] **Step 2: Create register form component**

Create `src/app/(public)/register/register-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  sendOtpAction,
  verifyOtpAction,
  completeRegistrationAction,
  type RegistrationState,
} from "./actions";
import { Mail, KeyRound, UserPlus } from "lucide-react";
import Link from "next/link";

const initialState: RegistrationState = {
  step: "email",
  email: null,
  error: null,
};

export function RegisterForm() {
  const t = useTranslations("auth");
  const [state, formAction, isPending] = useActionState(
    (prevState: RegistrationState, formData: FormData) => {
      switch (prevState.step) {
        case "email":
          return sendOtpAction(prevState, formData);
        case "otp":
          return verifyOtpAction(prevState, formData);
        case "complete":
          return completeRegistrationAction(prevState, formData);
      }
    },
    initialState
  );

  return (
    <div className="w-full max-w-sm space-y-6 animate-in">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50">
          {state.step === "email" && <Mail className="h-6 w-6 text-primary-600" />}
          {state.step === "otp" && <KeyRound className="h-6 w-6 text-primary-600" />}
          {state.step === "complete" && <UserPlus className="h-6 w-6 text-primary-600" />}
        </div>
        <h1 className="text-2xl font-bold text-neutral-900">{t("registerTitle")}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {state.step === "email" && t("registerEmailStep")}
          {state.step === "otp" && t("registerOtpStep")}
          {state.step === "complete" && t("registerCompleteStep")}
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        {state.step === "email" && (
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-neutral-700">
              {t("email")}
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="email@example.com"
              required
              autoComplete="email"
              error={!!state.error}
            />
          </div>
        )}

        {state.step === "otp" && (
          <div className="space-y-2">
            <label htmlFor="token" className="text-sm font-medium text-neutral-700">
              {t("otpCode")}
            </label>
            <Input
              id="token"
              name="token"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              required
              autoComplete="one-time-code"
              error={!!state.error}
              className="text-center text-2xl tracking-[0.5em] font-mono"
            />
            <p className="text-xs text-neutral-500">{t("otpSentTo", { email: state.email })}</p>
          </div>
        )}

        {state.step === "complete" && (
          <>
            <div className="space-y-2">
              <label htmlFor="invitationCode" className="text-sm font-medium text-neutral-700">
                {t("invitationCode")}
              </label>
              <Input
                id="invitationCode"
                name="invitationCode"
                type="text"
                placeholder="ABCD1234"
                required
                maxLength={10}
                className="text-center font-mono uppercase tracking-wider"
                error={!!state.error}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label htmlFor="firstName" className="text-sm font-medium text-neutral-700">
                  {t("firstName")}
                </label>
                <Input id="firstName" name="firstName" required error={!!state.error} />
              </div>
              <div className="space-y-2">
                <label htmlFor="lastName" className="text-sm font-medium text-neutral-700">
                  {t("lastName")}
                </label>
                <Input id="lastName" name="lastName" required error={!!state.error} />
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="middleName" className="text-sm font-medium text-neutral-700">
                {t("middleName")}
              </label>
              <Input id="middleName" name="middleName" error={!!state.error} />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-neutral-700">
                {t("password")}
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                error={!!state.error}
              />
              <p className="text-xs text-neutral-500">{t("passwordHint")}</p>
            </div>
          </>
        )}

        {state.error && (
          <div className="animate-in rounded-lg bg-red-50 p-3 text-sm text-error-600">
            {t(state.error)}
          </div>
        )}

        <Button type="submit" className="w-full press-scale" loading={isPending}>
          {state.step === "email" && t("sendOtp")}
          {state.step === "otp" && t("verifyOtp")}
          {state.step === "complete" && t("registerButton")}
        </Button>
      </form>

      <p className="text-center text-sm text-neutral-500">
        {t("hasAccount")}{" "}
        <Link href="/login" className="font-medium text-primary-600 hover:text-primary-700">
          {t("loginButton")}
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Create register page**

Create `src/app/(public)/register/page.tsx`:

```tsx
import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  return <RegisterForm />;
}
```

- [ ] **Step 4: Add register link to login form**

In `src/app/(public)/login/login-form.tsx`, add after the submit `Button`:

```tsx
      <p className="text-center text-sm text-neutral-500">
        {t("noAccount")}{" "}
        <Link href="/register" className="font-medium text-primary-600 hover:text-primary-700">
          {t("registerButton")}
        </Link>
      </p>
```

Add `import Link from "next/link";` to the imports.

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 6: Commit**

```bash
git add src/app/\(public\)/register/ src/app/\(public\)/login/login-form.tsx
git commit -m "feat: add email registration flow with OTP and invitation code"
```

---

### Task 6: Password Reset Flow

**Files:**
- Create: `src/app/(public)/reset-password/page.tsx`
- Create: `src/app/(public)/reset-password/actions.ts`
- Create: `src/app/(public)/reset-password/reset-form.tsx`

**Interfaces:**
- Consumes: `createServerClient()`, `Input`, `Button` UI components, Supabase Auth password reset methods
- Produces: Password reset pages accessible at `/reset-password`

- [ ] **Step 1: Create reset password actions**

Create `src/app/(public)/reset-password/actions.ts`:

```typescript
"use server";

import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { z } from "zod";

const emailSchema = z.object({
  email: z.string().email(),
});

const resetSchema = z.object({
  password: z.string().min(8).max(128),
});

export type ResetState = {
  step: "email" | "sent" | "new-password";
  error: string | null;
};

export async function sendResetAction(
  _prevState: ResetState,
  formData: FormData
): Promise<ResetState> {
  const parsed = emailSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { step: "email", error: "invalidEmail" };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?step=update`,
  });

  if (error) {
    return { step: "email", error: "resetSendFailed" };
  }

  return { step: "sent", error: null };
}

export async function updatePasswordAction(
  _prevState: ResetState,
  formData: FormData
): Promise<ResetState> {
  const parsed = resetSchema.safeParse({
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { step: "new-password", error: "invalidPassword" };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return { step: "new-password", error: "passwordUpdateFailed" };
  }

  redirect("/login?message=passwordReset");
}
```

- [ ] **Step 2: Create reset form component**

Create `src/app/(public)/reset-password/reset-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { sendResetAction, updatePasswordAction, type ResetState } from "./actions";
import { KeyRound, Mail, CheckCircle } from "lucide-react";
import Link from "next/link";

export function ResetForm({ initialStep }: { initialStep: "email" | "new-password" }) {
  const t = useTranslations("auth");

  const [state, formAction, isPending] = useActionState(
    (prevState: ResetState, formData: FormData) => {
      if (prevState.step === "email") return sendResetAction(prevState, formData);
      if (prevState.step === "new-password") return updatePasswordAction(prevState, formData);
      return prevState;
    },
    { step: initialStep, error: null } as ResetState
  );

  return (
    <div className="w-full max-w-sm space-y-6 animate-in">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50">
          {state.step === "sent" ? (
            <CheckCircle className="h-6 w-6 text-success-600" />
          ) : state.step === "new-password" ? (
            <KeyRound className="h-6 w-6 text-primary-600" />
          ) : (
            <Mail className="h-6 w-6 text-primary-600" />
          )}
        </div>
        <h1 className="text-2xl font-bold text-neutral-900">{t("resetTitle")}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {state.step === "email" && t("resetEmailStep")}
          {state.step === "sent" && t("resetSentStep")}
          {state.step === "new-password" && t("resetNewPasswordStep")}
        </p>
      </div>

      {state.step !== "sent" && (
        <form action={formAction} className="space-y-4">
          {state.step === "email" && (
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-neutral-700">
                {t("email")}
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="email@example.com"
                required
                autoComplete="email"
                error={!!state.error}
              />
            </div>
          )}

          {state.step === "new-password" && (
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-neutral-700">
                {t("newPassword")}
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                error={!!state.error}
              />
              <p className="text-xs text-neutral-500">{t("passwordHint")}</p>
            </div>
          )}

          {state.error && (
            <div className="animate-in rounded-lg bg-red-50 p-3 text-sm text-error-600">
              {t(state.error)}
            </div>
          )}

          <Button type="submit" className="w-full press-scale" loading={isPending}>
            {state.step === "email" ? t("sendResetLink") : t("updatePassword")}
          </Button>
        </form>
      )}

      <p className="text-center text-sm text-neutral-500">
        <Link href="/login" className="font-medium text-primary-600 hover:text-primary-700">
          {t("backToLogin")}
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Create reset password page**

Create `src/app/(public)/reset-password/page.tsx`:

```tsx
import { ResetForm } from "./reset-form";

export default async function ResetPasswordPage(props: {
  searchParams: Promise<{ step?: string }>;
}) {
  const searchParams = await props.searchParams;
  const initialStep = searchParams.step === "update" ? "new-password" as const : "email" as const;

  return <ResetForm initialStep={initialStep} />;
}
```

- [ ] **Step 4: Add reset password link to login form**

In `src/app/(public)/login/login-form.tsx`, add after the password label (inside the password `<div className="space-y-2">`):

```tsx
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-medium text-neutral-700">
            {t("password")}
          </label>
          <Link href="/reset-password" className="text-xs text-primary-600 hover:text-primary-700">
            {t("forgotPassword")}
          </Link>
        </div>
```

Replace the existing standalone `<label htmlFor="password">` with this `<div>` wrapper.

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 6: Commit**

```bash
git add src/app/\(public\)/reset-password/ src/app/\(public\)/login/login-form.tsx
git commit -m "feat: add password reset flow with email link"
```

---

### Task 7: Public Landing Page — Layout and Server Component

**Files:**
- Create: `src/app/(landing)/layout.tsx`
- Create: `src/app/(landing)/page.tsx`
- Create: `src/app/(landing)/sections/hero-section.tsx`
- Create: `src/app/(landing)/sections/about-section.tsx`
- Create: `src/app/(landing)/sections/directors-section.tsx`
- Create: `src/app/(landing)/sections/events-section.tsx`
- Create: `src/app/(landing)/sections/gallery-section.tsx`
- Create: `src/app/(landing)/sections/contacts-section.tsx`
- Modify: `src/app/page.tsx` — remove redirect, render landing

**Interfaces:**
- Consumes: `createAnonClient()` from `src/lib/supabase/anon`, CMS tables (pages, content_blocks, directors, schools), existing UI components
- Produces: Public landing page at `/` with CMS-managed sections (hero, about, directors, events, gallery, contacts)

- [ ] **Step 1: Create landing layout**

Create `src/app/(landing)/layout.tsx`:

```tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("landing");

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-50 border-b border-neutral-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="text-lg font-bold text-primary-700">
            МТМУ №7
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              {t("login")}
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors press-scale"
            >
              {t("register")}
            </Link>
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-neutral-200 bg-neutral-50 py-8">
        <div className="mx-auto max-w-6xl px-4 text-center text-sm text-neutral-500">
          © {new Date().getFullYear()} МТМУ №7
        </div>
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: Create landing section components**

Create `src/app/(landing)/sections/hero-section.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface HeroSectionProps {
  title: string;
  description: string;
  imageUrl?: string | null;
  ctaText: string;
}

export function HeroSection({ title, description, imageUrl, ctaText }: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-primary-50 to-white py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="space-y-6">
            <h1 className="text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl animate-in">
              {title}
            </h1>
            <p className="text-lg text-neutral-600 animate-in" style={{ animationDelay: "100ms" }}>
              {description}
            </p>
            <div className="animate-in" style={{ animationDelay: "200ms" }}>
              <Link href="/register">
                <Button size="lg" className="press-scale">
                  {ctaText}
                </Button>
              </Link>
            </div>
          </div>
          {imageUrl && (
            <div className="animate-in" style={{ animationDelay: "150ms" }}>
              <img
                src={imageUrl}
                alt={title}
                className="rounded-2xl shadow-xl w-full object-cover aspect-[4/3]"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
```

Create `src/app/(landing)/sections/about-section.tsx`:

```tsx
interface AboutSectionProps {
  title: string;
  body: string;
}

export function AboutSection({ title, body }: AboutSectionProps) {
  return (
    <section className="py-16 sm:py-20" id="about">
      <div className="mx-auto max-w-3xl px-4">
        <h2 className="text-3xl font-bold text-neutral-900">{title}</h2>
        <div className="mt-6 whitespace-pre-line text-neutral-600 leading-relaxed">
          {body}
        </div>
      </div>
    </section>
  );
}
```

Create `src/app/(landing)/sections/directors-section.tsx`:

```tsx
interface Director {
  fullName: string;
  position: string;
  photoUrl?: string | null;
  yearStart: number;
  yearEnd?: number | null;
}

interface DirectorsSectionProps {
  title: string;
  directors: Director[];
}

export function DirectorsSection({ title, directors }: DirectorsSectionProps) {
  return (
    <section className="bg-neutral-50 py-16 sm:py-20" id="directors">
      <div className="mx-auto max-w-4xl px-4">
        <h2 className="text-3xl font-bold text-neutral-900">{title}</h2>
        <div className="mt-8 space-y-6">
          {directors.map((d, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm animate-list-item"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              {d.photoUrl ? (
                <img
                  src={d.photoUrl}
                  alt={d.fullName}
                  className="h-16 w-16 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xl font-bold text-primary-700">
                  {d.fullName.charAt(0)}
                </div>
              )}
              <div className="min-w-0">
                <p className="font-semibold text-neutral-900 truncate">{d.fullName}</p>
                <p className="text-sm text-neutral-500">{d.position}</p>
                <p className="text-xs text-neutral-400">
                  {d.yearStart}–{d.yearEnd ?? "..."}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

Create `src/app/(landing)/sections/events-section.tsx`:

```tsx
interface EventsSectionProps {
  title: string;
  body: string;
}

export function EventsSection({ title, body }: EventsSectionProps) {
  return (
    <section className="py-16 sm:py-20" id="events">
      <div className="mx-auto max-w-3xl px-4">
        <h2 className="text-3xl font-bold text-neutral-900">{title}</h2>
        <div className="mt-6 whitespace-pre-line text-neutral-600 leading-relaxed">
          {body}
        </div>
      </div>
    </section>
  );
}
```

Create `src/app/(landing)/sections/gallery-section.tsx`:

```tsx
interface GallerySectionProps {
  title: string;
  images: Array<{ url: string; alt?: string }>;
}

export function GallerySection({ title, images }: GallerySectionProps) {
  if (images.length === 0) return null;

  return (
    <section className="bg-neutral-50 py-16 sm:py-20" id="gallery">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="text-3xl font-bold text-neutral-900">{title}</h2>
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((img, i) => (
            <div
              key={i}
              className="aspect-square overflow-hidden rounded-xl animate-list-item"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <img
                src={img.url}
                alt={img.alt ?? ""}
                className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

Create `src/app/(landing)/sections/contacts-section.tsx`:

```tsx
import { Mail, Phone, MapPin } from "lucide-react";

interface ContactsSectionProps {
  title: string;
  body: string;
  school: {
    email?: string | null;
    phone?: string | null;
    address?: string | null;
  };
}

export function ContactsSection({ title, body, school }: ContactsSectionProps) {
  return (
    <section className="py-16 sm:py-20" id="contacts">
      <div className="mx-auto max-w-3xl px-4">
        <h2 className="text-3xl font-bold text-neutral-900">{title}</h2>
        <p className="mt-4 text-neutral-600">{body}</p>
        <div className="mt-8 space-y-4">
          {school.address && (
            <div className="flex items-center gap-3 text-neutral-700">
              <MapPin className="h-5 w-5 shrink-0 text-neutral-400" />
              <span>{school.address}</span>
            </div>
          )}
          {school.phone && (
            <div className="flex items-center gap-3 text-neutral-700">
              <Phone className="h-5 w-5 shrink-0 text-neutral-400" />
              <a href={`tel:${school.phone}`} className="hover:text-primary-600">{school.phone}</a>
            </div>
          )}
          {school.email && (
            <div className="flex items-center gap-3 text-neutral-700">
              <Mail className="h-5 w-5 shrink-0 text-neutral-400" />
              <a href={`mailto:${school.email}`} className="hover:text-primary-600">{school.email}</a>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create landing page Server Component**

Create `src/app/(landing)/page.tsx`:

```tsx
import { createAnonClient } from "@/lib/supabase/anon";
import { getLocale, getTranslations } from "next-intl/server";
import { HeroSection } from "./sections/hero-section";
import { AboutSection } from "./sections/about-section";
import { DirectorsSection } from "./sections/directors-section";
import { EventsSection } from "./sections/events-section";
import { GallerySection } from "./sections/gallery-section";
import { ContactsSection } from "./sections/contacts-section";
import type { Locale } from "@/i18n/config";

function localized(row: Record<string, unknown>, field: string, locale: Locale): string {
  const localeField = `${field}_${locale}`;
  const value = row[localeField];
  if (value && typeof value === "string") return value;
  const tgValue = row[`${field}_tg`];
  return typeof tgValue === "string" ? tgValue : "";
}

const SCHOOL_ID = "00000000-0000-0000-0000-000000000001";

export default async function LandingPage() {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("landing");
  const supabase = createAnonClient();

  const [schoolRes, blocksRes, directorsRes] = await Promise.all([
    supabase
      .from("schools" as never)
      .select("*" as never)
      .eq("id" as never, SCHOOL_ID)
      .single(),
    supabase
      .from("content_blocks" as never)
      .select("*" as never)
      .eq("school_id" as never, SCHOOL_ID)
      .eq("is_visible" as never, true)
      .order("sort_order" as never, { ascending: true }),
    supabase
      .from("directors" as never)
      .select("*" as never)
      .eq("school_id" as never, SCHOOL_ID)
      .eq("is_visible" as never, true)
      .order("sort_order" as never, { ascending: true }),
  ]);

  const school = (schoolRes.data ?? {}) as Record<string, unknown>;
  const blocks = ((blocksRes.data ?? []) as Array<Record<string, unknown>>);
  const directors = ((directorsRes.data ?? []) as Array<Record<string, unknown>>);

  const getBlock = (section: string) => blocks.find((b) => b.section === section);
  const heroBlock = getBlock("hero");
  const aboutBlock = getBlock("about");
  const eventsBlock = getBlock("events");
  const galleryBlock = getBlock("gallery");
  const supportBlock = getBlock("support");

  const galleryImages: Array<{ url: string; alt?: string }> = [];
  if (galleryBlock?.metadata && typeof galleryBlock.metadata === "object") {
    const meta = galleryBlock.metadata as Record<string, unknown>;
    const imgs = meta.images;
    if (Array.isArray(imgs)) {
      for (const img of imgs) {
        if (typeof img === "object" && img && "url" in img) {
          galleryImages.push({ url: String((img as Record<string, unknown>).url), alt: String((img as Record<string, unknown>).alt ?? "") });
        }
      }
    }
  }

  return (
    <>
      {heroBlock && (
        <HeroSection
          title={localized(heroBlock, "title", locale)}
          description={localized(heroBlock, "body", locale)}
          imageUrl={heroBlock.image_url as string | null}
          ctaText={t("joinUs")}
        />
      )}
      {aboutBlock && (
        <AboutSection
          title={localized(aboutBlock, "title", locale)}
          body={localized(aboutBlock, "body", locale)}
        />
      )}
      {directors.length > 0 && (
        <DirectorsSection
          title={t("directorsTitle")}
          directors={directors.map((d) => ({
            fullName: localized(d, "full_name", locale),
            position: localized(d, "position", locale),
            photoUrl: d.photo_url as string | null,
            yearStart: Number(d.year_start),
            yearEnd: d.year_end ? Number(d.year_end) : null,
          }))}
        />
      )}
      {eventsBlock && (
        <EventsSection
          title={localized(eventsBlock, "title", locale)}
          body={localized(eventsBlock, "body", locale)}
        />
      )}
      {galleryImages.length > 0 && (
        <GallerySection title={t("galleryTitle")} images={galleryImages} />
      )}
      {supportBlock && (
        <ContactsSection
          title={localized(supportBlock, "title", locale)}
          body={localized(supportBlock, "body", locale)}
          school={{
            email: school.email as string | null,
            phone: school.phone as string | null,
            address: school.address as string | null,
          }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 4: Update root page.tsx**

Replace `src/app/page.tsx`:

```typescript
export { default } from "./(landing)/page";
```

Wait — Next.js App Router uses file-system routing. The `(landing)` route group means `src/app/(landing)/page.tsx` maps to `/`. The existing `src/app/page.tsx` will conflict. **Delete** `src/app/page.tsx` to let `(landing)/page.tsx` serve `/`.

```bash
rm src/app/page.tsx
```

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit && npx next build`
Expected: Landing page route at `/`, no conflicts

- [ ] **Step 6: Commit**

```bash
git add src/app/\(landing\)/ src/lib/supabase/anon.ts
git rm src/app/page.tsx 2>/dev/null; true
git commit -m "feat: add CMS-managed public landing page with school info, directors, gallery, contacts"
```

---

### Task 8: Admin CMS — Landing Page Editor

**Files:**
- Create: `src/app/(dashboard)/admin/landing/page.tsx`
- Create: `src/app/(dashboard)/admin/landing/actions.ts`
- Create: `src/app/(dashboard)/admin/landing/landing-editor.tsx`

**Interfaces:**
- Consumes: `requireAdmin()`, `createServerClient()`, `Card`, `Button`, `Input` UI components, content_blocks table
- Produces: CMS editor for landing page content blocks (hero, about, events, support sections)

- [ ] **Step 1: Create landing CMS actions**

Create `src/app/(dashboard)/admin/landing/actions.ts`:

```typescript
"use server";

import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const blockSchema = z.object({
  id: z.string().uuid(),
  titleTg: z.string().min(1).max(300),
  titleRu: z.string().max(300).optional(),
  titleEn: z.string().max(300).optional(),
  bodyTg: z.string().optional(),
  bodyRu: z.string().optional(),
  bodyEn: z.string().optional(),
  imageUrl: z.string().max(500).optional(),
});

export async function updateBlockAction(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  await requireAdmin();

  const parsed = blockSchema.safeParse({
    id: formData.get("id"),
    titleTg: formData.get("titleTg"),
    titleRu: formData.get("titleRu") || undefined,
    titleEn: formData.get("titleEn") || undefined,
    bodyTg: formData.get("bodyTg") || undefined,
    bodyRu: formData.get("bodyRu") || undefined,
    bodyEn: formData.get("bodyEn") || undefined,
    imageUrl: formData.get("imageUrl") || undefined,
  });

  if (!parsed.success) {
    return { error: "invalidData" };
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("content_blocks" as never)
    .update({
      title_tg: parsed.data.titleTg,
      title_ru: parsed.data.titleRu ?? null,
      title_en: parsed.data.titleEn ?? null,
      body_tg: parsed.data.bodyTg ?? null,
      body_ru: parsed.data.bodyRu ?? null,
      body_en: parsed.data.bodyEn ?? null,
      image_url: parsed.data.imageUrl ?? null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id" as never, parsed.data.id);

  if (error) {
    return { error: "saveFailed" };
  }

  revalidatePath("/admin/landing");
  revalidatePath("/");
  return { error: null };
}

export async function getLandingBlocksAction() {
  const user = await requireAdmin();

  const supabase = await createServerClient();
  const { data } = await supabase
    .from("content_blocks" as never)
    .select("*" as never)
    .eq("school_id" as never, user.schoolId)
    .in("section" as never, ["hero", "about", "events", "gallery", "support"])
    .order("sort_order" as never, { ascending: true });

  return (data ?? []) as Array<Record<string, unknown>>;
}
```

- [ ] **Step 2: Create landing editor component**

Create `src/app/(dashboard)/admin/landing/landing-editor.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateBlockAction } from "./actions";
import { Save } from "lucide-react";

interface LandingEditorProps {
  blocks: Array<Record<string, unknown>>;
}

function BlockEditor({ block }: { block: Record<string, unknown> }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [state, formAction, isPending] = useActionState(updateBlockAction, { error: null });

  const section = String(block.section);
  const hasBody = section !== "gallery";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(`section_${section}`)}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={String(block.id)} />

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">TG</label>
              <Input name="titleTg" defaultValue={String(block.title_tg ?? "")} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">RU</label>
              <Input name="titleRu" defaultValue={String(block.title_ru ?? "")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">EN</label>
              <Input name="titleEn" defaultValue={String(block.title_en ?? "")} />
            </div>
          </div>

          {hasBody && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-500">{t("bodyTg")}</label>
                <textarea
                  name="bodyTg"
                  defaultValue={String(block.body_tg ?? "")}
                  rows={4}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-500">{t("bodyRu")}</label>
                <textarea
                  name="bodyRu"
                  defaultValue={String(block.body_ru ?? "")}
                  rows={4}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-500">{t("bodyEn")}</label>
                <textarea
                  name="bodyEn"
                  defaultValue={String(block.body_en ?? "")}
                  rows={4}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                />
              </div>
            </div>
          )}

          {section === "hero" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">{t("heroImage")}</label>
              <Input name="imageUrl" defaultValue={String(block.image_url ?? "")} placeholder="https://..." />
            </div>
          )}

          {state.error && (
            <p className="text-sm text-error-600">{t(state.error)}</p>
          )}

          <Button type="submit" loading={isPending} className="press-scale">
            <Save className="mr-2 h-4 w-4" />
            {tc("save")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function LandingEditor({ blocks }: LandingEditorProps) {
  return (
    <div className="space-y-6 animate-in">
      {blocks.map((block) => (
        <BlockEditor key={String(block.id)} block={block} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create landing CMS page**

Create `src/app/(dashboard)/admin/landing/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/guard";
import { getLandingBlocksAction } from "./actions";
import { LandingEditor } from "./landing-editor";

export default async function AdminLandingPage() {
  await requireAdmin();
  const t = await getTranslations("admin");
  const blocks = await getLandingBlocksAction();

  return (
    <div className="space-y-6 animate-in">
      <h1 className="text-2xl font-bold text-neutral-900">{t("landingEditor")}</h1>
      <LandingEditor blocks={blocks} />
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/admin/landing/
git commit -m "feat: add admin CMS editor for public landing page content"
```

---

### Task 9: Admin CMS — Directors Management

**Files:**
- Create: `src/app/(dashboard)/admin/directors/page.tsx`
- Create: `src/app/(dashboard)/admin/directors/actions.ts`
- Create: `src/app/(dashboard)/admin/directors/directors-list.tsx`
- Create: `src/app/(dashboard)/admin/directors/director-form.tsx`

**Interfaces:**
- Consumes: `requireAdmin()`, `createServerClient()`, `directors` table, `Card`, `Button`, `Input` UI components
- Produces: Full CRUD for directors with trilingual fields and photo URL

- [ ] **Step 1: Create directors server actions**

Create `src/app/(dashboard)/admin/directors/actions.ts`:

```typescript
"use server";

import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const directorSchema = z.object({
  fullNameTg: z.string().min(1).max(200),
  fullNameRu: z.string().max(200).optional(),
  fullNameEn: z.string().max(200).optional(),
  positionTg: z.string().min(1).max(200),
  positionRu: z.string().max(200).optional(),
  positionEn: z.string().max(200).optional(),
  photoUrl: z.string().max(500).optional(),
  yearStart: z.coerce.number().int().min(1900).max(2100),
  yearEnd: z.coerce.number().int().min(1900).max(2100).optional(),
  sortOrder: z.coerce.number().int().default(0),
});

export async function getDirectorsAction() {
  const user = await requireAdmin();
  const supabase = await createServerClient();

  const { data } = await supabase
    .from("directors" as never)
    .select("*" as never)
    .eq("school_id" as never, user.schoolId)
    .order("sort_order" as never, { ascending: true });

  return (data ?? []) as Array<Record<string, unknown>>;
}

export async function createDirectorAction(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const user = await requireAdmin();

  const parsed = directorSchema.safeParse({
    fullNameTg: formData.get("fullNameTg"),
    fullNameRu: formData.get("fullNameRu") || undefined,
    fullNameEn: formData.get("fullNameEn") || undefined,
    positionTg: formData.get("positionTg"),
    positionRu: formData.get("positionRu") || undefined,
    positionEn: formData.get("positionEn") || undefined,
    photoUrl: formData.get("photoUrl") || undefined,
    yearStart: formData.get("yearStart"),
    yearEnd: formData.get("yearEnd") || undefined,
    sortOrder: formData.get("sortOrder") || 0,
  });

  if (!parsed.success) {
    return { error: "invalidData" };
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("directors" as never)
    .insert({
      school_id: user.schoolId,
      full_name_tg: parsed.data.fullNameTg,
      full_name_ru: parsed.data.fullNameRu ?? null,
      full_name_en: parsed.data.fullNameEn ?? null,
      position_tg: parsed.data.positionTg,
      position_ru: parsed.data.positionRu ?? null,
      position_en: parsed.data.positionEn ?? null,
      photo_url: parsed.data.photoUrl ?? null,
      year_start: parsed.data.yearStart,
      year_end: parsed.data.yearEnd ?? null,
      sort_order: parsed.data.sortOrder,
    } as never);

  if (error) {
    return { error: "saveFailed" };
  }

  revalidatePath("/admin/directors");
  revalidatePath("/");
  return { error: null };
}

export async function deleteDirectorAction(id: string) {
  await requireAdmin();

  const supabase = await createServerClient();
  await supabase
    .from("directors" as never)
    .delete()
    .eq("id" as never, id);

  revalidatePath("/admin/directors");
  revalidatePath("/");
}

export async function toggleDirectorVisibilityAction(id: string, isVisible: boolean) {
  await requireAdmin();

  const supabase = await createServerClient();
  await supabase
    .from("directors" as never)
    .update({ is_visible: isVisible } as never)
    .eq("id" as never, id);

  revalidatePath("/admin/directors");
  revalidatePath("/");
}
```

- [ ] **Step 2: Create director form component**

Create `src/app/(dashboard)/admin/directors/director-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createDirectorAction } from "./actions";
import { Plus } from "lucide-react";

export function DirectorForm() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [state, formAction, isPending] = useActionState(createDirectorAction, { error: null });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-5 w-5" />
          {t("addDirector")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">{t("nameTg")}</label>
              <Input name="fullNameTg" required />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">{t("nameRu")}</label>
              <Input name="fullNameRu" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">{t("nameEn")}</label>
              <Input name="fullNameEn" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">{t("positionTg")}</label>
              <Input name="positionTg" required />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">{t("positionRu")}</label>
              <Input name="positionRu" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">{t("positionEn")}</label>
              <Input name="positionEn" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">{t("yearStart")}</label>
              <Input name="yearStart" type="number" min="1900" max="2100" required />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">{t("yearEnd")}</label>
              <Input name="yearEnd" type="number" min="1900" max="2100" placeholder={t("currentDirector")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">{t("sortOrder")}</label>
              <Input name="sortOrder" type="number" defaultValue="0" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-500">{t("photoUrl")}</label>
            <Input name="photoUrl" placeholder="https://..." />
          </div>
          {state.error && (
            <p className="text-sm text-error-600">{t(state.error)}</p>
          )}
          <Button type="submit" loading={isPending} className="press-scale">
            {tc("create")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Create directors list component**

Create `src/app/(dashboard)/admin/directors/directors-list.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { deleteDirectorAction, toggleDirectorVisibilityAction } from "./actions";
import { Trash2, Eye, EyeOff } from "lucide-react";

interface DirectorsListProps {
  directors: Array<Record<string, unknown>>;
}

export function DirectorsList({ directors }: DirectorsListProps) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("directorsList")}</CardTitle>
      </CardHeader>
      <CardContent>
        {directors.length === 0 ? (
          <p className="text-sm text-neutral-500">{tc("noData")}</p>
        ) : (
          <div className="space-y-3">
            {directors.map((d, i) => (
              <div
                key={String(d.id)}
                className="flex items-center justify-between rounded-lg border border-neutral-200 p-3 animate-list-item"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {d.photo_url ? (
                    <img
                      src={String(d.photo_url)}
                      alt={String(d.full_name_tg)}
                      className="h-10 w-10 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-700">
                      {String(d.full_name_tg).charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-neutral-900 truncate">{String(d.full_name_tg)}</p>
                    <p className="text-xs text-neutral-500">
                      {String(d.position_tg)} · {String(d.year_start)}–{d.year_end ? String(d.year_end) : "..."}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <form action={toggleDirectorVisibilityAction.bind(null, String(d.id), !d.is_visible)}>
                    <Button variant="ghost" size="icon" className="press-scale">
                      {d.is_visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-neutral-400" />}
                    </Button>
                  </form>
                  <form action={deleteDirectorAction.bind(null, String(d.id))}>
                    <Button variant="ghost" size="icon" className="text-error-600 press-scale">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Create directors page**

Create `src/app/(dashboard)/admin/directors/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/guard";
import { getDirectorsAction } from "./actions";
import { DirectorsList } from "./directors-list";
import { DirectorForm } from "./director-form";

export default async function DirectorsPage() {
  await requireAdmin();
  const t = await getTranslations("admin");
  const directors = await getDirectorsAction();

  return (
    <div className="space-y-6 animate-in">
      <h1 className="text-2xl font-bold text-neutral-900">{t("directors")}</h1>
      <DirectorForm />
      <DirectorsList directors={directors} />
    </div>
  );
}
```

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/admin/directors/
git commit -m "feat: add directors CRUD management with trilingual fields"
```

---

### Task 10: Storage — Public Images Bucket and Upload Actions

**Files:**
- Create: `src/lib/storage/public-images.ts`
- Modify: `src/app/(dashboard)/admin/landing/actions.ts` — add image upload action
- Modify: `src/app/(dashboard)/admin/directors/actions.ts` — add photo upload action

**Interfaces:**
- Consumes: `createAdminClient()` from `@/lib/supabase/admin`, `requireAdmin()` from `@/lib/admin/guard`
- Produces: `uploadPublicImage(schoolId, path, file): Promise<string>`, `deletePublicImage(path): Promise<void>`, `uploadLandingImageAction(formData)`, `uploadDirectorPhotoAction(formData)`

- [ ] **Step 1: Create public images storage helper**

Create `src/lib/storage/public-images.ts`:

```typescript
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "public-images";
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function uploadPublicImage(
  schoolId: string,
  subPath: string,
  file: File
): Promise<string> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Invalid file type");
  }
  if (file.size > MAX_SIZE) {
    throw new Error("File too large");
  }

  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${schoolId}/${subPath}/${Date.now()}.${ext}`;

  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function deletePublicImage(url: string): Promise<void> {
  const admin = createAdminClient();
  const bucketUrl = admin.storage.from(BUCKET).getPublicUrl("").data.publicUrl;
  const path = url.replace(bucketUrl, "");
  if (!path) return;

  await admin.storage.from(BUCKET).remove([path]);
}
```

- [ ] **Step 2: Add image upload action to landing CMS**

Add to `src/app/(dashboard)/admin/landing/actions.ts`:

```typescript
import { uploadPublicImage } from "@/lib/storage/public-images";

export async function uploadLandingImageAction(
  _prevState: { error: string | null; url: string | null },
  formData: FormData
): Promise<{ error: string | null; url: string | null }> {
  const user = await requireAdmin();
  const file = formData.get("file") as File;

  if (!file || file.size === 0) {
    return { error: "noFile", url: null };
  }

  try {
    const url = await uploadPublicImage(user.schoolId, "landing", file);
    revalidatePath("/admin/landing");
    revalidatePath("/");
    return { error: null, url };
  } catch {
    return { error: "uploadFailed", url: null };
  }
}
```

- [ ] **Step 3: Add photo upload action to directors**

Add to `src/app/(dashboard)/admin/directors/actions.ts`:

```typescript
import { uploadPublicImage } from "@/lib/storage/public-images";

export async function uploadDirectorPhotoAction(
  _prevState: { error: string | null; url: string | null },
  formData: FormData
): Promise<{ error: string | null; url: string | null }> {
  const user = await requireAdmin();
  const file = formData.get("file") as File;

  if (!file || file.size === 0) {
    return { error: "noFile", url: null };
  }

  try {
    const url = await uploadPublicImage(user.schoolId, "directors", file);
    revalidatePath("/admin/directors");
    revalidatePath("/");
    return { error: null, url };
  } catch {
    return { error: "uploadFailed", url: null };
  }
}
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/public-images.ts src/app/\(dashboard\)/admin/landing/actions.ts src/app/\(dashboard\)/admin/directors/actions.ts
git commit -m "feat: add public images storage with upload actions for landing and directors"
```

---

### Task 11: i18n — All New Translation Keys

**Files:**
- Modify: `src/i18n/tg.json`
- Modify: `src/i18n/ru.json`
- Modify: `src/i18n/en.json`

**Interfaces:**
- Consumes: All new components from Tasks 4-10 that call `useTranslations()` or `getTranslations()`
- Produces: Complete translation key coverage for: `auth.register*`, `auth.otp*`, `auth.reset*`, `auth.invitation*`, `landing.*`, `admin.landing*`, `admin.directors*`, `admin.invitations*`

- [ ] **Step 1: Add all new keys to tg.json**

Add these keys to `src/i18n/tg.json`:

In the `"auth"` section, add:

```json
    "registerTitle": "Бақайдгирӣ",
    "registerEmailStep": "Почтаи электронии худро ворид кунед",
    "registerOtpStep": "Рамзи тасдиқро ворид кунед",
    "registerCompleteStep": "Маълумоти худро пурра кунед",
    "registerButton": "Бақайд гирифтан",
    "sendOtp": "Рамз фиристодан",
    "verifyOtp": "Тасдиқ кардан",
    "otpCode": "Рамзи тасдиқ (6 рақам)",
    "otpSentTo": "Рамз ба {email} фиристода шуд",
    "invitationCode": "Рамзи даъватнома",
    "firstName": "Ном",
    "lastName": "Насаб",
    "middleName": "Номи падар",
    "passwordHint": "Ҳадди ақал 8 рамз",
    "newPassword": "Рамзи нав",
    "noAccount": "Ҳисоб надоред?",
    "hasAccount": "Ҳисоб доред?",
    "forgotPassword": "Рамзро фаромӯш кардед?",
    "resetTitle": "Барқарор кардани рамз",
    "resetEmailStep": "Почтаи электронии худро ворид кунед",
    "resetSentStep": "Линки барқарорсозӣ ба почтаи шумо фиристода шуд",
    "resetNewPasswordStep": "Рамзи навро ворид кунед",
    "sendResetLink": "Линк фиристодан",
    "updatePassword": "Рамзро навсозӣ кардан",
    "backToLogin": "Бозгашт ба воридшавӣ",
    "invalidEmail": "Почтаи электронӣ нодуруст аст",
    "otpSendFailed": "Фиристодани рамз нашуд",
    "otpVerifyFailed": "Рамзи тасдиқ нодуруст аст",
    "invalidOtp": "Рамзи тасдиқ бояд 6 рақам бошад",
    "invalidInvitationCode": "Рамзи даъватнома нодуруст аст",
    "invitationCodeUsed": "Рамзи даъватнома истифода шудааст",
    "invitationCodeExpired": "Рамзи даъватнома мӯҳлаташ гузаштааст",
    "passwordSetFailed": "Гузоштани рамз нашуд",
    "alreadyRegistered": "Шумо аллакай бақайд гирифта шудаед",
    "registrationFailed": "Бақайдгирӣ нашуд",
    "invalidData": "Маълумот нодуруст аст",
    "resetSendFailed": "Фиристодани линк нашуд",
    "invalidPassword": "Рамз бояд ҳадди ақал 8 рамз бошад",
    "passwordUpdateFailed": "Навсозии рамз нашуд",
    "passwordReset": "Рамз бомуваффақият навсозӣ шуд"
```

Add a new `"landing"` section:

```json
  "landing": {
    "login": "Воридшавӣ",
    "register": "Бақайдгирӣ",
    "joinUs": "Ба система ворид шавед",
    "directorsTitle": "Роҳбарони мактаб",
    "galleryTitle": "Суратҳо",
    "contactsTitle": "Тамос ва дастгирӣ"
  }
```

Add to the `"admin"` section:

```json
    "landing": "Саҳифаи асосӣ",
    "landingEditor": "Таҳрири саҳифаи асосӣ",
    "directors": "Директорон",
    "directorsList": "Рӯйхати директорон",
    "addDirector": "Илова кардани директор",
    "invitations": "Даъватномаҳо",
    "createInvitation": "Эҷоди даъватнома",
    "activeInvitations": "Даъватномаҳои фаъол",
    "role": "Нақш",
    "maxUses": "Миқдори истифода",
    "expiresInDays": "Мӯҳлат (рӯз)",
    "cannotGrantAdmin": "Рамзи даъватнома наметавонад нақши admin-ро диҳад",
    "section_hero": "Сарлавҳа",
    "section_about": "Дар бораи мактаб",
    "section_events": "Рӯйдодҳо",
    "section_gallery": "Суратҳо",
    "section_support": "Дастгирӣ",
    "bodyTg": "Матн (TG)",
    "bodyRu": "Матн (RU)",
    "bodyEn": "Матн (EN)",
    "heroImage": "Сурати сарлавҳа",
    "nameTg": "Ном (TG)",
    "nameRu": "Ном (RU)",
    "nameEn": "Ном (EN)",
    "positionTg": "Мансаб (TG)",
    "positionRu": "Мансаб (RU)",
    "positionEn": "Мансаб (EN)",
    "yearStart": "Соли оғоз",
    "yearEnd": "Соли анҷом",
    "currentDirector": "Ҳозира",
    "sortOrder": "Тартиб",
    "photoUrl": "URL-и сурат"
```

- [ ] **Step 2: Add all new keys to ru.json**

Add the same structure to `src/i18n/ru.json` with Russian translations:

In `"auth"`:
```json
    "registerTitle": "Регистрация",
    "registerEmailStep": "Введите ваш email",
    "registerOtpStep": "Введите код подтверждения",
    "registerCompleteStep": "Заполните ваши данные",
    "registerButton": "Зарегистрироваться",
    "sendOtp": "Отправить код",
    "verifyOtp": "Подтвердить",
    "otpCode": "Код подтверждения (6 цифр)",
    "otpSentTo": "Код отправлен на {email}",
    "invitationCode": "Код приглашения",
    "firstName": "Имя",
    "lastName": "Фамилия",
    "middleName": "Отчество",
    "passwordHint": "Минимум 8 символов",
    "newPassword": "Новый пароль",
    "noAccount": "Нет аккаунта?",
    "hasAccount": "Уже есть аккаунт?",
    "forgotPassword": "Забыли пароль?",
    "resetTitle": "Восстановление пароля",
    "resetEmailStep": "Введите ваш email",
    "resetSentStep": "Ссылка для восстановления отправлена на вашу почту",
    "resetNewPasswordStep": "Введите новый пароль",
    "sendResetLink": "Отправить ссылку",
    "updatePassword": "Обновить пароль",
    "backToLogin": "Вернуться ко входу",
    "invalidEmail": "Некорректный email",
    "otpSendFailed": "Не удалось отправить код",
    "otpVerifyFailed": "Неверный код подтверждения",
    "invalidOtp": "Код подтверждения должен содержать 6 цифр",
    "invalidInvitationCode": "Неверный код приглашения",
    "invitationCodeUsed": "Код приглашения уже использован",
    "invitationCodeExpired": "Срок действия кода истёк",
    "passwordSetFailed": "Не удалось установить пароль",
    "alreadyRegistered": "Вы уже зарегистрированы",
    "registrationFailed": "Регистрация не удалась",
    "invalidData": "Некорректные данные",
    "resetSendFailed": "Не удалось отправить ссылку",
    "invalidPassword": "Пароль должен содержать минимум 8 символов",
    "passwordUpdateFailed": "Не удалось обновить пароль",
    "passwordReset": "Пароль успешно обновлён"
```

Add `"landing"`:
```json
  "landing": {
    "login": "Войти",
    "register": "Регистрация",
    "joinUs": "Войти в систему",
    "directorsTitle": "Руководители школы",
    "galleryTitle": "Фотографии",
    "contactsTitle": "Контакты и поддержка"
  }
```

Add to `"admin"`:
```json
    "landing": "Главная страница",
    "landingEditor": "Редактор главной страницы",
    "directors": "Директора",
    "directorsList": "Список директоров",
    "addDirector": "Добавить директора",
    "invitations": "Приглашения",
    "createInvitation": "Создать приглашение",
    "activeInvitations": "Активные приглашения",
    "role": "Роль",
    "maxUses": "Количество использований",
    "expiresInDays": "Срок (дней)",
    "cannotGrantAdmin": "Код приглашения не может давать роль администратора",
    "section_hero": "Заголовок",
    "section_about": "О школе",
    "section_events": "События",
    "section_gallery": "Фотографии",
    "section_support": "Поддержка",
    "bodyTg": "Текст (TG)",
    "bodyRu": "Текст (RU)",
    "bodyEn": "Текст (EN)",
    "heroImage": "Фото заголовка",
    "nameTg": "Имя (TG)",
    "nameRu": "Имя (RU)",
    "nameEn": "Имя (EN)",
    "positionTg": "Должность (TG)",
    "positionRu": "Должность (RU)",
    "positionEn": "Должность (EN)",
    "yearStart": "Год начала",
    "yearEnd": "Год окончания",
    "currentDirector": "Нынешний",
    "sortOrder": "Порядок",
    "photoUrl": "URL фото"
```

- [ ] **Step 3: Add all new keys to en.json**

Add the same structure to `src/i18n/en.json` with English translations:

In `"auth"`:
```json
    "registerTitle": "Registration",
    "registerEmailStep": "Enter your email address",
    "registerOtpStep": "Enter the verification code",
    "registerCompleteStep": "Complete your profile",
    "registerButton": "Register",
    "sendOtp": "Send Code",
    "verifyOtp": "Verify",
    "otpCode": "Verification code (6 digits)",
    "otpSentTo": "Code sent to {email}",
    "invitationCode": "Invitation Code",
    "firstName": "First Name",
    "lastName": "Last Name",
    "middleName": "Middle Name",
    "passwordHint": "At least 8 characters",
    "newPassword": "New Password",
    "noAccount": "Don't have an account?",
    "hasAccount": "Already have an account?",
    "forgotPassword": "Forgot password?",
    "resetTitle": "Reset Password",
    "resetEmailStep": "Enter your email address",
    "resetSentStep": "Reset link sent to your email",
    "resetNewPasswordStep": "Enter your new password",
    "sendResetLink": "Send Link",
    "updatePassword": "Update Password",
    "backToLogin": "Back to login",
    "invalidEmail": "Invalid email address",
    "otpSendFailed": "Failed to send code",
    "otpVerifyFailed": "Invalid verification code",
    "invalidOtp": "Code must be 6 digits",
    "invalidInvitationCode": "Invalid invitation code",
    "invitationCodeUsed": "Invitation code already used",
    "invitationCodeExpired": "Invitation code has expired",
    "passwordSetFailed": "Failed to set password",
    "alreadyRegistered": "You are already registered",
    "registrationFailed": "Registration failed",
    "invalidData": "Invalid data",
    "resetSendFailed": "Failed to send reset link",
    "invalidPassword": "Password must be at least 8 characters",
    "passwordUpdateFailed": "Failed to update password",
    "passwordReset": "Password successfully updated"
```

Add `"landing"`:
```json
  "landing": {
    "login": "Sign In",
    "register": "Register",
    "joinUs": "Join the System",
    "directorsTitle": "School Leadership",
    "galleryTitle": "Photo Gallery",
    "contactsTitle": "Contacts & Support"
  }
```

Add to `"admin"`:
```json
    "landing": "Landing Page",
    "landingEditor": "Landing Page Editor",
    "directors": "Directors",
    "directorsList": "Directors List",
    "addDirector": "Add Director",
    "invitations": "Invitations",
    "createInvitation": "Create Invitation",
    "activeInvitations": "Active Invitations",
    "role": "Role",
    "maxUses": "Max Uses",
    "expiresInDays": "Expires (days)",
    "cannotGrantAdmin": "Invitation code cannot grant admin role",
    "section_hero": "Hero",
    "section_about": "About School",
    "section_events": "Events",
    "section_gallery": "Photos",
    "section_support": "Support",
    "bodyTg": "Text (TG)",
    "bodyRu": "Text (RU)",
    "bodyEn": "Text (EN)",
    "heroImage": "Hero Image",
    "nameTg": "Name (TG)",
    "nameRu": "Name (RU)",
    "nameEn": "Name (EN)",
    "positionTg": "Position (TG)",
    "positionRu": "Position (RU)",
    "positionEn": "Position (EN)",
    "yearStart": "Start Year",
    "yearEnd": "End Year",
    "currentDirector": "Current",
    "sortOrder": "Sort Order",
    "photoUrl": "Photo URL"
```

- [ ] **Step 4: Verify key parity**

Run: `node -e "const tg=Object.keys(JSON.stringify(require('./src/i18n/tg.json'))).length; const ru=Object.keys(JSON.stringify(require('./src/i18n/ru.json'))).length; const en=Object.keys(JSON.stringify(require('./src/i18n/en.json'))).length; console.log({tg,ru,en}); if(tg!==ru||ru!==en) process.exit(1)"`

Or manually verify all three files have the same key count after changes.

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit && npx next build`
Expected: Clean build with all routes

- [ ] **Step 6: Commit**

```bash
git add src/i18n/tg.json src/i18n/ru.json src/i18n/en.json
git commit -m "feat: add trilingual translations for registration, landing, directors, invitations"
```

---

### Task 12: Security Audit + Final Build Verification

**Files:**
- No new files — verification only

**Interfaces:**
- Consumes: All files from Tasks 1-11
- Produces: Verified security posture and clean production build

- [ ] **Step 1: Verify Super Admin cannot be created via UI**

Check these files:
- `src/app/(public)/register/actions.ts` — `completeRegistrationAction` never sets `is_super_admin`
- `supabase/migrations/00015_super_admin_and_cms.sql` — `is_super_admin` has `DEFAULT false`
- No server action accepts `is_super_admin` from form data

- [ ] **Step 2: Verify invitation codes cannot grant admin role**

Check:
- `supabase/migrations/00015_super_admin_and_cms.sql` — trigger `trg_check_invitation_role_level` rejects `level = 1` roles
- `src/app/(dashboard)/admin/invitations/actions.ts` — `getRolesForInvitationAction` filters `.gt("level", 1)`

- [ ] **Step 3: Verify school_id never from client**

Grep: `grep -rn "formData.get.*school" src/` — should return nothing
Grep: `grep -rn "school_id.*formData\|formData.*schoolId" src/` — should return nothing

- [ ] **Step 4: Verify public page shows only published content**

Check RLS policies in migration:
- `pages_anon_read` — `USING (is_published = true)`
- `content_blocks_anon_read` — `USING (is_visible = true AND ...)`
- `directors_public_read` — `USING (is_visible = true)`

- [ ] **Step 5: Verify admin mutations require authorization**

Grep: `grep -rn "requireAdmin\|requireSuperAdmin" src/app/(dashboard)/admin/` — every action file should call one of these

- [ ] **Step 6: Verify storage path is server-validated**

Check `src/lib/storage/public-images.ts` — path constructed from `schoolId` parameter (from `requireAdmin()`, not client)

- [ ] **Step 7: Run full build**

Run: `npx tsc --noEmit && npx next build`
Expected: Clean build with ~35+ routes including new landing, register, reset-password, admin/landing, admin/directors, admin/invitations

- [ ] **Step 8: Commit any fixes**

If any security issues found, fix and commit:

```bash
git add -A
git commit -m "fix: security audit fixes for Phase 6"
```
