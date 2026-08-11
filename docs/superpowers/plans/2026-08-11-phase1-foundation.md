# Phase 1: Foundation — Project Setup, Database, Auth, RBAC, Design System, App Shell

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the complete project foundation — Next.js app, Supabase database with all core tables/RLS/triggers, authentication, RBAC system, design system with iOS-level motion, i18n, and the authenticated app shell with navigation.

**Architecture:** Next.js App Router with Server Components by default. Supabase for PostgreSQL + Auth + Storage + Realtime. Multi-tenant architecture with school_id on every business table. Three-level permission check: module enabled → role sees module → role has permission. Centralized animation/design token system.

**Tech Stack:** Next.js (latest stable), TypeScript strict, Supabase, Tailwind CSS, next-intl, React Hook Form, Zod, Lucide React

## Global Constraints

- TypeScript strict mode — no `any`, no implicit returns
- All UI text through next-intl — zero hardcoded strings in components
- `service_role` key only in server-side code (API routes, server actions) — never in client bundle
- Server Components by default; Client Components only for interactivity/browser APIs/realtime/state
- No external CDNs or libraries without concrete justification
- Tajik (tg) is default language; Russian (ru) secondary
- `prefers-reduced-motion` respected in all animations
- Every interactive element: hover/focus/active/disabled/loading/error/success states
- Minimum touch target: 44px on mobile
- All Supabase queries scoped by school_id through RLS

---

### Task 1: Project Scaffolding and Configuration

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `tailwind.config.ts`
- Create: `postcss.config.mjs`
- Create: `.env.local.example`
- Create: `.gitignore`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/styles/globals.css`

**Interfaces:**
- Produces: Working Next.js app that renders at `localhost:3000`

- [ ] **Step 1: Initialize Next.js project**

```bash
cd /Users/mehrovar/Desktop/maktabi-miyona-7
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack
```

Select defaults when prompted. This creates the full project scaffold.

- [ ] **Step 2: Verify project runs**

```bash
npm run dev
```

Open `http://localhost:3000` — should see Next.js default page.

- [ ] **Step 3: Configure TypeScript strict mode**

Edit `tsconfig.json` — ensure these compiler options are set:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 4: Create environment template**

Create `.env.local.example`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 5: Update .gitignore**

Append to `.gitignore`:

```
.env.local
.env.production.local
```

- [ ] **Step 6: Commit**

```bash
git init
git add -A
git commit -m "feat: initialize Next.js project with TypeScript strict mode"
```

---

### Task 2: Design Tokens and Animation System

**Files:**
- Create: `src/styles/globals.css` (modify from scaffold)
- Create: `src/lib/constants/design-tokens.ts`
- Create: `tailwind.config.ts` (modify from scaffold)

**Interfaces:**
- Produces: CSS custom properties for colors, spacing, animation timing; Tailwind config extended with design tokens; `cn()` utility for class merging

- [ ] **Step 1: Install class merging utility**

```bash
npm install clsx tailwind-merge
```

- [ ] **Step 2: Create cn() utility**

Create `src/lib/utils.ts`:

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: Define design tokens**

Create `src/lib/constants/design-tokens.ts`:

```typescript
export const DURATION = {
  fast: "150ms",
  normal: "250ms",
  slow: "350ms",
  extraSlow: "500ms",
} as const;

export const EASING = {
  default: "cubic-bezier(0.25, 0.1, 0.25, 1)",
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  out: "cubic-bezier(0, 0, 0.2, 1)",
  in: "cubic-bezier(0.4, 0, 1, 1)",
} as const;

export const Z_INDEX = {
  dropdown: 50,
  sticky: 100,
  overlay: 200,
  modal: 300,
  toast: 400,
  tooltip: 500,
} as const;
```

- [ ] **Step 4: Set up globals.css with CSS custom properties**

Replace `src/styles/globals.css`:

```css
@import "tailwindcss";

@theme {
  /* Colors - Brand */
  --color-primary-50: #eff6ff;
  --color-primary-100: #dbeafe;
  --color-primary-200: #bfdbfe;
  --color-primary-300: #93c5fd;
  --color-primary-400: #60a5fa;
  --color-primary-500: #3b82f6;
  --color-primary-600: #2563eb;
  --color-primary-700: #1d4ed8;
  --color-primary-800: #1e40af;
  --color-primary-900: #1e3a8a;
  --color-primary-950: #172554;

  /* Colors - Neutral */
  --color-neutral-50: #f8fafc;
  --color-neutral-100: #f1f5f9;
  --color-neutral-200: #e2e8f0;
  --color-neutral-300: #cbd5e1;
  --color-neutral-400: #94a3b8;
  --color-neutral-500: #64748b;
  --color-neutral-600: #475569;
  --color-neutral-700: #334155;
  --color-neutral-800: #1e293b;
  --color-neutral-900: #0f172a;
  --color-neutral-950: #020617;

  /* Colors - Semantic */
  --color-success-500: #22c55e;
  --color-success-600: #16a34a;
  --color-warning-500: #f59e0b;
  --color-warning-600: #d97706;
  --color-error-500: #ef4444;
  --color-error-600: #dc2626;
  --color-info-500: #3b82f6;
  --color-info-600: #2563eb;

  /* Spacing */
  --spacing-page: 1.5rem;
  --spacing-section: 2rem;
  --spacing-card: 1rem;

  /* Border Radius */
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);

  /* Animation */
  --duration-fast: 150ms;
  --duration-normal: 250ms;
  --duration-slow: 350ms;
  --duration-extra-slow: 500ms;
  --ease-default: cubic-bezier(0.25, 0.1, 0.25, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
  --ease-in: cubic-bezier(0.4, 0, 1, 1);

  /* Font */
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
}

@layer base {
  * {
    @apply border-neutral-200;
  }

  body {
    @apply bg-neutral-50 text-neutral-900 antialiased;
    font-feature-settings: "rlig" 1, "calt" 1;
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
}

@layer utilities {
  .animate-in {
    animation: animate-in var(--duration-normal) var(--ease-out) forwards;
  }

  .animate-out {
    animation: animate-out var(--duration-fast) var(--ease-in) forwards;
  }

  .animate-fade-in {
    animation: fade-in var(--duration-normal) var(--ease-out) forwards;
  }

  .animate-slide-up {
    animation: slide-up var(--duration-slow) var(--ease-out) forwards;
  }

  .animate-slide-down {
    animation: slide-down var(--duration-slow) var(--ease-in) forwards;
  }

  .animate-scale-in {
    animation: scale-in var(--duration-normal) var(--ease-spring) forwards;
  }

  .animate-shimmer {
    animation: shimmer 2s linear infinite;
    background: linear-gradient(
      90deg,
      var(--color-neutral-200) 0%,
      var(--color-neutral-100) 50%,
      var(--color-neutral-200) 100%
    );
    background-size: 200% 100%;
  }
}

@keyframes animate-in {
  from { opacity: 0; transform: translateY(4px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes animate-out {
  from { opacity: 1; transform: translateY(0) scale(1); }
  to { opacity: 0; transform: translateY(4px) scale(0.98); }
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slide-up {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes slide-down {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(16px); }
}

@keyframes scale-in {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

- [ ] **Step 5: Verify Tailwind picks up design tokens**

```bash
npm run dev
```

Check that the app compiles without errors.

- [ ] **Step 6: Commit**

```bash
git add src/styles/globals.css src/lib/utils.ts src/lib/constants/design-tokens.ts tailwind.config.ts
git commit -m "feat: add design token system with animation primitives"
```

---

### Task 3: Supabase Client Setup

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/admin.ts`
- Create: `src/lib/supabase/middleware.ts`
- Create: `src/middleware.ts`
- Create: `src/types/database.ts`

**Interfaces:**
- Produces: `createClient()` for Client Components, `createServerClient()` for Server Components/Actions, `createAdminClient()` for service_role operations, Next.js middleware for auth session refresh

- [ ] **Step 1: Install Supabase packages**

```bash
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Create database types placeholder**

Create `src/types/database.ts`:

```typescript
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
```

This will be replaced by auto-generated types after migrations run.

- [ ] **Step 3: Create browser client**

Create `src/lib/supabase/client.ts`:

```typescript
"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 4: Create server client**

Create `src/lib/supabase/server.ts`:

```typescript
import { createServerClient as createSSRClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

export async function createServerClient() {
  const cookieStore = await cookies();

  return createSSRClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from Server Component — ignore.
            // Middleware will handle refresh.
          }
        },
      },
    }
  );
}
```

- [ ] **Step 5: Create admin client (service_role)**

Create `src/lib/supabase/admin.ts`:

```typescript
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase admin environment variables");
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
```

- [ ] **Step 6: Create middleware client helper**

Create `src/lib/supabase/middleware.ts`:

```typescript
import { createServerClient as createSSRClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createSSRClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect unauthenticated users away from protected routes
  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/admin") ||
    request.nextUrl.pathname.startsWith("/messages") ||
    request.nextUrl.pathname.startsWith("/library") ||
    request.nextUrl.pathname.startsWith("/profile") ||
    request.nextUrl.pathname.startsWith("/notifications");

  if (!user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages
  const isPublicAuthRoute =
    request.nextUrl.pathname === "/login" ||
    request.nextUrl.pathname === "/register";

  if (user && isPublicAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

- [ ] **Step 7: Create Next.js middleware**

Create `src/middleware.ts`:

```typescript
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/supabase/ src/middleware.ts src/types/database.ts
git commit -m "feat: add Supabase client setup with server/client/admin separation"
```

---

### Task 4: Internationalization (i18n)

**Files:**
- Create: `src/i18n/tg.json`
- Create: `src/i18n/ru.json`
- Create: `src/i18n/request.ts`
- Create: `src/i18n/config.ts`
- Modify: `next.config.ts`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Produces: `useTranslations()` hook available in all components, `getTranslations()` for Server Components, `tg.json` and `ru.json` translation files

- [ ] **Step 1: Install next-intl**

```bash
npm install next-intl
```

- [ ] **Step 2: Create i18n config**

Create `src/i18n/config.ts`:

```typescript
export const locales = ["tg", "ru"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "tg";
```

- [ ] **Step 3: Create Tajik translation file**

Create `src/i18n/tg.json`:

```json
{
  "common": {
    "appName": "МТМУ №7",
    "appFullName": "Мактаби Таълимии Миёнаи Умумии №7 ба номи Мирзие Ҳабибов",
    "loading": "Боргирӣ...",
    "save": "Нигоҳ доштан",
    "cancel": "Бекор кардан",
    "delete": "Нест кардан",
    "edit": "Таҳрир кардан",
    "create": "Эҷод кардан",
    "search": "Ҷустуҷӯ",
    "filter": "Филтр",
    "back": "Бозгашт",
    "next": "Навбатӣ",
    "previous": "Қаблӣ",
    "confirm": "Тасдиқ",
    "close": "Пӯшидан",
    "yes": "Ҳа",
    "no": "Не",
    "retry": "Такрор кунед",
    "refresh": "Навсозӣ",
    "noData": "Маълумот нест",
    "required": "Ҳатмист"
  },
  "auth": {
    "login": "Воридшавӣ",
    "logout": "Баромадан",
    "email": "Почтаи электронӣ",
    "password": "Рамз",
    "loginTitle": "Ба система ворид шавед",
    "loginDescription": "Почтаи электронӣ ва рамзи худро ворид кунед",
    "loginButton": "Ворид шудан",
    "invalidCredentials": "Почтаи электронӣ ё рамз нодуруст аст",
    "sessionExpired": "Вақти сессия ба охир расид. Лутфан дубора ворид шавед"
  },
  "nav": {
    "dashboard": "Панели асосӣ",
    "messages": "Паёмҳо",
    "library": "Китобхона",
    "schedule": "Ҷадвал",
    "grades": "Баҳоҳо",
    "attendance": "Ҳозирӣ",
    "homework": "Вазифаи хонагӣ",
    "documents": "Ҳуҷҷатҳо",
    "events": "Чорабиниҳо",
    "announcements": "Эълонҳо",
    "reports": "Ҳисоботҳо",
    "profile": "Профил",
    "settings": "Танзимот",
    "admin": "Панели маъмурӣ",
    "notifications": "Огоҳиномаҳо"
  },
  "errors": {
    "generic": "Ой. Чизе хато шуд.",
    "genericDescription": "Ин ду боз чизеро вайрон карданд.",
    "notFound": "Саҳифа ёфт нашуд",
    "notFoundDescription": "Саҳифае, ки шумо ҷустуҷӯ мекунед, вуҷуд надорад.",
    "forbidden": "Дастрасӣ манъ аст",
    "forbiddenDescription": "Шумо ба ин бахш дастрасӣ надоред.",
    "networkError": "Хатои шабака",
    "networkErrorDescription": "Лутфан пайвасти интернетро тафтиш кунед.",
    "moduleDisabled": "Ин бахш ғайрифаъол аст",
    "moduleDisabledDescription": "Маъмур ин бахшро ғайрифаъол кардааст.",
    "goHome": "Ба саҳифаи асосӣ",
    "goBack": "Бозгашт"
  },
  "admin": {
    "title": "Панели маъмурӣ",
    "users": "Корбарон",
    "roles": "Нақшҳо",
    "school": "Мактаб",
    "modules": "Бахшҳо",
    "library": "Китобхона",
    "content": "Мундариҷа",
    "notifications": "Огоҳиномаҳо",
    "auditLog": "Журнали амалҳо",
    "classes": "Синфҳо",
    "subjects": "Фанҳо"
  },
  "modules": {
    "messages": "Паёмҳо",
    "library": "Китобхона",
    "grades": "Баҳоҳо ва журнал",
    "attendance": "Ҳозирӣ",
    "homework": "Вазифаи хонагӣ",
    "schedule": "Ҷадвал",
    "documents": "Ҳуҷҷатҳо",
    "events": "Чорабиниҳо",
    "announcements": "Эълонҳо",
    "reports": "Ҳисоботҳо",
    "analytics": "Таҳлил"
  },
  "empty": {
    "noMessages": "Ҳоло паёме нест",
    "noNotifications": "Огоҳиномае нест",
    "noBooks": "Ҳоло китобе нест",
    "noStudents": "Хонандае нест",
    "noResults": "Натиҷае ёфт нашуд"
  },
  "profile": {
    "title": "Профили ман",
    "firstName": "Ном",
    "lastName": "Насаб",
    "middleName": "Номи падар",
    "email": "Почтаи электронӣ",
    "phone": "Телефон",
    "dateOfBirth": "Санаи таваллуд",
    "gender": "Ҷинс",
    "male": "Мард",
    "female": "Зан",
    "class": "Синф",
    "role": "Нақш",
    "publicId": "Рақами шиносоӣ",
    "avatar": "Акс",
    "changeAvatar": "Иваз кардани акс"
  }
}
```

- [ ] **Step 4: Create Russian translation file (secondary)**

Create `src/i18n/ru.json`:

```json
{
  "common": {
    "appName": "МТМУ №7",
    "appFullName": "Мактаби Таълимии Миёнаи Умумии №7 ба номи Мирзие Ҳабибов",
    "loading": "Загрузка...",
    "save": "Сохранить",
    "cancel": "Отмена",
    "delete": "Удалить",
    "edit": "Редактировать",
    "create": "Создать",
    "search": "Поиск",
    "filter": "Фильтр",
    "back": "Назад",
    "next": "Далее",
    "previous": "Назад",
    "confirm": "Подтвердить",
    "close": "Закрыть",
    "yes": "Да",
    "no": "Нет",
    "retry": "Повторить",
    "refresh": "Обновить",
    "noData": "Нет данных",
    "required": "Обязательно"
  },
  "auth": {
    "login": "Вход",
    "logout": "Выход",
    "email": "Электронная почта",
    "password": "Пароль",
    "loginTitle": "Войдите в систему",
    "loginDescription": "Введите вашу электронную почту и пароль",
    "loginButton": "Войти",
    "invalidCredentials": "Неверная почта или пароль",
    "sessionExpired": "Сессия истекла. Пожалуйста, войдите снова"
  },
  "nav": {
    "dashboard": "Главная",
    "messages": "Сообщения",
    "library": "Библиотека",
    "schedule": "Расписание",
    "grades": "Оценки",
    "attendance": "Посещаемость",
    "homework": "Домашнее задание",
    "documents": "Документы",
    "events": "Мероприятия",
    "announcements": "Объявления",
    "reports": "Отчёты",
    "profile": "Профиль",
    "settings": "Настройки",
    "admin": "Админ-панель",
    "notifications": "Уведомления"
  },
  "errors": {
    "generic": "Ой. Что-то пошло не так.",
    "genericDescription": "Эти двое опять что-то сломали.",
    "notFound": "Страница не найдена",
    "notFoundDescription": "Страница, которую вы ищете, не существует.",
    "forbidden": "Доступ запрещён",
    "forbiddenDescription": "У вас нет доступа к этому разделу.",
    "networkError": "Ошибка сети",
    "networkErrorDescription": "Пожалуйста, проверьте подключение к интернету.",
    "moduleDisabled": "Этот раздел отключён",
    "moduleDisabledDescription": "Администратор отключил этот раздел.",
    "goHome": "На главную",
    "goBack": "Назад"
  },
  "admin": {
    "title": "Админ-панель",
    "users": "Пользователи",
    "roles": "Роли",
    "school": "Школа",
    "modules": "Модули",
    "library": "Библиотека",
    "content": "Контент",
    "notifications": "Уведомления",
    "auditLog": "Журнал действий",
    "classes": "Классы",
    "subjects": "Предметы"
  },
  "modules": {
    "messages": "Сообщения",
    "library": "Библиотека",
    "grades": "Оценки и журнал",
    "attendance": "Посещаемость",
    "homework": "Домашнее задание",
    "schedule": "Расписание",
    "documents": "Документы",
    "events": "Мероприятия",
    "announcements": "Объявления",
    "reports": "Отчёты",
    "analytics": "Аналитика"
  },
  "empty": {
    "noMessages": "Пока нет сообщений",
    "noNotifications": "Нет уведомлений",
    "noBooks": "Пока нет книг",
    "noStudents": "Нет учеников",
    "noResults": "Ничего не найдено"
  },
  "profile": {
    "title": "Мой профиль",
    "firstName": "Имя",
    "lastName": "Фамилия",
    "middleName": "Отчество",
    "email": "Электронная почта",
    "phone": "Телефон",
    "dateOfBirth": "Дата рождения",
    "gender": "Пол",
    "male": "Мужской",
    "female": "Женский",
    "class": "Класс",
    "role": "Роль",
    "publicId": "Идентификатор",
    "avatar": "Фото",
    "changeAvatar": "Изменить фото"
  }
}
```

- [ ] **Step 5: Create i18n request config**

Create `src/i18n/request.ts`:

```typescript
import { getRequestConfig } from "next-intl/server";
import { defaultLocale } from "./config";

export default getRequestConfig(async () => {
  const locale = defaultLocale;

  return {
    locale,
    messages: (await import(`./${locale}.json`)).default,
  };
});
```

- [ ] **Step 6: Update next.config.ts**

Modify `next.config.ts`:

```typescript
import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {};

export default withNextIntl(nextConfig);
```

- [ ] **Step 7: Update root layout with NextIntlClientProvider**

Replace `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "МТМУ №7",
  description: "Мактаби Таълимии Миёнаи Умумии №7 ба номи Мирзие Ҳабибов",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-screen font-sans">
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 8: Verify i18n works**

Update `src/app/page.tsx` temporarily to test:

```tsx
import { useTranslations } from "next-intl";

export default function Home() {
  const t = useTranslations("common");
  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="text-3xl font-bold">{t("appName")}</h1>
    </main>
  );
}
```

Run `npm run dev` — should see "МТМУ №7" rendered.

- [ ] **Step 9: Commit**

```bash
git add src/i18n/ next.config.ts src/app/layout.tsx src/app/page.tsx
git commit -m "feat: add i18n with Tajik (default) and Russian translations"
```

---

### Task 5: Database Migrations — Core Tables

**Files:**
- Create: `supabase/migrations/00001_schools.sql`
- Create: `supabase/migrations/00002_users.sql`
- Create: `supabase/migrations/00003_rbac.sql`
- Create: `supabase/migrations/00004_school_structure.sql`
- Create: `supabase/migrations/00005_modules.sql`
- Create: `supabase/migrations/00006_messaging.sql`
- Create: `supabase/migrations/00007_library.sql`
- Create: `supabase/migrations/00008_notifications.sql`
- Create: `supabase/migrations/00009_audit_cms.sql`
- Create: `supabase/migrations/00010_triggers.sql`
- Create: `supabase/migrations/00011_rls.sql`
- Create: `supabase/migrations/00012_seed.sql`

**Interfaces:**
- Produces: Complete PostgreSQL schema with 28 tables, 21 triggers, RLS on every table, seed data with default school + admin user + system roles + modules + permissions

**Note:** Each migration file below contains the complete SQL. The engineer should run these against a Supabase project. Install the Supabase CLI (`npm install -D supabase`) and link to a project, or apply directly via the Supabase SQL Editor.

- [ ] **Step 1: Install Supabase CLI**

```bash
npm install -D supabase
npx supabase init
```

- [ ] **Step 2: Create schools migration**

Create `supabase/migrations/00001_schools.sql`:

```sql
-- Schools table
CREATE TABLE public.schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  short_name VARCHAR(100) NOT NULL,
  full_name VARCHAR(500) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  logo_url VARCHAR(500),
  description_tg TEXT,
  description_ru TEXT,
  address VARCHAR(500),
  phone VARCHAR(50),
  email VARCHAR(255),
  website VARCHAR(255),
  id_prefix VARCHAR(5) NOT NULL DEFAULT 'MT',
  id_sequence BIGINT NOT NULL DEFAULT 10000,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT schools_id_prefix_length CHECK (char_length(id_prefix) >= 1 AND char_length(id_prefix) <= 5),
  CONSTRAINT schools_id_sequence_positive CHECK (id_sequence >= 0)
);
```

- [ ] **Step 3: Create users migration**

Create `supabase/migrations/00002_users.sql`:

```sql
-- Users table (linked to auth.users)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  public_id VARCHAR(32) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  middle_name VARCHAR(100),
  avatar_url VARCHAR(500),
  phone VARCHAR(50),
  date_of_birth DATE,
  gender VARCHAR(10),
  is_active BOOLEAN NOT NULL DEFAULT true,
  deactivated_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT users_gender_check CHECK (gender IS NULL OR gender IN ('male', 'female'))
);

CREATE INDEX idx_users_school_id ON public.users(school_id);
CREATE INDEX idx_users_school_active ON public.users(school_id, is_active);

-- Function to generate public_id atomically
CREATE OR REPLACE FUNCTION public.generate_public_id()
RETURNS TRIGGER AS $$
DECLARE
  v_prefix VARCHAR(5);
  v_sequence BIGINT;
BEGIN
  UPDATE public.schools
  SET id_sequence = id_sequence + 1
  WHERE id = NEW.school_id
  RETURNING id_prefix, id_sequence INTO v_prefix, v_sequence;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'School not found: %', NEW.school_id;
  END IF;

  NEW.public_id := v_prefix || v_sequence::TEXT;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_generate_public_id
  BEFORE INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_public_id();
```

- [ ] **Step 4: Create RBAC migration**

Create `supabase/migrations/00003_rbac.sql`:

```sql
-- Roles
CREATE TABLE public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  slug VARCHAR(50) NOT NULL,
  name_tg VARCHAR(100) NOT NULL,
  name_ru VARCHAR(100),
  level INT NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT roles_level_range CHECK (level >= 1 AND level <= 100),
  CONSTRAINT roles_school_slug_unique UNIQUE (school_id, slug)
);

CREATE INDEX idx_roles_school ON public.roles(school_id);

-- Permissions (global catalog)
CREATE TABLE public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) UNIQUE NOT NULL,
  module VARCHAR(50) NOT NULL,
  action VARCHAR(20) NOT NULL,
  name_tg VARCHAR(200) NOT NULL,
  name_ru VARCHAR(200),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT permissions_action_check CHECK (action IN ('read', 'create', 'update', 'delete', 'manage'))
);

CREATE INDEX idx_permissions_module ON public.permissions(module);
CREATE INDEX idx_permissions_module_action ON public.permissions(module, action);

-- User-Role assignments
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,

  CONSTRAINT user_roles_unique UNIQUE (user_id, role_id, school_id)
);

CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_school_user ON public.user_roles(school_id, user_id);

-- Role-Permission assignments
CREATE TABLE public.role_permissions (
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,

  PRIMARY KEY (role_id, permission_id)
);
```

- [ ] **Step 5: Create school structure migration**

Create `supabase/migrations/00004_school_structure.sql`:

```sql
-- Academic years
CREATE TABLE public.academic_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  name VARCHAR(20) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT academic_years_school_name_unique UNIQUE (school_id, name),
  CONSTRAINT academic_years_dates_check CHECK (end_date > start_date)
);

CREATE UNIQUE INDEX idx_academic_years_one_current
  ON public.academic_years(school_id) WHERE is_current = true;

-- Classes
CREATE TABLE public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  name VARCHAR(20) NOT NULL,
  grade_level INT NOT NULL,
  homeroom_teacher_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT classes_school_year_name_unique UNIQUE (school_id, academic_year_id, name),
  CONSTRAINT classes_grade_level_check CHECK (grade_level >= 1 AND grade_level <= 11)
);

CREATE INDEX idx_classes_school_year ON public.classes(school_id, academic_year_id);
CREATE INDEX idx_classes_school_active ON public.classes(school_id, is_active);

-- Subjects
CREATE TABLE public.subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  name_tg VARCHAR(200) NOT NULL,
  name_ru VARCHAR(200),
  code VARCHAR(20),
  is_active BOOLEAN NOT NULL DEFAULT true,
  deactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_subjects_school_code
  ON public.subjects(school_id, code) WHERE code IS NOT NULL;
CREATE INDEX idx_subjects_school ON public.subjects(school_id);

-- Class-Student assignments
CREATE TABLE public.class_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT class_students_unique UNIQUE (class_id, student_id)
);

CREATE INDEX idx_class_students_school ON public.class_students(school_id);
CREATE INDEX idx_class_students_student ON public.class_students(student_id);

-- Teacher-Subject-Class assignments
CREATE TABLE public.teacher_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,

  CONSTRAINT teacher_subjects_unique UNIQUE (teacher_id, subject_id, class_id, academic_year_id)
);

CREATE INDEX idx_teacher_subjects_school ON public.teacher_subjects(school_id);
CREATE INDEX idx_teacher_subjects_teacher ON public.teacher_subjects(teacher_id);
```

- [ ] **Step 6: Create modules migration**

Create `supabase/migrations/00005_modules.sql`:

```sql
-- Module catalog (global)
CREATE TABLE public.modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(50) UNIQUE NOT NULL,
  name_tg VARCHAR(100) NOT NULL,
  name_ru VARCHAR(100),
  description_tg TEXT,
  description_ru TEXT,
  icon VARCHAR(50),
  route VARCHAR(100),
  is_system BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- School-specific module enablement
CREATE TABLE public.school_modules (
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  module_id UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  enabled_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,

  PRIMARY KEY (school_id, module_id)
);

-- Module visibility per role per school
CREATE TABLE public.module_role_access (
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  module_id UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  is_visible BOOLEAN NOT NULL DEFAULT true,

  PRIMARY KEY (school_id, module_id, role_id)
);
```

- [ ] **Step 7: Create messaging migration**

Create `supabase/migrations/00006_messaging.sql`:

```sql
-- Conversations
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  type VARCHAR(20) NOT NULL,
  name VARCHAR(200),
  avatar_url VARCHAR(500),
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT conversations_type_check CHECK (type IN ('direct', 'group', 'class_group', 'announcement'))
);

CREATE INDEX idx_conversations_school ON public.conversations(school_id);
CREATE INDEX idx_conversations_class ON public.conversations(class_id) WHERE class_id IS NOT NULL;

-- Conversation members
CREATE TABLE public.conversation_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  role VARCHAR(20) NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at TIMESTAMPTZ,
  is_muted BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT conv_members_unique UNIQUE (conversation_id, user_id),
  CONSTRAINT conv_members_role_check CHECK (role IN ('admin', 'member'))
);

CREATE INDEX idx_conv_members_user ON public.conversation_members(user_id);
CREATE INDEX idx_conv_members_school_user ON public.conversation_members(school_id, user_id);

-- Messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  content TEXT NOT NULL DEFAULT '',
  type VARCHAR(20) NOT NULL DEFAULT 'text',
  reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_edited BOOLEAN NOT NULL DEFAULT false,
  edited_at TIMESTAMPTZ,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT messages_type_check CHECK (type IN ('text', 'file', 'image', 'system', 'audio'))
);

CREATE INDEX idx_messages_conversation_created ON public.messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_school ON public.messages(school_id);
CREATE INDEX idx_messages_content_search ON public.messages USING gin(to_tsvector('simple', content));

-- Message attachments
CREATE TABLE public.message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  file_url VARCHAR(500) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT NOT NULL,
  file_type VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT msg_attachments_size_check CHECK (file_size > 0)
);

CREATE INDEX idx_msg_attachments_message ON public.message_attachments(message_id);
```

- [ ] **Step 8: Create library migration**

Create `supabase/migrations/00007_library.sql`:

```sql
-- Library categories
CREATE TABLE public.library_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  parent_id UUID REFERENCES public.library_categories(id) ON DELETE RESTRICT,
  name_tg VARCHAR(200) NOT NULL,
  name_ru VARCHAR(200),
  slug VARCHAR(100) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT lib_categories_school_slug_unique UNIQUE (school_id, slug),
  CONSTRAINT lib_categories_school_parent_name_unique UNIQUE (school_id, parent_id, name_tg)
);

CREATE INDEX idx_lib_categories_school ON public.library_categories(school_id);
CREATE INDEX idx_lib_categories_parent ON public.library_categories(parent_id) WHERE parent_id IS NOT NULL;

-- Library items
CREATE TABLE public.library_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  title VARCHAR(500) NOT NULL,
  author VARCHAR(300),
  description TEXT,
  cover_url VARCHAR(500),
  file_url VARCHAR(500) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT NOT NULL,
  file_type VARCHAR(20) NOT NULL,
  category_id UUID NOT NULL REFERENCES public.library_categories(id) ON DELETE RESTRICT,
  language VARCHAR(10) NOT NULL DEFAULT 'tg',
  publication_year INT,
  publisher VARCHAR(300),
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  grade_level INT,
  visibility VARCHAR(20) NOT NULL DEFAULT 'all',
  is_published BOOLEAN NOT NULL DEFAULT true,
  unpublished_at TIMESTAMPTZ,
  uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  metadata JSONB,
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(author, '') || ' ' || coalesce(description, ''))
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT lib_items_file_type_check CHECK (file_type IN ('pdf', 'epub', 'audio', 'image', 'document')),
  CONSTRAINT lib_items_file_size_check CHECK (file_size > 0),
  CONSTRAINT lib_items_grade_level_check CHECK (grade_level IS NULL OR (grade_level >= 1 AND grade_level <= 11)),
  CONSTRAINT lib_items_visibility_check CHECK (visibility IN ('all', 'teachers', 'admin', 'specific'))
);

CREATE INDEX idx_lib_items_school ON public.library_items(school_id);
CREATE INDEX idx_lib_items_school_category ON public.library_items(school_id, category_id);
CREATE INDEX idx_lib_items_school_subject ON public.library_items(school_id, subject_id) WHERE subject_id IS NOT NULL;
CREATE INDEX idx_lib_items_school_published ON public.library_items(school_id, is_published);
CREATE INDEX idx_lib_items_search ON public.library_items USING gin(search_vector);

-- Library item access rules (for visibility='specific')
CREATE TABLE public.library_item_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.library_items(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  role_id UUID REFERENCES public.roles(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,

  CONSTRAINT lib_item_access_has_target CHECK (role_id IS NOT NULL OR class_id IS NOT NULL),
  CONSTRAINT lib_item_access_unique UNIQUE (item_id, role_id, class_id)
);

-- Library favorites
CREATE TABLE public.library_favorites (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.library_items(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, item_id)
);

-- Library reading history
CREATE TABLE public.library_reading_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.library_items(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  last_page INT,
  last_position VARCHAR(100),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT lib_reading_history_unique UNIQUE (user_id, item_id),
  CONSTRAINT lib_reading_history_page_check CHECK (last_page IS NULL OR last_page >= 0)
);

CREATE INDEX idx_lib_history_user ON public.library_reading_history(user_id);
```

- [ ] **Step 9: Create notifications migration**

Create `supabase/migrations/00008_notifications.sql`:

```sql
-- Notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  type VARCHAR(30) NOT NULL,
  module VARCHAR(50) NOT NULL,
  title VARCHAR(300) NOT NULL,
  body TEXT,
  data JSONB,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT notifications_type_check CHECK (type IN (
    'message', 'grade', 'homework', 'schedule', 'attendance',
    'announcement', 'document', 'library', 'system'
  ))
);

CREATE INDEX idx_notifications_user_read ON public.notifications(user_id, is_read);
CREATE INDEX idx_notifications_school_user ON public.notifications(school_id, user_id);
CREATE INDEX idx_notifications_created ON public.notifications(school_id, created_at DESC);

-- Notification settings per school
CREATE TABLE public.notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  type VARCHAR(30) NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,

  CONSTRAINT notification_settings_school_type_unique UNIQUE (school_id, type),
  CONSTRAINT notification_settings_type_check CHECK (type IN (
    'message', 'grade', 'homework', 'schedule', 'attendance',
    'announcement', 'document', 'library', 'system'
  ))
);
```

- [ ] **Step 10: Create audit log and CMS migration**

Create `supabase/migrations/00009_audit_cms.sql`:

```sql
-- Audit logs (immutable)
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  user_id UUID,
  user_public_id VARCHAR(32),
  action VARCHAR(30) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT audit_logs_action_check CHECK (action IN (
    'create', 'update', 'delete', 'login', 'logout',
    'enable', 'disable', 'assign', 'revoke'
  ))
);

CREATE INDEX idx_audit_school_created ON public.audit_logs(school_id, created_at DESC);
CREATE INDEX idx_audit_school_user ON public.audit_logs(school_id, user_id);
CREATE INDEX idx_audit_entity ON public.audit_logs(entity_type, entity_id);

-- CMS Pages
CREATE TABLE public.pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  slug VARCHAR(100) NOT NULL,
  title_tg VARCHAR(300) NOT NULL,
  title_ru VARCHAR(300),
  is_published BOOLEAN NOT NULL DEFAULT false,
  unpublished_at TIMESTAMPTZ,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT pages_school_slug_unique UNIQUE (school_id, slug)
);

CREATE INDEX idx_pages_school_published ON public.pages(school_id, is_published);

-- CMS Content blocks
CREATE TABLE public.content_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  page_id UUID REFERENCES public.pages(id) ON DELETE CASCADE,
  section VARCHAR(50) NOT NULL,
  type VARCHAR(20) NOT NULL,
  title_tg TEXT,
  title_ru TEXT,
  body_tg TEXT,
  body_ru TEXT,
  image_url VARCHAR(500),
  link_url VARCHAR(500),
  is_visible BOOLEAN NOT NULL DEFAULT true,
  hidden_at TIMESTAMPTZ,
  sort_order INT NOT NULL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT content_blocks_type_check CHECK (type IN ('text', 'image', 'html', 'banner', 'gallery'))
);

CREATE INDEX idx_content_blocks_school_page ON public.content_blocks(school_id, page_id);
CREATE INDEX idx_content_blocks_section ON public.content_blocks(school_id, section);
```

- [ ] **Step 11: Create triggers migration**

Create `supabase/migrations/00010_triggers.sql`:

```sql
-- ============================================================
-- SYSTEM TRIGGERS
-- ============================================================

-- 1. update_updated_at — auto-set updated_at on UPDATE
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'updated_at'
    AND table_name != 'audit_logs'
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_update_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at()',
      t
    );
  END LOOP;
END;
$$;

-- 2. Soft delete timestamp management
CREATE OR REPLACE FUNCTION public.update_soft_delete_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  -- is_active → deactivated_at
  IF TG_TABLE_NAME IN ('schools', 'users', 'roles', 'classes', 'subjects', 'conversations') THEN
    IF OLD.is_active = true AND NEW.is_active = false THEN
      NEW.deactivated_at = now();
    ELSIF OLD.is_active = false AND NEW.is_active = true THEN
      NEW.deactivated_at = NULL;
    END IF;
  END IF;

  -- is_deleted → deleted_at (messages)
  IF TG_TABLE_NAME = 'messages' THEN
    IF OLD.is_deleted = false AND NEW.is_deleted = true THEN
      NEW.deleted_at = now();
    ELSIF OLD.is_deleted = true AND NEW.is_deleted = false THEN
      NEW.deleted_at = NULL;
    END IF;
  END IF;

  -- is_published → unpublished_at
  IF TG_TABLE_NAME IN ('library_items', 'pages') THEN
    IF OLD.is_published = true AND NEW.is_published = false THEN
      NEW.unpublished_at = now();
    ELSIF OLD.is_published = false AND NEW.is_published = true THEN
      NEW.unpublished_at = NULL;
    END IF;
  END IF;

  -- is_visible → hidden_at
  IF TG_TABLE_NAME = 'content_blocks' THEN
    IF OLD.is_visible = true AND NEW.is_visible = false THEN
      NEW.hidden_at = now();
    ELSIF OLD.is_visible = false AND NEW.is_visible = true THEN
      NEW.hidden_at = NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply soft delete triggers
CREATE TRIGGER trg_soft_delete_schools BEFORE UPDATE ON public.schools FOR EACH ROW EXECUTE FUNCTION public.update_soft_delete_timestamp();
CREATE TRIGGER trg_soft_delete_users BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_soft_delete_timestamp();
CREATE TRIGGER trg_soft_delete_roles BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.update_soft_delete_timestamp();
CREATE TRIGGER trg_soft_delete_classes BEFORE UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION public.update_soft_delete_timestamp();
CREATE TRIGGER trg_soft_delete_subjects BEFORE UPDATE ON public.subjects FOR EACH ROW EXECUTE FUNCTION public.update_soft_delete_timestamp();
CREATE TRIGGER trg_soft_delete_conversations BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_soft_delete_timestamp();
CREATE TRIGGER trg_soft_delete_messages BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.update_soft_delete_timestamp();
CREATE TRIGGER trg_soft_delete_library_items BEFORE UPDATE ON public.library_items FOR EACH ROW EXECUTE FUNCTION public.update_soft_delete_timestamp();
CREATE TRIGGER trg_soft_delete_pages BEFORE UPDATE ON public.pages FOR EACH ROW EXECUTE FUNCTION public.update_soft_delete_timestamp();
CREATE TRIGGER trg_soft_delete_content_blocks BEFORE UPDATE ON public.content_blocks FOR EACH ROW EXECUTE FUNCTION public.update_soft_delete_timestamp();

-- 3. Prevent audit log modification
CREATE OR REPLACE FUNCTION public.prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_audit_modification
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_modification();

-- 4. Prevent system role deletion
CREATE OR REPLACE FUNCTION public.prevent_system_role_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_system = true THEN
    RAISE EXCEPTION 'System roles cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_system_role_delete
  BEFORE DELETE ON public.roles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_system_role_delete();

-- 5. Prevent school deletion
CREATE OR REPLACE FUNCTION public.prevent_school_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Schools cannot be physically deleted. Use soft delete (is_active = false) instead.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_school_delete
  BEFORE DELETE ON public.schools
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_school_delete();

-- ============================================================
-- CROSS-SCHOOL VALIDATION TRIGGERS
-- ============================================================

-- Helper: get user's school_id
CREATE OR REPLACE FUNCTION public.get_user_school_id(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
  v_school_id UUID;
BEGIN
  SELECT school_id INTO v_school_id FROM public.users WHERE id = p_user_id;
  RETURN v_school_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper: check if user has role in school
CREATE OR REPLACE FUNCTION public.user_has_role_in_school(p_user_id UUID, p_school_id UUID, p_role_slugs TEXT[])
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id
    AND ur.school_id = p_school_id
    AND r.slug = ANY(p_role_slugs)
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- 7. validate_user_role_school_match
CREATE OR REPLACE FUNCTION public.validate_user_role_school_match()
RETURNS TRIGGER AS $$
DECLARE
  v_user_school UUID;
  v_role_school UUID;
BEGIN
  SELECT school_id INTO v_user_school FROM public.users WHERE id = NEW.user_id;
  SELECT school_id INTO v_role_school FROM public.roles WHERE id = NEW.role_id;

  IF v_user_school IS DISTINCT FROM NEW.school_id OR v_role_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation: user, role, and user_role must belong to the same school';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_user_role_school
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.validate_user_role_school_match();

-- 8. validate_class_student_school (+ student role check)
CREATE OR REPLACE FUNCTION public.validate_class_student_school()
RETURNS TRIGGER AS $$
DECLARE
  v_class_school UUID;
  v_user_school UUID;
BEGIN
  SELECT school_id INTO v_class_school FROM public.classes WHERE id = NEW.class_id;
  SELECT school_id INTO v_user_school FROM public.users WHERE id = NEW.student_id;

  IF v_class_school IS DISTINCT FROM NEW.school_id OR v_user_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation in class_students';
  END IF;

  IF NOT public.user_has_role_in_school(NEW.student_id, NEW.school_id, ARRAY['student']) THEN
    RAISE EXCEPTION 'User must have student role to be enrolled in a class';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_class_student_school
  BEFORE INSERT OR UPDATE ON public.class_students
  FOR EACH ROW EXECUTE FUNCTION public.validate_class_student_school();

-- 9. validate_teacher_subject_school (+ teacher role check)
CREATE OR REPLACE FUNCTION public.validate_teacher_subject_school()
RETURNS TRIGGER AS $$
DECLARE
  v_teacher_school UUID;
  v_subject_school UUID;
  v_class_school UUID;
  v_year_school UUID;
BEGIN
  SELECT school_id INTO v_teacher_school FROM public.users WHERE id = NEW.teacher_id;
  SELECT school_id INTO v_subject_school FROM public.subjects WHERE id = NEW.subject_id;
  SELECT school_id INTO v_class_school FROM public.classes WHERE id = NEW.class_id;
  SELECT school_id INTO v_year_school FROM public.academic_years WHERE id = NEW.academic_year_id;

  IF v_teacher_school IS DISTINCT FROM NEW.school_id
    OR v_subject_school IS DISTINCT FROM NEW.school_id
    OR v_class_school IS DISTINCT FROM NEW.school_id
    OR v_year_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation in teacher_subjects';
  END IF;

  IF NOT public.user_has_role_in_school(NEW.teacher_id, NEW.school_id, ARRAY['teacher', 'vice_principal', 'director']) THEN
    RAISE EXCEPTION 'User must have a teaching role (teacher, vice_principal, or director) to be assigned to teacher_subjects';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_teacher_subject_school
  BEFORE INSERT OR UPDATE ON public.teacher_subjects
  FOR EACH ROW EXECUTE FUNCTION public.validate_teacher_subject_school();

-- 10. validate_class_school
CREATE OR REPLACE FUNCTION public.validate_class_school()
RETURNS TRIGGER AS $$
DECLARE
  v_year_school UUID;
  v_teacher_school UUID;
BEGIN
  SELECT school_id INTO v_year_school FROM public.academic_years WHERE id = NEW.academic_year_id;
  IF v_year_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation: academic_year must belong to same school as class';
  END IF;

  IF NEW.homeroom_teacher_id IS NOT NULL THEN
    SELECT school_id INTO v_teacher_school FROM public.users WHERE id = NEW.homeroom_teacher_id;
    IF v_teacher_school IS DISTINCT FROM NEW.school_id THEN
      RAISE EXCEPTION 'Cross-school violation: homeroom teacher must belong to same school';
    END IF;
    IF NOT public.user_has_role_in_school(NEW.homeroom_teacher_id, NEW.school_id, ARRAY['teacher', 'vice_principal', 'director']) THEN
      RAISE EXCEPTION 'Homeroom teacher must have a teaching role';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_class_school
  BEFORE INSERT OR UPDATE ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.validate_class_school();

-- 11-13. Conversation/member/message school validation
CREATE OR REPLACE FUNCTION public.validate_conversation_school()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.class_id IS NOT NULL THEN
    IF (SELECT school_id FROM public.classes WHERE id = NEW.class_id) IS DISTINCT FROM NEW.school_id THEN
      RAISE EXCEPTION 'Cross-school violation: conversation class must belong to same school';
    END IF;
  END IF;
  IF NEW.created_by IS NOT NULL THEN
    IF public.get_user_school_id(NEW.created_by) IS DISTINCT FROM NEW.school_id THEN
      RAISE EXCEPTION 'Cross-school violation: conversation creator must belong to same school';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_conversation_school
  BEFORE INSERT OR UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.validate_conversation_school();

CREATE OR REPLACE FUNCTION public.validate_conv_member_school()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT school_id FROM public.conversations WHERE id = NEW.conversation_id) IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation in conversation_members';
  END IF;
  IF public.get_user_school_id(NEW.user_id) IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation in conversation_members (user)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_conv_member_school
  BEFORE INSERT OR UPDATE ON public.conversation_members
  FOR EACH ROW EXECUTE FUNCTION public.validate_conv_member_school();

CREATE OR REPLACE FUNCTION public.validate_message_school()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT school_id FROM public.conversations WHERE id = NEW.conversation_id) IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation in messages';
  END IF;
  IF NEW.sender_id IS NOT NULL AND public.get_user_school_id(NEW.sender_id) IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation in messages (sender)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_message_school
  BEFORE INSERT OR UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.validate_message_school();

-- 14. validate_library_item_school
CREATE OR REPLACE FUNCTION public.validate_library_item_school()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT school_id FROM public.library_categories WHERE id = NEW.category_id) IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation: library category must belong to same school';
  END IF;
  IF NEW.subject_id IS NOT NULL THEN
    IF (SELECT school_id FROM public.subjects WHERE id = NEW.subject_id) IS DISTINCT FROM NEW.school_id THEN
      RAISE EXCEPTION 'Cross-school violation: subject must belong to same school';
    END IF;
  END IF;
  IF NEW.uploaded_by IS NOT NULL THEN
    IF public.get_user_school_id(NEW.uploaded_by) IS DISTINCT FROM NEW.school_id THEN
      RAISE EXCEPTION 'Cross-school violation: uploader must belong to same school';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_library_item_school
  BEFORE INSERT OR UPDATE ON public.library_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_library_item_school();

-- 15. validate_library_access_school
CREATE OR REPLACE FUNCTION public.validate_library_access_school()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT school_id FROM public.library_items WHERE id = NEW.item_id) IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation in library_item_access (item)';
  END IF;
  IF NEW.role_id IS NOT NULL THEN
    IF (SELECT school_id FROM public.roles WHERE id = NEW.role_id) IS DISTINCT FROM NEW.school_id THEN
      RAISE EXCEPTION 'Cross-school violation in library_item_access (role)';
    END IF;
  END IF;
  IF NEW.class_id IS NOT NULL THEN
    IF (SELECT school_id FROM public.classes WHERE id = NEW.class_id) IS DISTINCT FROM NEW.school_id THEN
      RAISE EXCEPTION 'Cross-school violation in library_item_access (class)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_library_access_school
  BEFORE INSERT OR UPDATE ON public.library_item_access
  FOR EACH ROW EXECUTE FUNCTION public.validate_library_access_school();

-- 16. validate_library_favorites_school
CREATE OR REPLACE FUNCTION public.validate_library_favorites_school()
RETURNS TRIGGER AS $$
BEGIN
  IF public.get_user_school_id(NEW.user_id) IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation in library_favorites (user)';
  END IF;
  IF (SELECT school_id FROM public.library_items WHERE id = NEW.item_id) IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation in library_favorites (item)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_library_favorites_school
  BEFORE INSERT OR UPDATE ON public.library_favorites
  FOR EACH ROW EXECUTE FUNCTION public.validate_library_favorites_school();

-- 17. validate_reading_history_school
CREATE OR REPLACE FUNCTION public.validate_reading_history_school()
RETURNS TRIGGER AS $$
BEGIN
  IF public.get_user_school_id(NEW.user_id) IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation in library_reading_history (user)';
  END IF;
  IF (SELECT school_id FROM public.library_items WHERE id = NEW.item_id) IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation in library_reading_history (item)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_reading_history_school
  BEFORE INSERT OR UPDATE ON public.library_reading_history
  FOR EACH ROW EXECUTE FUNCTION public.validate_reading_history_school();

-- 18. validate_module_role_access_school
CREATE OR REPLACE FUNCTION public.validate_module_role_access_school()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT school_id FROM public.roles WHERE id = NEW.role_id) IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation in module_role_access';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_module_role_access_school
  BEFORE INSERT OR UPDATE ON public.module_role_access
  FOR EACH ROW EXECUTE FUNCTION public.validate_module_role_access_school();

-- 19. validate_notification_school
CREATE OR REPLACE FUNCTION public.validate_notification_school()
RETURNS TRIGGER AS $$
BEGIN
  IF public.get_user_school_id(NEW.user_id) IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Cross-school violation in notifications';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_notification_school
  BEFORE INSERT OR UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.validate_notification_school();

-- 20. validate_school_module_school
CREATE OR REPLACE FUNCTION public.validate_school_module_school()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.updated_by IS NOT NULL THEN
    IF public.get_user_school_id(NEW.updated_by) IS DISTINCT FROM NEW.school_id THEN
      RAISE EXCEPTION 'Cross-school violation in school_modules';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_school_module_school
  BEFORE INSERT OR UPDATE ON public.school_modules
  FOR EACH ROW EXECUTE FUNCTION public.validate_school_module_school();

-- 21. validate_library_category_parent
CREATE OR REPLACE FUNCTION public.validate_library_category_parent()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF (SELECT school_id FROM public.library_categories WHERE id = NEW.parent_id) IS DISTINCT FROM NEW.school_id THEN
      RAISE EXCEPTION 'Cross-school violation: parent category must belong to same school';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_library_category_parent
  BEFORE INSERT OR UPDATE ON public.library_categories
  FOR EACH ROW EXECUTE FUNCTION public.validate_library_category_parent();
```

- [ ] **Step 12: Create RLS migration**

Create `supabase/migrations/00011_rls.sql`:

```sql
-- Enable RLS on all tables
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.module_role_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_item_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_reading_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_blocks ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's school_id
CREATE OR REPLACE FUNCTION public.current_user_school_id()
RETURNS UUID AS $$
  SELECT school_id FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: check if current user has a specific permission
CREATE OR REPLACE FUNCTION public.current_user_has_permission(p_permission_slug TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = auth.uid()
    AND p.slug = p_permission_slug
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: check if current user has admin role
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
    AND r.slug = 'admin'
    AND r.school_id = public.current_user_school_id()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- SCHOOLS
-- ============================================================
CREATE POLICY schools_select ON public.schools FOR SELECT TO authenticated
  USING (id = public.current_user_school_id() AND is_active = true);

CREATE POLICY schools_select_admin ON public.schools FOR SELECT TO authenticated
  USING (id = public.current_user_school_id() AND public.current_user_is_admin());

CREATE POLICY schools_update_admin ON public.schools FOR UPDATE TO authenticated
  USING (id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (id = public.current_user_school_id() AND public.current_user_is_admin());

-- ============================================================
-- USERS
-- ============================================================
CREATE POLICY users_select ON public.users FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND is_active = true);

CREATE POLICY users_select_admin ON public.users FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin());

CREATE POLICY users_insert_admin ON public.users FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_user_school_id() AND public.current_user_is_admin());

CREATE POLICY users_update_self ON public.users FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND school_id = public.current_user_school_id());

CREATE POLICY users_update_admin ON public.users FOR UPDATE TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (school_id = public.current_user_school_id() AND public.current_user_is_admin());

-- ============================================================
-- ROLES
-- ============================================================
CREATE POLICY roles_select ON public.roles FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id());

CREATE POLICY roles_insert_admin ON public.roles FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_user_school_id() AND public.current_user_is_admin());

CREATE POLICY roles_update_admin ON public.roles FOR UPDATE TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (school_id = public.current_user_school_id());

-- ============================================================
-- PERMISSIONS (global, read-only for users)
-- ============================================================
CREATE POLICY permissions_select ON public.permissions FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- USER_ROLES
-- ============================================================
CREATE POLICY user_roles_select_own ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY user_roles_select_admin ON public.user_roles FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin());

CREATE POLICY user_roles_insert_admin ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_user_school_id() AND public.current_user_is_admin());

CREATE POLICY user_roles_update_admin ON public.user_roles FOR UPDATE TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin());

CREATE POLICY user_roles_delete_admin ON public.user_roles FOR DELETE TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin());

-- ============================================================
-- ROLE_PERMISSIONS
-- ============================================================
CREATE POLICY role_permissions_select ON public.role_permissions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.roles r WHERE r.id = role_id AND r.school_id = public.current_user_school_id()
  ));

CREATE POLICY role_permissions_insert_admin ON public.role_permissions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.roles r WHERE r.id = role_id AND r.school_id = public.current_user_school_id()
  ) AND public.current_user_is_admin());

CREATE POLICY role_permissions_delete_admin ON public.role_permissions FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.roles r WHERE r.id = role_id AND r.school_id = public.current_user_school_id()
  ) AND public.current_user_is_admin());

-- ============================================================
-- MODULES (global, read-only)
-- ============================================================
CREATE POLICY modules_select ON public.modules FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- SCHOOL_MODULES
-- ============================================================
CREATE POLICY school_modules_select ON public.school_modules FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id());

CREATE POLICY school_modules_update_admin ON public.school_modules FOR UPDATE TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (school_id = public.current_user_school_id());

CREATE POLICY school_modules_insert_admin ON public.school_modules FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_user_school_id() AND public.current_user_is_admin());

-- ============================================================
-- MODULE_ROLE_ACCESS
-- ============================================================
CREATE POLICY module_role_access_select ON public.module_role_access FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id());

CREATE POLICY module_role_access_manage_admin ON public.module_role_access FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (school_id = public.current_user_school_id() AND public.current_user_is_admin());

-- ============================================================
-- ACADEMIC_YEARS
-- ============================================================
CREATE POLICY academic_years_select ON public.academic_years FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id());

CREATE POLICY academic_years_manage_admin ON public.academic_years FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (school_id = public.current_user_school_id() AND public.current_user_is_admin());

-- ============================================================
-- CLASSES
-- ============================================================
CREATE POLICY classes_select ON public.classes FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND is_active = true);

CREATE POLICY classes_select_admin ON public.classes FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin());

CREATE POLICY classes_manage_admin ON public.classes FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (school_id = public.current_user_school_id() AND public.current_user_is_admin());

-- ============================================================
-- SUBJECTS
-- ============================================================
CREATE POLICY subjects_select ON public.subjects FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND is_active = true);

CREATE POLICY subjects_select_admin ON public.subjects FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin());

CREATE POLICY subjects_manage_admin ON public.subjects FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (school_id = public.current_user_school_id() AND public.current_user_is_admin());

-- ============================================================
-- CLASS_STUDENTS
-- ============================================================
CREATE POLICY class_students_select ON public.class_students FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id());

CREATE POLICY class_students_manage ON public.class_students FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id() AND (
    public.current_user_is_admin() OR public.current_user_has_permission('classes.manage')
  ))
  WITH CHECK (school_id = public.current_user_school_id());

-- ============================================================
-- TEACHER_SUBJECTS
-- ============================================================
CREATE POLICY teacher_subjects_select ON public.teacher_subjects FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id());

CREATE POLICY teacher_subjects_manage ON public.teacher_subjects FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id() AND (
    public.current_user_is_admin() OR public.current_user_has_permission('classes.manage')
  ))
  WITH CHECK (school_id = public.current_user_school_id());

-- ============================================================
-- CONVERSATIONS
-- ============================================================
CREATE POLICY conversations_select ON public.conversations FOR SELECT TO authenticated
  USING (
    is_active = true AND
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY conversations_insert ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_user_school_id());

CREATE POLICY conversations_update ON public.conversations FOR UPDATE TO authenticated
  USING (
    school_id = public.current_user_school_id() AND
    (created_by = auth.uid() OR public.current_user_is_admin())
  );

-- ============================================================
-- CONVERSATION_MEMBERS
-- ============================================================
CREATE POLICY conv_members_select ON public.conversation_members FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.conversation_members cm2
      WHERE cm2.conversation_id = conversation_id AND cm2.user_id = auth.uid()
    )
  ));

CREATE POLICY conv_members_insert ON public.conversation_members FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_user_school_id());

CREATE POLICY conv_members_update_own ON public.conversation_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- MESSAGES
-- ============================================================
CREATE POLICY messages_select ON public.messages FOR SELECT TO authenticated
  USING (
    is_deleted = false AND
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversation_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY messages_insert ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.current_user_school_id() AND
    sender_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversation_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY messages_update_own ON public.messages FOR UPDATE TO authenticated
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

-- ============================================================
-- MESSAGE_ATTACHMENTS
-- ============================================================
CREATE POLICY msg_attachments_select ON public.message_attachments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
    WHERE m.id = message_id AND cm.user_id = auth.uid() AND m.is_deleted = false
  ));

CREATE POLICY msg_attachments_insert ON public.message_attachments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_id AND m.sender_id = auth.uid()
  ));

-- ============================================================
-- LIBRARY_CATEGORIES
-- ============================================================
CREATE POLICY lib_categories_select ON public.library_categories FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND is_active = true);

CREATE POLICY lib_categories_manage_admin ON public.library_categories FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (school_id = public.current_user_school_id());

-- ============================================================
-- LIBRARY_ITEMS
-- ============================================================
CREATE POLICY lib_items_select ON public.library_items FOR SELECT TO authenticated
  USING (
    school_id = public.current_user_school_id() AND
    is_published = true AND
    (
      visibility = 'all'
      OR (visibility = 'teachers' AND EXISTS (
        SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = auth.uid() AND r.level <= 4
      ))
      OR (visibility = 'admin' AND EXISTS (
        SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = auth.uid() AND r.level <= 3
      ))
      OR (visibility = 'specific' AND (
        EXISTS (
          SELECT 1 FROM public.library_item_access lia
          JOIN public.user_roles ur ON ur.role_id = lia.role_id
          WHERE lia.item_id = id AND ur.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.library_item_access lia
          JOIN public.class_students cs ON cs.class_id = lia.class_id
          WHERE lia.item_id = id AND cs.student_id = auth.uid()
        )
      ))
      OR public.current_user_is_admin()
    )
  );

CREATE POLICY lib_items_select_admin ON public.library_items FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin());

CREATE POLICY lib_items_manage ON public.library_items FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_has_permission('library.manage'))
  WITH CHECK (school_id = public.current_user_school_id());

-- ============================================================
-- LIBRARY_ITEM_ACCESS
-- ============================================================
CREATE POLICY lib_item_access_select ON public.library_item_access FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id());

CREATE POLICY lib_item_access_manage ON public.library_item_access FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_has_permission('library.manage'))
  WITH CHECK (school_id = public.current_user_school_id());

-- ============================================================
-- LIBRARY_FAVORITES
-- ============================================================
CREATE POLICY lib_favorites_select ON public.library_favorites FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY lib_favorites_insert ON public.library_favorites FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND school_id = public.current_user_school_id());

CREATE POLICY lib_favorites_delete ON public.library_favorites FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- LIBRARY_READING_HISTORY
-- ============================================================
CREATE POLICY lib_history_select ON public.library_reading_history FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY lib_history_upsert ON public.library_reading_history FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND school_id = public.current_user_school_id());

CREATE POLICY lib_history_update ON public.library_reading_history FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY notifications_delete_own_read ON public.notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND is_read = true);

-- ============================================================
-- NOTIFICATION_SETTINGS
-- ============================================================
CREATE POLICY notif_settings_select ON public.notification_settings FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id());

CREATE POLICY notif_settings_manage ON public.notification_settings FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_has_permission('notifications.manage'))
  WITH CHECK (school_id = public.current_user_school_id());

-- ============================================================
-- AUDIT_LOGS
-- ============================================================
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_has_permission('audit_logs.read'));

-- INSERT only via service_role (no RLS policy for authenticated insert)

-- ============================================================
-- PAGES
-- ============================================================
CREATE POLICY pages_select_published ON public.pages FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND is_published = true);

CREATE POLICY pages_select_admin ON public.pages FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin());

CREATE POLICY pages_manage_admin ON public.pages FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (school_id = public.current_user_school_id());

-- ============================================================
-- CONTENT_BLOCKS
-- ============================================================
CREATE POLICY content_blocks_select_visible ON public.content_blocks FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND is_visible = true);

CREATE POLICY content_blocks_select_admin ON public.content_blocks FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin());

CREATE POLICY content_blocks_manage_admin ON public.content_blocks FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (school_id = public.current_user_school_id());
```

- [ ] **Step 13: Create seed data**

Create `supabase/migrations/00012_seed.sql`:

```sql
-- ============================================================
-- SEED DATA
-- ============================================================

-- 1. Default school
INSERT INTO public.schools (id, short_name, full_name, slug, id_prefix, id_sequence)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'МТМУ №7',
  'Мактаби Таълимии Миёнаи Умумии №7 ба номи Мирзие Ҳабибов',
  'mtmu-7',
  'MT',
  10000
);

-- 2. System roles
INSERT INTO public.roles (id, school_id, slug, name_tg, name_ru, level, is_system) VALUES
  ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-000000000001', 'admin', 'Администратор', 'Администратор', 1, true),
  ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-000000000001', 'director', 'Директор', 'Директор', 2, true),
  ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-000000000001', 'vice_principal', 'Завуч', 'Завуч', 3, true),
  ('00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0000-000000000001', 'teacher', 'Муаллим', 'Учитель', 4, true),
  ('00000000-0000-0000-0001-000000000005', '00000000-0000-0000-0000-000000000001', 'student', 'Хонанда', 'Ученик', 5, true);

-- 3. Modules
INSERT INTO public.modules (id, slug, name_tg, name_ru, icon, route, is_system, sort_order) VALUES
  ('00000000-0000-0000-0002-000000000001', 'dashboard', 'Панели асосӣ', 'Главная', 'LayoutDashboard', '/dashboard', true, 1),
  ('00000000-0000-0000-0002-000000000002', 'messages', 'Паёмҳо', 'Сообщения', 'MessageSquare', '/messages', false, 2),
  ('00000000-0000-0000-0002-000000000003', 'library', 'Китобхона', 'Библиотека', 'BookOpen', '/library', false, 3),
  ('00000000-0000-0000-0002-000000000004', 'grades', 'Баҳоҳо', 'Оценки', 'GraduationCap', '/grades', false, 4),
  ('00000000-0000-0000-0002-000000000005', 'attendance', 'Ҳозирӣ', 'Посещаемость', 'ClipboardCheck', '/attendance', false, 5),
  ('00000000-0000-0000-0002-000000000006', 'homework', 'Вазифаи хонагӣ', 'Домашнее задание', 'FileText', '/homework', false, 6),
  ('00000000-0000-0000-0002-000000000007', 'schedule', 'Ҷадвал', 'Расписание', 'Calendar', '/schedule', false, 7),
  ('00000000-0000-0000-0002-000000000008', 'documents', 'Ҳуҷҷатҳо', 'Документы', 'FolderOpen', '/documents', false, 8),
  ('00000000-0000-0000-0002-000000000009', 'events', 'Чорабиниҳо', 'Мероприятия', 'PartyPopper', '/events', false, 9),
  ('00000000-0000-0000-0002-000000000010', 'announcements', 'Эълонҳо', 'Объявления', 'Megaphone', '/announcements', false, 10),
  ('00000000-0000-0000-0002-000000000011', 'reports', 'Ҳисоботҳо', 'Отчёты', 'BarChart3', '/reports', false, 11),
  ('00000000-0000-0000-0002-000000000012', 'analytics', 'Таҳлил', 'Аналитика', 'TrendingUp', '/analytics', false, 12);

-- 4. Enable all modules for default school
INSERT INTO public.school_modules (school_id, module_id, is_enabled, enabled_at)
SELECT '00000000-0000-0000-0000-000000000001', id, true, now()
FROM public.modules;

-- 5. Module role access — all modules visible to all roles by default
INSERT INTO public.module_role_access (school_id, module_id, role_id, is_visible)
SELECT '00000000-0000-0000-0000-000000000001', m.id, r.id, true
FROM public.modules m
CROSS JOIN public.roles r
WHERE r.school_id = '00000000-0000-0000-0000-000000000001';

-- 6. Permissions
INSERT INTO public.permissions (slug, module, action, name_tg, name_ru) VALUES
  -- Users
  ('users.read', 'users', 'read', 'Хондани корбарон', 'Просмотр пользователей'),
  ('users.create', 'users', 'create', 'Эҷоди корбар', 'Создание пользователя'),
  ('users.update', 'users', 'update', 'Таҳрири корбар', 'Редактирование пользователя'),
  ('users.delete', 'users', 'delete', 'Нест кардани корбар', 'Удаление пользователя'),
  ('users.manage', 'users', 'manage', 'Идоракунии корбарон', 'Управление пользователями'),
  -- Roles
  ('roles.read', 'roles', 'read', 'Хондани нақшҳо', 'Просмотр ролей'),
  ('roles.manage', 'roles', 'manage', 'Идоракунии нақшҳо', 'Управление ролями'),
  -- Classes
  ('classes.read', 'classes', 'read', 'Хондани синфҳо', 'Просмотр классов'),
  ('classes.manage', 'classes', 'manage', 'Идоракунии синфҳо', 'Управление классами'),
  -- Subjects
  ('subjects.read', 'subjects', 'read', 'Хондани фанҳо', 'Просмотр предметов'),
  ('subjects.manage', 'subjects', 'manage', 'Идоракунии фанҳо', 'Управление предметами'),
  -- Library
  ('library.read', 'library', 'read', 'Хондани китобхона', 'Просмотр библиотеки'),
  ('library.create', 'library', 'create', 'Илова кардани китоб', 'Добавление книги'),
  ('library.update', 'library', 'update', 'Таҳрири китоб', 'Редактирование книги'),
  ('library.delete', 'library', 'delete', 'Нест кардани китоб', 'Удаление книги'),
  ('library.manage', 'library', 'manage', 'Идоракунии китобхона', 'Управление библиотекой'),
  -- Messages
  ('messages.read', 'messages', 'read', 'Хондани паёмҳо', 'Просмотр сообщений'),
  ('messages.create', 'messages', 'create', 'Фиристодани паём', 'Отправка сообщения'),
  ('messages.manage', 'messages', 'manage', 'Идоракунии паёмҳо', 'Управление сообщениями'),
  -- Grades
  ('grades.read', 'grades', 'read', 'Хондани баҳоҳо', 'Просмотр оценок'),
  ('grades.create', 'grades', 'create', 'Гузоштани баҳо', 'Выставление оценки'),
  ('grades.manage', 'grades', 'manage', 'Идоракунии баҳоҳо', 'Управление оценками'),
  -- Attendance
  ('attendance.read', 'attendance', 'read', 'Хондани ҳозирӣ', 'Просмотр посещаемости'),
  ('attendance.create', 'attendance', 'create', 'Қайди ҳозирӣ', 'Отметка посещаемости'),
  ('attendance.manage', 'attendance', 'manage', 'Идоракунии ҳозирӣ', 'Управление посещаемостью'),
  -- Homework
  ('homework.read', 'homework', 'read', 'Хондани вазифа', 'Просмотр заданий'),
  ('homework.create', 'homework', 'create', 'Эҷоди вазифа', 'Создание задания'),
  ('homework.manage', 'homework', 'manage', 'Идоракунии вазифа', 'Управление заданиями'),
  -- Schedule
  ('schedule.read', 'schedule', 'read', 'Хондани ҷадвал', 'Просмотр расписания'),
  ('schedule.manage', 'schedule', 'manage', 'Идоракунии ҷадвал', 'Управление расписанием'),
  -- Documents
  ('documents.read', 'documents', 'read', 'Хондани ҳуҷҷатҳо', 'Просмотр документов'),
  ('documents.manage', 'documents', 'manage', 'Идоракунии ҳуҷҷатҳо', 'Управление документами'),
  -- Notifications
  ('notifications.manage', 'notifications', 'manage', 'Идоракунии огоҳиномаҳо', 'Управление уведомлениями'),
  -- Content
  ('content.read', 'content', 'read', 'Хондани мундариҷа', 'Просмотр контента'),
  ('content.manage', 'content', 'manage', 'Идоракунии мундариҷа', 'Управление контентом'),
  -- Audit
  ('audit_logs.read', 'audit_logs', 'read', 'Хондани журнал', 'Просмотр журнала'),
  ('audit_logs.export', 'audit_logs', 'manage', 'Содироти журнал', 'Экспорт журнала'),
  -- School settings
  ('school.manage', 'school', 'manage', 'Идоракунии мактаб', 'Управление школой'),
  -- Modules management
  ('modules.manage', 'modules', 'manage', 'Идоракунии бахшҳо', 'Управление модулями');

-- 7. Assign all permissions to admin role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0001-000000000001', id
FROM public.permissions;

-- 8. Assign read permissions to director
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0001-000000000002', id
FROM public.permissions
WHERE action IN ('read', 'manage') AND module NOT IN ('audit_logs');

-- 9. Assign relevant permissions to vice_principal
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0001-000000000003', id
FROM public.permissions
WHERE (action = 'read')
   OR (module IN ('classes', 'subjects', 'attendance', 'grades', 'homework', 'schedule') AND action IN ('create', 'update', 'manage'));

-- 10. Assign relevant permissions to teacher
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0001-000000000004', id
FROM public.permissions
WHERE (module IN ('grades', 'attendance', 'homework') AND action IN ('read', 'create'))
   OR (module IN ('messages', 'library', 'schedule', 'documents') AND action = 'read')
   OR slug = 'messages.create';

-- 11. Assign read-only permissions to student
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0001-000000000005', id
FROM public.permissions
WHERE module IN ('grades', 'attendance', 'homework', 'schedule', 'library', 'messages', 'documents') AND action = 'read'
   OR slug = 'messages.create';

-- 12. Notification settings
INSERT INTO public.notification_settings (school_id, type, is_enabled)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'message', true),
  ('00000000-0000-0000-0000-000000000001', 'grade', true),
  ('00000000-0000-0000-0000-000000000001', 'homework', true),
  ('00000000-0000-0000-0000-000000000001', 'schedule', true),
  ('00000000-0000-0000-0000-000000000001', 'attendance', true),
  ('00000000-0000-0000-0000-000000000001', 'announcement', true),
  ('00000000-0000-0000-0000-000000000001', 'document', true),
  ('00000000-0000-0000-0000-000000000001', 'library', true),
  ('00000000-0000-0000-0000-000000000001', 'system', true);

-- 13. Default academic year
INSERT INTO public.academic_years (id, school_id, name, start_date, end_date, is_current)
VALUES (
  '00000000-0000-0000-0003-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '2025-2026',
  '2025-09-01',
  '2026-06-30',
  true
);
```

- [ ] **Step 14: Commit all migrations**

```bash
git add supabase/
git commit -m "feat: add complete database schema with 28 tables, 21 triggers, RLS, and seed data"
```

---

### Task 6: Auth Helpers and Permission Utilities

**Files:**
- Create: `src/lib/auth/get-user.ts`
- Create: `src/lib/auth/get-user-with-role.ts`
- Create: `src/lib/permissions/check.ts`
- Create: `src/lib/modules/check.ts`
- Create: `src/types/auth.ts`

**Interfaces:**
- Consumes: `createServerClient()` from Task 3
- Produces: `getUser()`, `getUserWithRole()`, `hasPermission()`, `canPerformAction()`, `isModuleAccessible()`

- [ ] **Step 1: Create auth types**

Create `src/types/auth.ts`:

```typescript
export interface UserProfile {
  id: string;
  schoolId: string;
  publicId: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  avatarUrl: string | null;
  phone: string | null;
  isActive: boolean;
}

export interface UserRole {
  id: string;
  slug: string;
  nameTg: string;
  nameRu: string | null;
  level: number;
  isSystem: boolean;
}

export interface UserWithRole extends UserProfile {
  roles: UserRole[];
}

export interface Permission {
  id: string;
  slug: string;
  module: string;
  action: string;
  nameTg: string;
  nameRu: string | null;
}
```

- [ ] **Step 2: Create getUser helper**

Create `src/lib/auth/get-user.ts`:

```typescript
import { createServerClient } from "@/lib/supabase/server";
import type { UserProfile } from "@/types/auth";

export async function getUser(): Promise<UserProfile | null> {
  const supabase = await createServerClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  if (!authUser) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .single();

  if (!profile) return null;

  return {
    id: profile.id,
    schoolId: profile.school_id,
    publicId: profile.public_id,
    email: profile.email,
    firstName: profile.first_name,
    lastName: profile.last_name,
    middleName: profile.middle_name,
    avatarUrl: profile.avatar_url,
    phone: profile.phone,
    isActive: profile.is_active,
  };
}
```

- [ ] **Step 3: Create getUserWithRole helper**

Create `src/lib/auth/get-user-with-role.ts`:

```typescript
import { createServerClient } from "@/lib/supabase/server";
import type { UserWithRole, UserRole } from "@/types/auth";

export async function getUserWithRole(): Promise<UserWithRole | null> {
  const supabase = await createServerClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  if (!authUser) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .single();

  if (!profile) return null;

  const { data: userRoles } = await supabase
    .from("user_roles")
    .select(`
      role_id,
      roles:role_id (
        id,
        slug,
        name_tg,
        name_ru,
        level,
        is_system
      )
    `)
    .eq("user_id", authUser.id);

  const roles: UserRole[] = (userRoles ?? []).map((ur: Record<string, unknown>) => {
    const r = ur.roles as Record<string, unknown>;
    return {
      id: r.id as string,
      slug: r.slug as string,
      nameTg: r.name_tg as string,
      nameRu: (r.name_ru as string) ?? null,
      level: r.level as number,
      isSystem: r.is_system as boolean,
    };
  });

  return {
    id: profile.id,
    schoolId: profile.school_id,
    publicId: profile.public_id,
    email: profile.email,
    firstName: profile.first_name,
    lastName: profile.last_name,
    middleName: profile.middle_name,
    avatarUrl: profile.avatar_url,
    phone: profile.phone,
    isActive: profile.is_active,
    roles,
  };
}
```

- [ ] **Step 4: Create permission check utility**

Create `src/lib/permissions/check.ts`:

```typescript
import { createServerClient } from "@/lib/supabase/server";

export async function hasPermission(permissionSlug: string): Promise<boolean> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return false;

  const { data } = await supabase.rpc("current_user_has_permission", {
    p_permission_slug: permissionSlug,
  });

  return data === true;
}

export async function getUserPermissions(): Promise<string[]> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase
    .from("user_roles")
    .select(`
      roles:role_id (
        role_permissions (
          permissions:permission_id (
            slug
          )
        )
      )
    `)
    .eq("user_id", user.id);

  if (!data) return [];

  const slugs = new Set<string>();
  for (const ur of data) {
    const role = ur.roles as Record<string, unknown>;
    const rps = role.role_permissions as Array<Record<string, unknown>>;
    for (const rp of rps ?? []) {
      const perm = rp.permissions as Record<string, unknown>;
      slugs.add(perm.slug as string);
    }
  }

  return Array.from(slugs);
}
```

- [ ] **Step 5: Create module access check utility**

Create `src/lib/modules/check.ts`:

```typescript
import { createServerClient } from "@/lib/supabase/server";

export async function isModuleEnabled(moduleSlug: string): Promise<boolean> {
  const supabase = await createServerClient();

  const { data } = await supabase
    .from("school_modules")
    .select("is_enabled, modules!inner(slug)")
    .eq("modules.slug", moduleSlug)
    .single();

  return data?.is_enabled === true;
}

export async function isModuleAccessible(moduleSlug: string): Promise<boolean> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return false;

  // Check module is enabled
  const enabled = await isModuleEnabled(moduleSlug);
  if (!enabled) return false;

  // Check role has visibility
  const { data: access } = await supabase
    .from("module_role_access")
    .select(`
      is_visible,
      modules!inner(slug),
      roles!inner(
        id,
        user_roles!inner(user_id)
      )
    `)
    .eq("modules.slug", moduleSlug)
    .eq("roles.user_roles.user_id", user.id)
    .eq("is_visible", true);

  return (access?.length ?? 0) > 0;
}

export async function canPerformAction(
  moduleSlug: string,
  permissionSlug: string
): Promise<boolean> {
  const accessible = await isModuleAccessible(moduleSlug);
  if (!accessible) return false;

  const { hasPermission } = await import("@/lib/permissions/check");
  return hasPermission(permissionSlug);
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/ src/lib/permissions/ src/lib/modules/ src/types/auth.ts
git commit -m "feat: add auth helpers, permission checks, and module access utilities"
```

---

### Task 7: Base UI Components

**Files:**
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/input.tsx`
- Create: `src/components/ui/card.tsx`
- Create: `src/components/ui/skeleton.tsx`
- Create: `src/components/ui/avatar.tsx`
- Create: `src/components/ui/badge.tsx`
- Create: `src/components/ui/dialog.tsx`
- Create: `src/components/ui/dropdown-menu.tsx`
- Create: `src/components/ui/toast.tsx`
- Create: `src/components/ui/empty-state.tsx`
- Create: `src/components/ui/error-state.tsx`
- Create: `src/components/ui/spinner.tsx`

**Interfaces:**
- Consumes: `cn()` from Task 2, design tokens from Task 2
- Produces: Reusable, animated UI components matching the design system

- [ ] **Step 1: Install Radix UI primitives for accessible components**

```bash
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-toast @radix-ui/react-slot @radix-ui/react-tooltip
npm install lucide-react
npm install cva
```

(`cva` = class-variance-authority for component variants)

- [ ] **Step 2: Create Button component**

Create `src/components/ui/button.tsx`:

```tsx
"use client";

import { forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "cva";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva({
  base: "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-[var(--duration-fast)] ease-[var(--ease-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]",
  variants: {
    variant: {
      default: "bg-primary-600 text-white hover:bg-primary-700 shadow-sm",
      destructive: "bg-error-500 text-white hover:bg-error-600 shadow-sm",
      outline: "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 hover:border-neutral-400",
      secondary: "bg-neutral-100 text-neutral-700 hover:bg-neutral-200",
      ghost: "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
      link: "text-primary-600 underline-offset-4 hover:underline",
    },
    size: {
      default: "h-10 px-4 py-2",
      sm: "h-8 px-3 text-xs",
      lg: "h-12 px-6 text-base",
      icon: "h-10 w-10",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
```

- [ ] **Step 3: Create Input component**

Create `src/components/ui/input.tsx`:

```tsx
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm transition-colors duration-[var(--duration-fast)] ease-[var(--ease-default)] file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
          error
            ? "border-error-500 focus-visible:ring-error-500"
            : "border-neutral-300 hover:border-neutral-400",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
```

- [ ] **Step 4: Create Card component**

Create `src/components/ui/card.tsx`:

```tsx
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

const Card = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-xl border border-neutral-200 bg-white shadow-sm transition-shadow duration-[var(--duration-normal)] ease-[var(--ease-default)]",
        className
      )}
      {...props}
    />
  )
);
Card.displayName = "Card";

const CardHeader = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />
  )
);
CardHeader.displayName = "CardHeader";

const CardTitle = forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />
  )
);
CardTitle.displayName = "CardTitle";

const CardDescription = forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-neutral-500", className)} {...props} />
  )
);
CardDescription.displayName = "CardDescription";

const CardContent = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  )
);
CardContent.displayName = "CardContent";

const CardFooter = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  )
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
```

- [ ] **Step 5: Create Skeleton component**

Create `src/components/ui/skeleton.tsx`:

```tsx
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-shimmer rounded-md", className)}
      {...props}
    />
  );
}

export { Skeleton };
```

- [ ] **Step 6: Create Avatar component**

Create `src/components/ui/avatar.tsx`:

```tsx
"use client";

import { forwardRef, useState } from "react";
import { cn } from "@/lib/utils";

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  fallback: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-lg",
};

const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, src, alt, fallback, size = "md", ...props }, ref) => {
    const [imageError, setImageError] = useState(false);
    const initials = fallback.slice(0, 2).toUpperCase();

    return (
      <div
        ref={ref}
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-100 text-primary-700 font-medium",
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {src && !imageError ? (
          <img
            src={src}
            alt={alt ?? fallback}
            className="h-full w-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <span>{initials}</span>
        )}
      </div>
    );
  }
);
Avatar.displayName = "Avatar";

export { Avatar };
```

- [ ] **Step 7: Create Badge component**

Create `src/components/ui/badge.tsx`:

```tsx
import { cva, type VariantProps } from "cva";
import { cn } from "@/lib/utils";

const badgeVariants = cva({
  base: "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors duration-[var(--duration-fast)]",
  variants: {
    variant: {
      default: "bg-primary-100 text-primary-700",
      secondary: "bg-neutral-100 text-neutral-700",
      success: "bg-green-100 text-green-700",
      warning: "bg-amber-100 text-amber-700",
      destructive: "bg-red-100 text-red-700",
      outline: "border border-neutral-300 text-neutral-600",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
```

- [ ] **Step 8: Create Spinner component**

Create `src/components/ui/spinner.tsx`:

```tsx
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpinnerProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

export function Spinner({ className, size = "md" }: SpinnerProps) {
  return (
    <Loader2
      className={cn("animate-spin text-primary-500", sizeClasses[size], className)}
    />
  );
}
```

- [ ] **Step 9: Create EmptyState component**

Create `src/components/ui/empty-state.tsx`:

```tsx
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 text-center animate-in", className)}>
      {icon && (
        <div className="mb-4 text-neutral-300">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-medium text-neutral-700">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-neutral-500">{description}</p>
      )}
      {action && (
        <Button variant="outline" className="mt-4" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 10: Create ErrorState component (with playful characters)**

Create `src/components/ui/error-state.tsx`:

```tsx
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface ErrorStateProps {
  title: string;
  description?: string;
  actions?: Array<{
    label: string;
    onClick: () => void;
    variant?: "default" | "outline" | "ghost";
  }>;
  showCharacters?: boolean;
  className?: string;
}

function PlayfulCharacters() {
  return (
    <div className="mb-6 flex items-end justify-center gap-1">
      {/* Character 1 - confused */}
      <svg width="48" height="56" viewBox="0 0 48 56" fill="none" className="animate-in" style={{ animationDelay: "100ms" }}>
        <rect x="8" y="16" width="32" height="32" rx="8" fill="var(--color-primary-200)" />
        <circle cx="18" cy="30" r="3" fill="var(--color-primary-700)" />
        <circle cx="30" cy="30" r="3" fill="var(--color-primary-700)" />
        <path d="M18 38 C22 36 26 36 30 38" stroke="var(--color-primary-700)" strokeWidth="2" strokeLinecap="round" />
        <text x="24" y="10" textAnchor="middle" fontSize="14">?</text>
      </svg>
      {/* Character 2 - panicking */}
      <svg width="48" height="56" viewBox="0 0 48 56" fill="none" className="animate-in" style={{ animationDelay: "250ms" }}>
        <rect x="8" y="16" width="32" height="32" rx="8" fill="var(--color-warning-500)" opacity="0.3" />
        <circle cx="16" cy="30" r="4" fill="var(--color-neutral-700)" />
        <circle cx="32" cy="30" r="4" fill="var(--color-neutral-700)" />
        <ellipse cx="24" cy="40" rx="4" ry="3" fill="var(--color-neutral-700)" />
        <line x1="10" y1="12" x2="14" y2="18" stroke="var(--color-neutral-400)" strokeWidth="2" strokeLinecap="round" />
        <line x1="38" y1="12" x2="34" y2="18" stroke="var(--color-neutral-400)" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function ErrorState({
  title,
  description,
  actions,
  showCharacters = true,
  className,
}: ErrorStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 text-center animate-in", className)}>
      {showCharacters && <PlayfulCharacters />}
      <h3 className="text-lg font-medium text-neutral-800">{title}</h3>
      {description && (
        <p className="mt-2 max-w-md text-sm text-neutral-500">{description}</p>
      )}
      {actions && actions.length > 0 && (
        <div className="mt-6 flex gap-3">
          {actions.map((action, i) => (
            <Button
              key={i}
              variant={action.variant ?? (i === 0 ? "default" : "outline")}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 11: Commit**

```bash
git add src/components/ui/
git commit -m "feat: add base UI components with iOS-level animations and playful error states"
```

---

### Task 8: Login Page

**Files:**
- Create: `src/app/(public)/login/page.tsx`
- Create: `src/app/(public)/login/login-form.tsx`
- Create: `src/app/(public)/login/actions.ts`
- Create: `src/app/(public)/layout.tsx`

**Interfaces:**
- Consumes: `createServerClient()` from Task 3, `Input`/`Button`/`Card` from Task 7, translations from Task 4
- Produces: Working login page at `/login` with email/password auth via Supabase

- [ ] **Step 1: Create public layout**

Create `src/app/(public)/layout.tsx`:

```tsx
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Create login server action**

Create `src/app/(public)/login/actions.ts`:

```typescript
"use server";

import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function loginAction(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "invalidCredentials" };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: "invalidCredentials" };
  }

  const redirectTo = new URL(
    formData.get("redirect")?.toString() ?? "/dashboard",
    process.env.NEXT_PUBLIC_APP_URL
  ).pathname;

  redirect(redirectTo);
}
```

- [ ] **Step 3: Create login form (Client Component)**

Create `src/app/(public)/login/login-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { loginAction } from "./actions";

export function LoginForm({ redirect }: { redirect?: string }) {
  const t = useTranslations("auth");
  const [state, formAction, isPending] = useActionState(loginAction, { error: null });

  return (
    <form action={formAction} className="space-y-4">
      {redirect && <input type="hidden" name="redirect" value={redirect} />}

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

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-neutral-700">
          {t("password")}
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          error={!!state.error}
        />
      </div>

      {state.error && (
        <div className="animate-in rounded-lg bg-red-50 p-3 text-sm text-error-600">
          {t(state.error)}
        </div>
      )}

      <Button type="submit" className="w-full" loading={isPending}>
        {t("loginButton")}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Create login page**

Create `src/app/(public)/login/page.tsx`:

```tsx
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const t = useTranslations("auth");

  return (
    <Card className="w-full max-w-md animate-in">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 text-2xl font-bold text-primary-600">
          МТМУ №7
        </div>
        <CardTitle>{t("loginTitle")}</CardTitle>
        <CardDescription>{t("loginDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Verify login page renders**

Run `npm run dev`, navigate to `http://localhost:3000/login`. Should see styled login form with Tajik labels.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(public\)/
git commit -m "feat: add login page with Supabase auth and Tajik localization"
```

---

### Task 9: App Shell — Sidebar, Header, Navigation

**Files:**
- Create: `src/app/(dashboard)/layout.tsx`
- Create: `src/components/layout/sidebar.tsx`
- Create: `src/components/layout/header.tsx`
- Create: `src/components/layout/mobile-nav.tsx`
- Create: `src/components/layout/nav-items.tsx`
- Create: `src/components/layout/user-menu.tsx`
- Create: `src/app/(dashboard)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `getUserWithRole()` from Task 6, `isModuleAccessible()` from Task 6, translations from Task 4, UI components from Task 7
- Produces: Complete app shell with sidebar navigation, header with user menu, responsive layout, and a placeholder dashboard page

- [ ] **Step 1: Create nav items configuration**

Create `src/components/layout/nav-items.tsx`:

```tsx
import {
  LayoutDashboard, MessageSquare, BookOpen, GraduationCap,
  ClipboardCheck, FileText, Calendar, FolderOpen,
  PartyPopper, Megaphone, BarChart3, Settings, Shield
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  moduleSlug?: string;
  adminOnly?: boolean;
}

export const mainNavItems: NavItem[] = [
  { label: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "nav.messages", href: "/messages", icon: MessageSquare, moduleSlug: "messages" },
  { label: "nav.library", href: "/library", icon: BookOpen, moduleSlug: "library" },
  { label: "nav.grades", href: "/grades", icon: GraduationCap, moduleSlug: "grades" },
  { label: "nav.attendance", href: "/attendance", icon: ClipboardCheck, moduleSlug: "attendance" },
  { label: "nav.homework", href: "/homework", icon: FileText, moduleSlug: "homework" },
  { label: "nav.schedule", href: "/schedule", icon: Calendar, moduleSlug: "schedule" },
  { label: "nav.documents", href: "/documents", icon: FolderOpen, moduleSlug: "documents" },
  { label: "nav.events", href: "/events", icon: PartyPopper, moduleSlug: "events" },
  { label: "nav.announcements", href: "/announcements", icon: Megaphone, moduleSlug: "announcements" },
  { label: "nav.reports", href: "/reports", icon: BarChart3, moduleSlug: "reports" },
];

export const bottomNavItems: NavItem[] = [
  { label: "nav.admin", href: "/admin", icon: Shield, adminOnly: true },
  { label: "nav.settings", href: "/settings", icon: Settings },
];
```

- [ ] **Step 2: Create Sidebar component**

Create `src/components/layout/sidebar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { mainNavItems, bottomNavItems, type NavItem } from "./nav-items";

interface SidebarProps {
  enabledModules: string[];
  isAdmin: boolean;
}

export function Sidebar({ enabledModules, isAdmin }: SidebarProps) {
  const pathname = usePathname();
  const t = useTranslations();

  const filteredMain = mainNavItems.filter(
    (item) => !item.moduleSlug || enabledModules.includes(item.moduleSlug)
  );

  const filteredBottom = bottomNavItems.filter(
    (item) => !item.adminOnly || isAdmin
  );

  return (
    <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-neutral-200 lg:bg-white">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-neutral-200 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-sm font-bold text-white">
          М
        </div>
        <span className="font-semibold text-neutral-900">МТМУ №7</span>
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-1">
          {filteredMain.map((item) => (
            <NavLink key={item.href} item={item} isActive={pathname.startsWith(item.href)} t={t} />
          ))}
        </ul>
      </nav>

      {/* Bottom nav */}
      <div className="border-t border-neutral-200 p-3">
        <ul className="space-y-1">
          {filteredBottom.map((item) => (
            <NavLink key={item.href} item={item} isActive={pathname.startsWith(item.href)} t={t} />
          ))}
        </ul>
      </div>
    </aside>
  );
}

function NavLink({ item, isActive, t }: { item: NavItem; isActive: boolean; t: ReturnType<typeof useTranslations> }) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-[var(--duration-fast)] ease-[var(--ease-default)]",
          isActive
            ? "bg-primary-50 text-primary-700"
            : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
        )}
      >
        <Icon className={cn("h-5 w-5 shrink-0", isActive ? "text-primary-600" : "text-neutral-400")} />
        {t(item.label)}
      </Link>
    </li>
  );
}
```

- [ ] **Step 3: Create Header component**

Create `src/components/layout/header.tsx`:

```tsx
"use client";

import { Bell, Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { UserMenu } from "./user-menu";
import type { UserWithRole } from "@/types/auth";

interface HeaderProps {
  user: UserWithRole;
  onMenuToggle?: () => void;
  notificationCount?: number;
}

export function Header({ user, onMenuToggle, notificationCount = 0 }: HeaderProps) {
  const t = useTranslations();

  return (
    <header className="flex h-16 items-center justify-between border-b border-neutral-200 bg-white px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMenuToggle}
          aria-label="Menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="lg:hidden flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-600 text-xs font-bold text-white">
            М
          </div>
          <span className="font-semibold text-neutral-900 text-sm">МТМУ №7</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="relative" aria-label={t("nav.notifications")}>
          <Bell className="h-5 w-5 text-neutral-500" />
          {notificationCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error-500 px-1 text-[10px] font-medium text-white animate-scale-in">
              {notificationCount > 99 ? "99+" : notificationCount}
            </span>
          )}
        </Button>

        <UserMenu user={user} />
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Create UserMenu component**

Create `src/components/layout/user-menu.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LogOut, User, Settings } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import type { UserWithRole } from "@/types/auth";

export function UserMenu({ user }: { user: UserWithRole }) {
  const t = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleLogout = () => {
    startTransition(async () => {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    });
  };

  const primaryRole = user.roles[0];

  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-neutral-50">
      <Avatar
        src={user.avatarUrl}
        fallback={`${user.firstName[0]}${user.lastName[0]}`}
        size="sm"
      />
      <div className="hidden sm:block">
        <p className="text-sm font-medium text-neutral-900">
          {user.firstName} {user.lastName}
        </p>
        {primaryRole && (
          <p className="text-xs text-neutral-500">{primaryRole.nameTg}</p>
        )}
      </div>
      <button
        onClick={handleLogout}
        disabled={isPending}
        className="ml-1 rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
        aria-label={t("auth.logout")}
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Create MobileNav component**

Create `src/components/layout/mobile-nav.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { mainNavItems, bottomNavItems, type NavItem } from "./nav-items";
import { Button } from "@/components/ui/button";

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
  enabledModules: string[];
  isAdmin: boolean;
}

export function MobileNav({ isOpen, onClose, enabledModules, isAdmin }: MobileNavProps) {
  const pathname = usePathname();
  const t = useTranslations();
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    onClose();
  }, [pathname, onClose]);

  const filteredMain = mainNavItems.filter(
    (item) => !item.moduleSlug || enabledModules.includes(item.moduleSlug)
  );

  const filteredBottom = bottomNavItems.filter(
    (item) => !item.adminOnly || isAdmin
  );

  return (
    <>
      {/* Overlay */}
      <div
        ref={overlayRef}
        className={cn(
          "fixed inset-0 z-[200] bg-black/50 transition-opacity duration-[var(--duration-slow)] lg:hidden",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-[201] w-72 bg-white shadow-xl transition-transform duration-[var(--duration-slow)] ease-[var(--ease-out)] lg:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-neutral-200 px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-sm font-bold text-white">
              М
            </div>
            <span className="font-semibold text-neutral-900">МТМУ №7</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          <ul className="space-y-1">
            {filteredMain.map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary-50 text-primary-700"
                        : "text-neutral-600 hover:bg-neutral-100"
                    )}
                  >
                    <Icon className={cn("h-5 w-5", active ? "text-primary-600" : "text-neutral-400")} />
                    {t(item.label)}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="my-3 border-t border-neutral-200" />

          <ul className="space-y-1">
            {filteredBottom.map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary-50 text-primary-700"
                        : "text-neutral-600 hover:bg-neutral-100"
                    )}
                  >
                    <Icon className={cn("h-5 w-5", active ? "text-primary-600" : "text-neutral-400")} />
                    {t(item.label)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </>
  );
}
```

- [ ] **Step 6: Create dashboard layout**

Create `src/app/(dashboard)/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { DashboardShell } from "./dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUserWithRole();

  if (!user) {
    redirect("/login");
  }

  return <DashboardShell user={user}>{children}</DashboardShell>;
}
```

Create `src/app/(dashboard)/dashboard-shell.tsx`:

```tsx
"use client";

import { useState, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import type { UserWithRole } from "@/types/auth";

interface DashboardShellProps {
  user: UserWithRole;
  children: React.ReactNode;
}

export function DashboardShell({ user, children }: DashboardShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isAdmin = user.roles.some((r) => r.slug === "admin");

  // TODO: Load from server — for now show all modules
  const enabledModules = [
    "messages", "library", "grades", "attendance",
    "homework", "schedule", "documents", "events",
    "announcements", "reports", "analytics",
  ];

  const handleMenuToggle = useCallback(() => {
    setMobileMenuOpen((prev) => !prev);
  }, []);

  const handleMenuClose = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50">
      <Sidebar enabledModules={enabledModules} isAdmin={isAdmin} />
      <MobileNav
        isOpen={mobileMenuOpen}
        onClose={handleMenuClose}
        enabledModules={enabledModules}
        isAdmin={isAdmin}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header user={user} onMenuToggle={handleMenuToggle} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create placeholder dashboard page**

Create `src/app/(dashboard)/dashboard/page.tsx`:

```tsx
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  const t = useTranslations("nav");

  return (
    <div className="space-y-6 animate-in">
      <h1 className="text-2xl font-bold text-neutral-900">{t("dashboard")}</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="hover:shadow-md">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-neutral-500">
                --
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">--</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Update root page to redirect to dashboard**

Modify `src/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
```

- [ ] **Step 9: Verify the app shell renders**

Run `npm run dev`. Navigate to `http://localhost:3000` — should redirect to `/login` (no auth). Verify sidebar, header layout, responsive mobile nav structure is correct.

- [ ] **Step 10: Commit**

```bash
git add src/app/ src/components/layout/
git commit -m "feat: add app shell with sidebar, header, mobile nav, and dashboard page"
```

---

### Task 10: Build Verification and Type Check

**Files:** None new — verification only.

**Interfaces:** Verifies all previous tasks integrate correctly.

- [ ] **Step 1: Run TypeScript type check**

```bash
npx tsc --noEmit
```

Fix any type errors.

- [ ] **Step 2: Run production build**

```bash
npm run build
```

Fix any build errors.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Fix any lint errors.

- [ ] **Step 4: Verify app runs in production mode**

```bash
npm run start
```

Open `http://localhost:3000` — verify login page renders, navigation works.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build and type errors"
```
