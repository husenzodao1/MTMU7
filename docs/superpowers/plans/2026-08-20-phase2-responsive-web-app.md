# Phase 2 — Responsive Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make МТМУ №7 a fully responsive web application with professional mobile UX, PWA support, and performance optimizations.

**Architecture:** Next.js App Router + Supabase. All changes are UI/UX layer — no database schema changes, no RLS modifications, no auth flow changes.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS, next-intl, Supabase SSR, Lucide icons

## Global Constraints

- Never break RLS, RBAC, auth, registration, or school isolation
- Never use service_role key on client
- All responsive changes are CSS/layout only — no data model changes
- Breakpoint strategy: mobile-first with sm(640), md(768), lg(1024), xl(1280)
- i18n: all new user-facing strings must be in tg.json, ru.json, en.json
- Touch targets minimum 44px on mobile
- No horizontal scroll at any breakpoint
- Tables get overflow-x-auto wrapper at minimum; card view on mobile preferred
- Test at 320px, 375px, 390px, 430px, 768px, 1024px, 1280px, 1440px

---

### Task 1: Mobile Bottom Navigation Bar

**Files:**
- Create: `src/components/layout/bottom-nav.tsx`
- Modify: `src/app/(dashboard)/dashboard-shell.tsx`
- Modify: `src/components/layout/header.tsx`

**Interfaces:**
- Consumes: `enabledModules: string[]`, `notificationCount: number`, `unreadMessages: number` from DashboardShell
- Produces: `<BottomNav>` component rendered in DashboardShell

- [ ] **Step 1: Create BottomNav component**

Create `src/components/layout/bottom-nav.tsx`:
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LayoutDashboard, MessageSquare, BookOpen, Bell, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

interface BottomNavProps {
  notificationCount?: number;
  unreadMessages?: number;
  onMenuToggle: () => void;
}

export function BottomNav({ notificationCount = 0, unreadMessages = 0, onMenuToggle }: BottomNavProps) {
  const pathname = usePathname();
  const t = useTranslations();

  const items = [
    { label: t("nav.dashboard"), href: "/dashboard", icon: LayoutDashboard },
    { label: t("nav.messages"), href: "/messages", icon: MessageSquare, badge: unreadMessages },
    { label: t("nav.library"), href: "/library", icon: BookOpen },
    { label: t("nav.notifications"), href: "/notifications", icon: Bell, badge: notificationCount },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[100] border-t border-neutral-200 bg-white lg:hidden">
      <div className="flex items-center justify-around">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                active ? "text-primary-600" : "text-neutral-400"
              )}
            >
              <span className="relative">
                <Icon className="h-5 w-5" />
                {item.badge && item.badge > 0 && (
                  <span className="absolute -right-1.5 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-error-500 px-0.5 text-[9px] font-medium text-white">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </span>
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
        <button
          onClick={onMenuToggle}
          className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-neutral-400"
        >
          <Menu className="h-5 w-5" />
          <span>{t("nav.menu")}</span>
        </button>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Add i18n key for "Menu"**

Add `"menu": "Меню"` / `"Menu"` / `"Меню"` to nav namespace in all 3 locale files.

- [ ] **Step 3: Integrate BottomNav into DashboardShell**

In `dashboard-shell.tsx`, add `<BottomNav>` after `</main>` inside the flex container. Pass `notificationCount`, `onMenuToggle`. Add `pb-16 lg:pb-0` to main to account for bottom nav height.

- [ ] **Step 4: Build and test**

Run `npm run build` to verify no errors. Test at 375px and 1280px.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/bottom-nav.tsx src/app/\(dashboard\)/dashboard-shell.tsx src/i18n/tg.json src/i18n/ru.json src/i18n/en.json
git commit -m "feat: add mobile bottom navigation bar"
```

---

### Task 2: Mobile Navigation Drawer Improvements

**Files:**
- Modify: `src/components/layout/mobile-nav.tsx`
- Modify: `src/app/(dashboard)/dashboard-shell.tsx`

**Interfaces:**
- Consumes: `user: UserWithRole` (added prop for avatar/name display)
- Produces: improved `<MobileNav>` with user info, badges

- [ ] **Step 1: Add user info to MobileNav**

Add `user` prop to MobileNavProps. At top of drawer, after school logo section, add user avatar + name + role display. Add unread counts as badges on Messages and Notifications nav items.

- [ ] **Step 2: Pass user prop from DashboardShell**

Pass `user` prop to `<MobileNav>`.

- [ ] **Step 3: Build and test**

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/mobile-nav.tsx src/app/\(dashboard\)/dashboard-shell.tsx
git commit -m "feat: improve mobile navigation drawer with user info and badges"
```

---

### Task 3: Responsive Table Component

**Files:**
- Create: `src/components/ui/responsive-table.tsx`

**Interfaces:**
- Produces: `<ResponsiveTable>` with desktop table + mobile cards pattern
- Produces: `<MobileCard>` for individual card items

- [ ] **Step 1: Create responsive table component**

Create `src/components/ui/responsive-table.tsx`:
- Desktop (md+): render children wrapped in `overflow-x-auto` with proper table styles
- Mobile (<md): render alternative card layout via render prop
- Props: `headers: string[]`, `data: T[]`, `renderRow: (item: T) => ReactNode`, `renderCard: (item: T) => ReactNode`, `emptyMessage?: string`

- [ ] **Step 2: Build and verify**

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/responsive-table.tsx
git commit -m "feat: add responsive table component with mobile card view"
```

---

### Task 4: Admin Pages Responsive — Users, Classes, Subjects

**Files:**
- Modify: `src/app/(dashboard)/admin/users/page.tsx`
- Modify: `src/app/(dashboard)/admin/classes/page.tsx`
- Modify: `src/app/(dashboard)/admin/subjects/page.tsx`
- Modify: `src/app/(dashboard)/admin/roles/page.tsx`
- Modify: `src/app/(dashboard)/admin/modules/page.tsx`
- Modify: `src/app/(dashboard)/admin/page.tsx`

**Interfaces:**
- Consumes: `<ResponsiveTable>` from Task 3

- [ ] **Step 1: Make admin users page responsive**

Read current admin/users/page.tsx. If it has a table, wrap in `overflow-x-auto` and add mobile card alternative. If it shows a list, ensure cards are full-width on mobile.

- [ ] **Step 2: Make admin classes page responsive**

- [ ] **Step 3: Make admin subjects page responsive**

- [ ] **Step 4: Make admin roles, modules pages responsive**

- [ ] **Step 5: Make admin dashboard page responsive**

Ensure the admin page stat grid uses `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` pattern.

- [ ] **Step 6: Build and test**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: make admin pages responsive with mobile card views"
```

---

### Task 5: Admin Pages Responsive — Pending, Graduates, Audit, School, Notifications, Content

**Files:**
- Modify: `src/app/(dashboard)/admin/pending/page.tsx`
- Modify: `src/app/(dashboard)/admin/graduates/page.tsx`
- Modify: `src/app/(dashboard)/admin/audit/page.tsx`
- Modify: `src/app/(dashboard)/admin/school/page.tsx`
- Modify: `src/app/(dashboard)/admin/notifications/page.tsx`
- Modify: `src/app/(dashboard)/admin/content/page.tsx`
- Modify: `src/app/(dashboard)/admin/content/new/page.tsx`
- Modify: `src/app/(dashboard)/admin/content/[pageId]/page.tsx`
- Modify: `src/app/(dashboard)/admin/library/page.tsx`
- Modify: `src/app/(dashboard)/admin/news/page.tsx`

**Interfaces:**
- Consumes: `<ResponsiveTable>` from Task 3

- [ ] **Step 1: Read each page and add responsive classes**

For each page: add overflow-x-auto on tables, mobile card alternatives where needed, responsive grids, full-width buttons on mobile.

- [ ] **Step 2: Build and test**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: make remaining admin pages responsive"
```

---

### Task 6: Messages — Mobile Messenger UX

**Files:**
- Modify: `src/app/(dashboard)/messages/page.tsx`
- Modify: `src/app/(dashboard)/messages/[conversationId]/page.tsx`
- Create or modify: `src/app/(dashboard)/messages/[conversationId]/conversation-view.tsx`
- Modify: `src/app/(dashboard)/messages/conversations-list.tsx`

**Interfaces:**
- Consumes: existing conversation data from actions.ts
- Produces: mobile-optimized messenger experience

- [ ] **Step 1: Messages list page — full width on mobile**

On mobile (<lg), the conversation list takes full width. The empty-state right panel is already `hidden lg:flex`. Ensure list items have proper touch targets and are full-width.

- [ ] **Step 2: Conversation view — mobile header with back button**

Add a mobile header to ConversationView with:
- Back arrow (`<ArrowLeft>`) linking to `/messages`
- Contact/group name
- `lg:hidden` — only shows on mobile

- [ ] **Step 3: Message input — sticky bottom with safe area**

Ensure message input is sticky at bottom, accounts for bottom nav bar (`pb-16 lg:pb-0`), keyboard-friendly.

- [ ] **Step 4: Message bubbles — responsive width**

Ensure message bubbles have `max-w-[85%] lg:max-w-[65%]` for readability.

- [ ] **Step 5: Conversation list — hide on mobile when in conversation**

In `/messages/[conversationId]`, the conversation list should be hidden on mobile. The page should render only the conversation view.

- [ ] **Step 6: Build and test**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: mobile messenger UX for messages"
```

---

### Task 7: Library Responsive

**Files:**
- Modify: `src/app/(dashboard)/library/page.tsx`
- Modify: `src/app/(dashboard)/library/[itemId]/page.tsx`
- Modify: `src/app/(dashboard)/library/favorites/page.tsx`
- Modify: `src/app/(dashboard)/library/history/page.tsx`

**Interfaces:**
- Consumes: existing library data/components

- [ ] **Step 1: Library grid — responsive columns**

Ensure book grid uses `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4` pattern.

- [ ] **Step 2: Book detail — single column mobile**

Ensure book detail page is single column on mobile with stacked layout.

- [ ] **Step 3: Favorites and history — responsive**

Apply same responsive grid and list patterns.

- [ ] **Step 4: Build and test**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: make library pages responsive"
```

---

### Task 8: News, Reports, Dashboard Responsive Polish

**Files:**
- Modify: `src/app/(dashboard)/news/page.tsx`
- Modify: `src/app/(dashboard)/news/[articleId]/page.tsx`
- Modify: `src/app/(dashboard)/news/create/page.tsx`
- Modify: `src/app/(dashboard)/reports/reports-view.tsx`
- Modify: `src/app/(dashboard)/dashboard/page.tsx`

**Interfaces:**
- Consumes: existing data/components

- [ ] **Step 1: News list — responsive grid**

Article list: single column mobile, 2-col md+. Article cards with proper image aspect ratios.

- [ ] **Step 2: News detail — responsive**

Max-width constrained, images responsive, proper padding.

- [ ] **Step 3: News create form — responsive**

Full-width inputs on mobile.

- [ ] **Step 4: Reports view — responsive stat grids**

Ensure stat sections use responsive grid pattern.

- [ ] **Step 5: Dashboard — verify and polish responsive**

Add quick action buttons for mobile (large touch targets to common sections).

- [ ] **Step 6: Build and test**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: make news, reports, dashboard fully responsive"
```

---

### Task 9: Public Pages & Landing Responsive

**Files:**
- Modify: `src/app/(landing)/page.tsx`
- Modify: `src/app/(public)/login/page.tsx`
- Modify: `src/app/(public)/register/page.tsx` and `register-form.tsx`
- Modify: `src/app/(public)/pending/page.tsx`
- Modify: `src/app/(public)/reset-password/page.tsx`

**Interfaces:**
- Consumes: existing page components

- [ ] **Step 1: Landing page responsive audit**

Read landing page, add responsive classes. Hero section, features grid, CTA — all mobile-friendly.

- [ ] **Step 2: Login/Register pages — verify mobile**

Check input sizing, button width, padding on mobile. Forms should be max-w-md centered.

- [ ] **Step 3: Pending page — mobile friendly**

Check layout on small screens.

- [ ] **Step 4: Build and test**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: make public pages and landing fully responsive"
```

---

### Task 10: PWA Manifest & Mobile Meta Tags

**Files:**
- Create: `src/app/manifest.ts`
- Modify: `src/app/layout.tsx`
- Create: `public/icons/` (generated icons)

**Interfaces:**
- Produces: PWA installable experience

- [ ] **Step 1: Create manifest.ts**

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "МТМУ №7",
    short_name: "МТМУ №7",
    description: "Мактаби Таълимии Миёнаи Умумии №7",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
```

- [ ] **Step 2: Add mobile meta tags to root layout**

In `src/app/layout.tsx` metadata export, add:
- `viewport` with `width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover`
- `themeColor`
- `appleWebApp` meta
- Icons

- [ ] **Step 3: Generate app icons**

Create simple SVG-based icons or use canvas-generated PNGs for 192x192 and 512x512.

- [ ] **Step 4: Build and test**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add PWA manifest and mobile meta tags"
```

---

### Task 11: Loading Skeletons & Performance

**Files:**
- Create: `src/app/(dashboard)/dashboard/loading.tsx`
- Create: `src/app/(dashboard)/messages/loading.tsx`
- Create: `src/app/(dashboard)/library/loading.tsx`
- Create: `src/app/(dashboard)/admin/users/loading.tsx`
- Create: `src/app/(dashboard)/notifications/loading.tsx`
- Create: `src/app/(dashboard)/news/loading.tsx`

**Interfaces:**
- Produces: loading.tsx files that show skeleton UI during page loads

- [ ] **Step 1: Create loading skeletons**

For each major page, create a `loading.tsx` that renders skeleton UI matching the page layout. Use the existing `<Skeleton>` component.

- [ ] **Step 2: Verify lazy loading opportunities**

Check for heavy client components that could benefit from `next/dynamic`. Apply where beneficial (e.g., rich text editors, large forms).

- [ ] **Step 3: Build and test**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add loading skeletons for major pages"
```

---

### Task 12: Notifications, Settings, Profile Responsive & Final Polish

**Files:**
- Modify: `src/app/(dashboard)/notifications/notification-list.tsx` (if exists)
- Modify: `src/app/(dashboard)/settings/settings-form.tsx` (if exists)
- Modify: `src/app/(dashboard)/profile/profile-form.tsx` (if exists)
- Modify: `src/app/(dashboard)/about/page.tsx`
- Any remaining pages needing responsive fixes

**Interfaces:**
- Consumes: existing form components

- [ ] **Step 1: Notifications page responsive**

Verify notification list is full-width on mobile with proper spacing.

- [ ] **Step 2: Settings form responsive**

Ensure form inputs are full-width, buttons touchable, layout stacks on mobile.

- [ ] **Step 3: Profile form responsive**

Same patterns as settings.

- [ ] **Step 4: About page responsive**

Verify layout works on mobile.

- [ ] **Step 5: Final sweep — check all stub pages**

Verify grades, attendance, homework, schedule, documents, events, announcements all render properly on mobile (EmptyState centered, no overflow).

- [ ] **Step 6: Build and full test**

Run `npm run build`. Verify no TypeScript errors. Test all pages at 375px and 1280px.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: responsive polish for notifications, settings, profile, and stub pages"
```

---

### Task 13: Full Audit, Build, Deploy

**Files:**
- No new files — verification only

- [ ] **Step 1: TypeScript build**

Run `npm run build` — must pass clean.

- [ ] **Step 2: Desktop browser test**

Open dev server, test all pages at 1280px. Check for: layout issues, console errors, network errors.

- [ ] **Step 3: Mobile browser test**

Test all pages at 375px. Check for: horizontal scroll, touch targets, text clipping, modal issues, navigation.

- [ ] **Step 4: Auth test**

Verify login, session persistence, locale switching work on both mobile and desktop viewports.

- [ ] **Step 5: Fix any issues found**

- [ ] **Step 6: Push, merge, deploy**

```bash
git push origin feat/phase7-registration-pending-graduates
# Merge to main via GitHub API
```

- [ ] **Step 7: Verify production**

Check https://mtmu-7.vercel.app on mobile and desktop after deployment.

- [ ] **Step 8: Final report**

Produce detailed report with: changes, files, commits, merge hash, deployment URL, production status, remaining issues.
