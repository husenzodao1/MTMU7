# Phase 0 — Repository Audit and Architecture Map

Date: 2026-09-14 · Branch: `platform/government-grade` · Base: `main@91708b7`

This document records the state of the repository **before** the government-grade
platform work began, the defects found, and the target architecture that the
following phases implement. It is the reference for every later change.

---

## 1. Stack (as found)

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 16.3 (App Router, Turbopack), React 19.2 | `src/proxy.ts` replaces `middleware.ts` in Next 16 |
| Language | TypeScript 5 `strict` + `noUncheckedIndexedAccess` | Type safety defeated by `as never` casts (955 occurrences), 14 `select("*")` |
| Data | Supabase (PostgreSQL, Auth, Storage, Realtime) via `@supabase/ssr` 0.12 | No generated types (`src/types/database.ts` is a stub) |
| Styling | Tailwind CSS 4, Radix (dialog, dropdown, toast, tooltip, slot), Lucide | Inter declared but never loaded |
| i18n | next-intl 4 (cookie-based locale: `tg`, `ru`, `en`) | Many hardcoded strings |
| Validation | Zod 4 | Used inconsistently |
| Deploy | Vercel (`.vercel/`), no CI, no tests | |

Size: ~19,200 lines of TS/TSX in 230 files, 21 SQL migrations.

## 2. Route map (as found)

```
(landing)   /                       public landing, hardcoded SCHOOL_ID, anon client
(public)    /login /register /reset-password /pending
auth        /auth/callback          open redirect via `next`
(dashboard) /dashboard /messages[/id|/new] /library[/id|/favorites|/history]
            /news[/id|/create] /notifications /profile[/id] /friends /search
            /settings /about /reports
            /grades /attendance /homework /schedule /documents /events
            /announcements          ← "coming soon" placeholders exposed in nav
            /admin/* (18 sections, horizontal pill nav, `requireAdmin` = role slug 'admin')
```

`src/lib/supabase/middleware.ts` lists `/verify` as a public route, but no such page exists.

## 3. Data model (as found)

Tenant column `school_id` on every table; one seeded school
`00000000-0000-0000-0000-000000000001` referenced **literally** in app code
(`register/actions.ts`, `register/data.ts`, `(landing)/page.tsx`).

Tables: schools, users, roles, permissions, user_roles, role_permissions, modules,
school_modules, module_role_access, academic_years, classes, subjects,
class_students, teacher_subjects, conversations, conversation_members, messages,
message_attachments, message_favorites, message_deletions, library_categories,
library_items, library_item_access, library_favorites, library_reading_history,
notifications, notification_settings, audit_logs, pages, content_blocks,
user_settings, directors, invitation_codes, registration_requests,
student_enrollments, user_status_history, news_categories, news_articles,
news_article_categories, friend_requests.

Missing entirely: grades, attendance, homework, timetable, rooms, terms,
parents/guardians, announcements, events, documents, media, homepage sections,
regions/districts, admin scopes. Storage buckets (`avatars`, `library-files`,
`library-covers`, `public-images`) are **not** defined in migrations and have no
storage RLS policies in the repository.

## 4. Findings

Severity: **P0** = exploitable / data exposure / broken core flow ·
**P1** = serious defect · **P2** = quality / UX.

### 4.1 Security

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| SEC-001 | P0 | Deploy archive contained `.env.local`, `.env.local.prod`, `.env.production`, `.env.vercel`. Supabase keys in the archive are placeholders; **Vercel OIDC tokens are real** (expired 2026-08-18 … 2026-09-09). `.env*` files are not tracked in git (verified over all 191 commits). | archive listing, `git log --all -- '.env*'` |
| SEC-002 | P0 | `service_role` used as the normal data path: 19 files, 53 call sites — all chat reads/writes, conversation creation, module checks, registration, search role lookup, library signed URLs, friends. | `grep createAdminClient` |
| SEC-003 | P0 | Conversation/group creation via service role with no validation of target user status or membership rules; `conv_members_insert` RLS lets any school user add anyone to any conversation. | `messages/new/actions.ts`, `00011_rls.sql` |
| SEC-004 | P0 | `users_update_self` allows a user to change `status`, `is_active`, `graduation_*`, names on their own row (only `is_super_admin` is trigger-protected). A pending/blocked user can activate themselves. | `00011_rls.sql`, `00016` |
| SEC-005 | P1 | Middleware trusts `getSession()` (unverified cookie JWT) for routing; pages use `getUser()` but module checks run through service role. | `lib/supabase/middleware.ts` |
| SEC-006 | P0 | All `SECURITY DEFINER` functions except one lack `SET search_path` (`generate_public_id`, `current_user_school_id`, `current_user_has_permission`, `current_user_is_admin`). | `00002`, `00011` |
| SEC-007 | P1 | No security headers (CSP, HSTS, frame protection, Referrer-Policy, nosniff, Permissions-Policy). | `next.config.ts` |
| SEC-008 | P0 | Open redirect: `/auth/callback?next=@evil.example` → `https://host@evil.example`. | `app/auth/callback/route.ts` |
| SEC-009 | P1 | User enumeration: registration answers `alreadyRegistered` for any email before OTP. | `register/actions.ts` |
| SEC-010 | P0 | **`messages_select` (00011) cross-tenant read**: unqualified `conversation_id` inside the sub-select resolves to `cm.conversation_id`, so any user who belongs to any conversation could read every message of every school. Replaced in 00021 — any database that ran 00011 without 00021 is exposed. Same defect in `conv_members_select` (still active). | `00011_rls.sql:737-763` |
| SEC-011 | P0 | `"use server"` on library storage helpers exports `uploadLibraryFile(itemId, fileName, file)` / `deleteLibraryFile(path)` as client-callable actions with unsanitized path segments (`../`) executed with service role. | `lib/storage/library.ts` |
| SEC-012 | P1 | Audit logging silently never worked: inserts go through the user client and `audit_logs` has no INSERT policy. | `admin/users/[userId]/actions.ts` |
| SEC-013 | P1 | Admin authorization is a role-slug check (`slug === 'admin'`), not permissions; `requireSuperAdmin` gates normal school operations. | `lib/admin/guard.ts` |
| SEC-014 | P1 | Admin mutations filter only by `id` (roles, modules, content, library categories, pages) and rely on RLS; `toggleModuleAction` updates `school_modules` for **all** schools matching `module_id` (RLS narrows it, the code does not). | `admin/modules/actions.ts` |
| SEC-015 | P1 | `lib_items_manage`, `lib_categories_manage_admin`, `class_students_manage`, `pages_manage_admin` etc. have `WITH CHECK` without the permission predicate. | `00011_rls.sql` |
| SEC-016 | P2 | Viewport disables zoom (`maximumScale: 1, userScalable: false`) — WCAG 1.4.4 failure. | `app/layout.tsx` |

### 4.2 Functional

| ID | Sev | Finding |
|---|---|---|
| FUN-001 | P0 | Fresh database cannot be built: `00013_user_settings.sql` calls non-existent `public.set_updated_at()`. |
| FUN-002 | P0 | Chat loads the **oldest** 100 messages (`order asc limit 100`); no pagination. Conversation list loads every message of every conversation to compute previews/unread. |
| FUN-003 | P0 | Profile page never loads: selects `schools!inner(name_tg)` (column does not exist) and `class_students.is_active` (does not exist). |
| FUN-004 | P1 | Dashboard queries non-existent table `student_classes`; errors are swallowed into zeroed stats. |
| FUN-005 | P1 | Grades, attendance, homework, schedule, documents, events, announcements are "coming soon" pages exposed in navigation. |
| FUN-006 | P1 | Subjects admin is read-only; no create/edit/archive. |
| FUN-007 | P1 | Reports: nav item visible to every role, page requires admin (`/admin/reports` → `/reports` → forbidden for others); `user_roles` counted without school filter; `"use server"` directive on a page module. |
| FUN-008 | P1 | Hardcoded English in notifications (`"sent you a friend request"`), sidebar (`"Digital Platform"`), error strings returned from actions (`"Forbidden"`, `"Validation failed"`, raw `error.message`). |
| FUN-009 | P1 | Hardcoded school UUID (3 files) and hardcoded school name fallbacks (`МТМУ №7`) in 8 components. |
| FUN-010 | P1 | Users admin list: N+1 queries (2 extra queries per user), no pagination. |
| FUN-011 | P1 | CMS landing renders nothing for a section whose block is missing; `content_blocks.type='html'` allowed (future XSS vector). |
| FUN-012 | P2 | `removeMemberAction`/`pinMessageAction` silently fail (no matching RLS policy). |
| FUN-013 | P2 | Book form allows no category but column is `NOT NULL`. |
| FUN-014 | P2 | Registration writes `registration_requests` then `users` without a transaction. |

### 4.3 Design / UX (spec §70)

Horizontal pill admin nav; `rounded-full` everywhere; gradient + glow active state
in bottom nav (`linear-gradient(145deg, #818cf8, #4f46e5)`); glassmorphism utilities
(`glass-card`, `glass-header`, ambient blur blobs); 9px/10px/11px labels; fake
`⌘K` search affordance that is just a link; `h-screen` viewport math (breaks on
mobile browser chrome); template SVGs (`next.svg`, `vercel.svg`, `globe.svg`,
`window.svg`, `file.svg`); unloaded font; inconsistent icon sizes
(`h-4.5`, `h-[17px]`, `h-[18px]`, `h-16`).

## 5. Target architecture

### 5.1 Principles applied

1. **Forward-only migrations** (`00022+`). Existing migrations stay applied on the
   live database; only FUN-001 is fixed in place with an idempotent function
   definition so fresh installs work.
2. **Database is the authority.** Tenant isolation and permissions are enforced by
   RLS and `SECURITY DEFINER` functions with `SET search_path = ''`. Server
   actions re-check (defense in depth); the UI only hides.
3. **No service role on user paths.** Privileged operations that must bypass RLS
   (Auth admin API: inviting a user) live in `src/lib/privileged/` behind
   `server-only`, each with an explicit permission check and audit record.
4. **Generated types.** `scripts/db/generate-types.ts` applies all migrations to an
   in-process PostgreSQL (PGlite) and emits `src/lib/db/database.types.ts`.

### 5.2 Tenancy model

```
platform (super_admin)
  └─ regions ─ districts ─ schools          (hierarchy optional; nullable FKs)
                              └─ every school-scoped row has school_id
```

* `app.current_school_id()` — the caller's home school from `public.users`.
* `app.admin_scopes` — explicit cross-school grants (`platform`, `region`,
  `district`, `school`) with a scope role (`super_admin`, `ministry_admin`,
  `regional_admin`, `district_admin`).
* `app.has_permission(school_id, permission)` — true when the caller is an active
  member of that school holding a role with the permission, **or** holds a scope
  covering that school whose scope role grants it (scope admins: read-only
  permission set; `super_admin`: all).
* The browser never supplies `school_id`; server code derives it from the session.
* Public site tenant: `/s/[school-slug]/…`; `/` resolves the school from
  `school_domains` (host) or `DEFAULT_SCHOOL_SLUG`, otherwise shows the school
  directory.

### 5.3 Roles and permissions

Per-school system roles (provisioned automatically for every new school):
`admin` (school administrator), `director`, `vice_principal`, `teacher`,
`librarian`, `staff`, `student`, `parent`. Granular permission catalog
(`students.view|create|update|archive`, `grades.view|enter|update|approve`,
`attendance.view|mark|update`, `news.view|create|update|publish|archive`,
`library.*`, `documents.*`, `users.view|approve|update|deactivate`,
`audit.view`, `settings.view|update`, …). Legacy slugs are migrated.

### 5.4 Academic core

People are records independent of login accounts:
`students`, `guardians` + `student_guardians`, `staff` (teachers, librarians,
administrators) — each with an optional `user_id`. Academic structure:
`academic_years` → `academic_terms`; `classes` (year-scoped) → `enrollments`;
`subjects` → `class_subjects` (teacher, weekly hours); `assessment_types` →
`grades`; `attendance_records`; `homework_assignments` → `homework_submissions`;
`periods`, `rooms`, `timetable_entries` (teacher/class/room conflict constraints),
`substitutions`. Teachers can only write grades/attendance/homework for
`class_subjects` assigned to them (RLS).

### 5.5 Content

`news_articles` (slug, summary, category, tags, language, SEO, scheduled
`publish_at`, `expires_at`, visibility, featured, status
`draft→review→approved→published→archived`), `announcements` + targets,
`events`, `documents` + folders + versions, `media_assets`, `library_items`
(extended metadata, status workflow), `site_sections` (structured, validated,
multilingual homepage sections with code fallbacks), `platform_identity`
(ministry name/emblem/footer attribution — owner-supplied placeholders).
Rich text is a safe Markdown subset rendered to React elements; no raw HTML.

### 5.6 Audit

`public.write_audit_log()` (actor and school derived from `auth.uid()`, cannot be
forged) plus row-change triggers on sensitive tables (roles, permissions,
account status, grades, attendance, publishing state, school settings, scopes).

### 5.7 Verification strategy

* `tests/db/*` — migrations + RLS/RBAC/tenant tests on PGlite with a Supabase
  compatibility bootstrap (`auth.uid()`, roles `anon`/`authenticated`/`service_role`,
  `storage` schema).
* `tests/unit/*` — validators, redirect sanitizer, safe Markdown, CSV.
* `npm run typecheck`, `npm run lint`, `npm run build`, GitHub Actions CI.
* Anything not exercised against a live Supabase project is reported as
  **NOT VERIFIED IN LIVE RUNTIME**.
