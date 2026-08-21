# Phase 2 — Responsive Web Application Design

## Goal

Transform МТМУ №7 into a fully responsive web application that works identically on phones (320–430px), tablets (768–1024px), and desktops (1280–1440px). Same account, same data, same experience across all devices.

## Architecture

Next.js App Router + Supabase — no architectural changes. All data stays centralized in Supabase. No separate localStorage copies of critical data. Session cookies handled via `@supabase/ssr` middleware — already device-agnostic.

## Constraints

- DO NOT break RLS, RBAC, auth, registration, OTP, password reset, pending approval, library, news, messages, school branding
- DO NOT use service_role key on client
- DO NOT weaken security or bypass RLS
- DO NOT create separate account systems for phone/desktop
- Migrations 00016, 00017 may not be applied on production — features depending on them are not production-ready until verified
- Phase 3 will NOT be started

## Current State

### Navigation Shell
- **Desktop sidebar** (`hidden lg:flex lg:w-64`) with school logo, module-filtered nav, admin link
- **Mobile drawer** (`MobileNav`) — slide-out from left via hamburger in header
- **Header** — hamburger (lg:hidden), locale switcher, notification bell, user menu
- **No mobile bottom navigation bar**
- Breakpoint: `lg` (1024px) splits mobile/desktop

### Pages with real content (need responsive work)
1. `/dashboard` — role-based stat grids, partially responsive (sm:grid-cols-2 lg:grid-cols-4)
2. `/messages` — split layout (list lg:w-80 | empty-state), conversation view
3. `/library` — book grid, search, favorites, history
4. `/news` — article list, article detail, create
5. `/notifications` — notification list (max-w-3xl)
6. `/settings` — settings form (max-w-2xl)
7. `/profile` — profile form (max-w-2xl)
8. `/reports` — admin stats overview
9. `/admin/*` — 16 admin pages: users table, classes table, subjects, roles, modules, pending, graduates, audit, school settings, content CMS, library admin, news admin

### Stub pages (EmptyState only — trivially responsive)
grades, attendance, homework, schedule, documents, events, announcements

### Public pages
login, register, reset-password, pending, landing

## Design

### 1. Mobile Bottom Navigation Bar

Add a persistent bottom tab bar on mobile (`lg:hidden`) with 5 key items:
- Dashboard (home)
- Messages (with unread badge)
- Library
- Notifications (with count badge)
- Menu (opens full navigation overlay/drawer)

The hamburger header button remains for consistency but the bottom nav becomes the primary mobile navigation.

### 2. Mobile Navigation Improvements

Current mobile drawer is functional but needs:
- User avatar + name at top
- Unread message count badge on Messages
- Notification count badge
- Current locale displayed
- Smoother transitions

### 3. Messages — Mobile Messenger UX

**Mobile (<lg):**
- `/messages` shows conversation list full-width
- `/messages/[conversationId]` shows full-screen chat with back button to list
- No split view on mobile

**Desktop (>=lg):**
- Keep existing split view: list (w-80/w-96) | conversation

**Implementation:**
- Messages layout wraps children in responsive container
- ConversationView gets a mobile header with back arrow + contact name
- Input area sticky at bottom
- Message bubbles responsive (max-width constraint)

### 4. Dashboard Responsive

Already partially responsive. Improvements:
- Stat cards: 1 col on mobile, 2 on sm, 3-4 on lg
- Admin pending alert: stack on mobile
- Quick action links for mobile (large touch targets)

### 5. Admin Pages — Tables to Cards

Admin pages with tables (users, classes, subjects, roles, modules, audit, pending, graduates):
- **Desktop**: keep table layout
- **Mobile**: switch to card/list layout
- Pattern: `hidden md:block` for table, `md:hidden` for cards
- Shared responsive table wrapper component

### 6. Library Responsive

- Book grid: 1 col mobile, 2 sm, 3 md, 4 lg
- Book detail: single column on mobile
- Search/filter: collapsible filter panel on mobile

### 7. News Responsive

- Article list: single column on mobile, 2-col grid on md+
- Article detail: max-width constrained, image responsive
- Create form: full width on mobile

### 8. Forms (Settings, Profile)

Already max-w-2xl centered — naturally responsive. Check:
- Input fields full width
- File upload touch-friendly
- Buttons full width on mobile

### 9. PWA Setup

- `manifest.ts` in app root
- Mobile meta tags in root layout (viewport, theme-color, apple-mobile-web-app)
- App icons (use school logo or generate from initials)
- No service worker (avoid offline sync complexity)

### 10. Performance

- Loading skeletons for dashboard, messages, library, admin tables
- `Promise.all` for independent queries (already done in most places)
- Lazy load heavy components (`next/dynamic`)
- Image optimization via `next/image` where applicable
- No duplicate queries

### 11. Landing Page

Check and fix responsive layout for all breakpoints. Ensure CTAs, hero, features section work on mobile.

### 12. Public Pages (Login, Register, Pending)

Already centered forms — check padding, max-width, input sizing on mobile.

## Breakpoint Strategy

| Range | Name | Layout |
|-------|------|--------|
| 0–639px | mobile | Single column, bottom nav, drawer |
| 640–767px | sm | 2-column grids |
| 768–1023px | md | Tables visible, wider grids |
| 1024+ | lg | Full sidebar, split views |
| 1280+ | xl | Wider panels |

## Testing Matrix

Each page verified at: 320px, 375px, 390px, 430px, 768px, 1024px, 1280px, 1440px

Check for:
- No horizontal scroll
- No text clipping
- Tappable buttons (min 44px touch target)
- Tables don't overflow
- Modals/dialogs closeable
- No overlay issues
- No blank screens
- No navigation errors
