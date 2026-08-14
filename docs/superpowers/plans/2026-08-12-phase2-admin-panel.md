# Phase 2: Admin Panel + CMS + Feature Management

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the admin panel with real RBAC enforcement, CMS for school content, feature management with the three-level check chain, and server-driven module navigation.

**Architecture:** Admin routes under `src/app/(dashboard)/admin/` protected by a server-side layout guard that verifies admin role. All mutations go through server actions with permission checks before any DB call. The existing RLS policies are the final enforcement layer — UI hides elements for UX only, never for security. Feature management uses the approved chain: module enabled → role has access → role has permission.

**Tech Stack:** Next.js 16 (App Router, Server Components, Server Actions), TypeScript strict, Supabase (RLS, service_role for admin ops), next-intl (tg/ru), Tailwind CSS 4, existing UI component library, Zod validation.

## Global Constraints

- Every admin route must verify admin role server-side in layout/page, not just UI
- All mutations must call `hasPermission()` or `current_user_is_admin()` server-side before any DB operation
- RLS is the final gate — even if server-side check is bypassed, RLS must deny
- `service_role` client only for operations that require bypassing RLS (user creation tied to auth.users)
- All UI text through i18n keys, never hardcoded strings
- All new components use design token CSS variables and global animation system
- `as never` type assertions on Supabase queries until auto-generated types available
- Soft delete with timestamp fields where specified by spec
- No mock data, no hardcoded module lists, no temporary permission bypasses

---

### Task 1: Admin Layout Guard and Server-Driven Navigation

**Files:**
- Create: `src/app/(dashboard)/admin/layout.tsx`
- Create: `src/lib/admin/guard.ts`
- Create: `src/lib/modules/get-enabled.ts`
- Modify: `src/app/(dashboard)/dashboard-shell.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`
- Modify: `src/i18n/tg.json`
- Modify: `src/i18n/ru.json`

**Interfaces:**
- Consumes: `getUserWithRole()` from `src/lib/auth/get-user-with-role`, `isModuleAccessible()` from `src/lib/modules/check`, `createServerClient()` from `src/lib/supabase/server`
- Produces: `requireAdmin()` guard function, `getEnabledModulesForUser()` function, server-driven `enabledModules` prop replacing hardcoded list

- [ ] **Step 1: Create admin guard utility**

Create `src/lib/admin/guard.ts`:

```typescript
import { redirect } from "next/navigation";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import type { UserWithRole } from "@/types/auth";

export async function requireAdmin(): Promise<UserWithRole> {
  const user = await getUserWithRole();

  if (!user) {
    redirect("/login");
  }

  const isAdmin = user.roles.some((r) => r.slug === "admin");
  if (!isAdmin) {
    redirect("/dashboard?error=forbidden");
  }

  return user;
}
```

- [ ] **Step 2: Create server-driven module loading**

Create `src/lib/modules/get-enabled.ts`:

```typescript
import { createServerClient } from "@/lib/supabase/server";

export async function getEnabledModulesForUser(): Promise<string[]> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase
    .from("module_role_access" as never)
    .select(`
      modules!inner(slug),
      roles!inner(
        user_roles!inner(user_id)
      ),
      school_modules:school_id(
        is_enabled,
        module_id
      )
    ` as never)
    .eq("roles.user_roles.user_id" as never, user.id)
    .eq("is_visible" as never, true);

  if (!data) return [];

  const slugs = new Set<string>();
  for (const row of data as Array<Record<string, unknown>>) {
    const mod = row.modules as Record<string, unknown>;
    slugs.add(mod.slug as string);
  }

  return Array.from(slugs);
}

export async function getEnabledModuleSlugs(): Promise<string[]> {
  const supabase = await createServerClient();

  const { data } = await supabase
    .from("school_modules" as never)
    .select("modules!inner(slug), is_enabled" as never)
    .eq("is_enabled" as never, true);

  if (!data) return [];

  return (data as Array<Record<string, unknown>>).map((row) => {
    const mod = row.modules as Record<string, unknown>;
    return mod.slug as string;
  });
}
```

- [ ] **Step 3: Update dashboard layout to pass server-driven modules**

Modify `src/app/(dashboard)/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getUserWithRole } from "@/lib/auth/get-user-with-role";
import { getEnabledModulesForUser } from "@/lib/modules/get-enabled";
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

  const enabledModules = await getEnabledModulesForUser();

  return (
    <DashboardShell user={user} enabledModules={enabledModules}>
      {children}
    </DashboardShell>
  );
}
```

- [ ] **Step 4: Update DashboardShell to accept server-driven modules**

Modify `src/app/(dashboard)/dashboard-shell.tsx` — remove the hardcoded `enabledModules` array and accept it as a prop:

```tsx
"use client";

import { useState, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import type { UserWithRole } from "@/types/auth";

interface DashboardShellProps {
  user: UserWithRole;
  enabledModules: string[];
  children: React.ReactNode;
}

export function DashboardShell({ user, enabledModules, children }: DashboardShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isAdmin = user.roles.some((r) => r.slug === "admin");

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

- [ ] **Step 5: Create admin layout with server-side guard**

Create `src/app/(dashboard)/admin/layout.tsx`:

```tsx
import { requireAdmin } from "@/lib/admin/guard";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return <>{children}</>;
}
```

- [ ] **Step 6: Add admin panel i18n keys**

Add to `src/i18n/tg.json` under `"admin"`:

```json
{
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
    "subjects": "Фанҳо",
    "dashboard": "Панели маъмурӣ",
    "overview": "Хулоса",
    "totalUsers": "Ҳамагӣ корбарон",
    "totalClasses": "Ҳамагӣ синфҳо",
    "totalSubjects": "Ҳамагӣ фанҳо",
    "totalBooks": "Ҳамагӣ китобҳо",
    "activeModules": "Бахшҳои фаъол",
    "recentActivity": "Фаъолияти охирин",
    "quickActions": "Амалҳои зуд",
    "addUser": "Илова кардани корбар",
    "manageModules": "Идоракунии бахшҳо",
    "editContent": "Таҳрири мундариҷа",
    "viewAuditLog": "Дидани журнал",
    "schoolSettings": "Танзимоти мактаб",
    "modulesManagement": "Идоракунии бахшҳо",
    "enableModule": "Фаъол кардан",
    "disableModule": "Ғайрифаъол кардан",
    "moduleEnabled": "Фаъол",
    "moduleDisabled": "Ғайрифаъол",
    "roleVisibility": "Намоиш барои нақшҳо",
    "saveChanges": "Нигоҳ доштан",
    "saved": "Нигоҳ дошта шуд",
    "permissionsMatrix": "Матритсаи дастрасӣ",
    "assignPermission": "Додани дастрасӣ",
    "removePermission": "Нест кардани дастрасӣ",
    "systemRole": "Нақши системавӣ",
    "noChangesAllowed": "Тағйирот имконнопазир аст",
    "userStatus": "Ҳолати корбар",
    "activate": "Фаъол кардан",
    "deactivate": "Ғайрифаъол кардан",
    "userDetails": "Маълумоти корбар",
    "assignRole": "Додани нақш",
    "removeRole": "Нест кардани нақш",
    "schoolName": "Номи мактаб",
    "schoolFullName": "Номи пурра",
    "schoolLogo": "Логотип",
    "schoolAddress": "Суроға",
    "schoolPhone": "Телефон",
    "schoolEmail": "Почтаи электронӣ",
    "schoolWebsite": "Вебсайт",
    "idPrefix": "Префикси ID"
  }
}
```

Add corresponding Russian translations to `src/i18n/ru.json` under `"admin"`:

```json
{
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
    "subjects": "Предметы",
    "dashboard": "Админ-панель",
    "overview": "Обзор",
    "totalUsers": "Всего пользователей",
    "totalClasses": "Всего классов",
    "totalSubjects": "Всего предметов",
    "totalBooks": "Всего книг",
    "activeModules": "Активные модули",
    "recentActivity": "Последняя активность",
    "quickActions": "Быстрые действия",
    "addUser": "Добавить пользователя",
    "manageModules": "Управление модулями",
    "editContent": "Редактировать контент",
    "viewAuditLog": "Журнал действий",
    "schoolSettings": "Настройки школы",
    "modulesManagement": "Управление модулями",
    "enableModule": "Включить",
    "disableModule": "Выключить",
    "moduleEnabled": "Включён",
    "moduleDisabled": "Выключен",
    "roleVisibility": "Видимость для ролей",
    "saveChanges": "Сохранить",
    "saved": "Сохранено",
    "permissionsMatrix": "Матрица доступа",
    "assignPermission": "Назначить право",
    "removePermission": "Убрать право",
    "systemRole": "Системная роль",
    "noChangesAllowed": "Изменения невозможны",
    "userStatus": "Статус пользователя",
    "activate": "Активировать",
    "deactivate": "Деактивировать",
    "userDetails": "Данные пользователя",
    "assignRole": "Назначить роль",
    "removeRole": "Убрать роль",
    "schoolName": "Название школы",
    "schoolFullName": "Полное название",
    "schoolLogo": "Логотип",
    "schoolAddress": "Адрес",
    "schoolPhone": "Телефон",
    "schoolEmail": "Электронная почта",
    "schoolWebsite": "Веб-сайт",
    "idPrefix": "Префикс ID"
  }
}
```

- [ ] **Step 7: Verify and commit**

```bash
npx tsc --noEmit
npm run build
git add src/lib/admin/ src/lib/modules/get-enabled.ts src/app/(dashboard)/admin/layout.tsx src/app/(dashboard)/layout.tsx src/app/(dashboard)/dashboard-shell.tsx src/i18n/
git commit -m "feat: add admin layout guard and server-driven module navigation"
```

---

### Task 2: Admin Dashboard Overview Page

**Files:**
- Create: `src/app/(dashboard)/admin/page.tsx`
- Create: `src/app/(dashboard)/admin/admin-nav.tsx`
- Create: `src/components/ui/stat-card.tsx`

**Interfaces:**
- Consumes: `requireAdmin()` from Task 1, `createServerClient()`, `Card`/`Button`/`Skeleton` from UI lib, i18n keys from Task 1
- Produces: Admin dashboard page at `/admin` with stats and navigation to admin sub-sections

- [ ] **Step 1: Create stat card component**

Create `src/components/ui/stat-card.tsx`:

```tsx
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  className?: string;
}

export function StatCard({ label, value, icon, className }: StatCardProps) {
  return (
    <div className={cn(
      "flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition-shadow duration-[var(--duration-normal)] ease-[var(--ease-default)] hover:shadow-md",
      className
    )}>
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
        {icon}
      </div>
      <div>
        <p className="text-sm text-neutral-500">{label}</p>
        <p className="text-2xl font-semibold text-neutral-900">{value}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create admin sub-navigation component**

Create `src/app/(dashboard)/admin/admin-nav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  Users, Shield, School, Boxes, BookOpen,
  FileText, Bell, ScrollText, GraduationCap, BookMarked
} from "lucide-react";

const adminSections = [
  { label: "admin.overview", href: "/admin", icon: Boxes, exact: true },
  { label: "admin.users", href: "/admin/users", icon: Users },
  { label: "admin.roles", href: "/admin/roles", icon: Shield },
  { label: "admin.school", href: "/admin/school", icon: School },
  { label: "admin.modules", href: "/admin/modules", icon: Boxes },
  { label: "admin.classes", href: "/admin/classes", icon: GraduationCap },
  { label: "admin.subjects", href: "/admin/subjects", icon: BookMarked },
  { label: "admin.content", href: "/admin/content", icon: FileText },
  { label: "admin.notifications", href: "/admin/notifications", icon: Bell },
  { label: "admin.auditLog", href: "/admin/audit", icon: ScrollText },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  const t = useTranslations();

  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-neutral-200 bg-white p-1.5 shadow-sm">
      {adminSections.map((section) => {
        const isActive = section.exact
          ? pathname === section.href
          : pathname.startsWith(section.href);
        const Icon = section.icon;
        return (
          <Link
            key={section.href}
            href={section.href}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-[var(--duration-fast)] ease-[var(--ease-default)]",
              isActive
                ? "bg-primary-50 text-primary-700"
                : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700"
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{t(section.label)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 3: Create admin dashboard page**

Create `src/app/(dashboard)/admin/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { AdminNav } from "./admin-nav";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, GraduationCap, BookOpen, Boxes, Shield, FileText, Bell, ScrollText } from "lucide-react";
import Link from "next/link";

async function getAdminStats() {
  const supabase = await createServerClient();

  const [users, classes, subjects, books, modules] = await Promise.all([
    supabase.from("users" as never).select("id" as never, { count: "exact", head: true }),
    supabase.from("classes" as never).select("id" as never, { count: "exact", head: true }).eq("is_active" as never, true),
    supabase.from("subjects" as never).select("id" as never, { count: "exact", head: true }).eq("is_active" as never, true),
    supabase.from("library_items" as never).select("id" as never, { count: "exact", head: true }).eq("is_published" as never, true),
    supabase.from("school_modules" as never).select("module_id" as never, { count: "exact", head: true }).eq("is_enabled" as never, true),
  ]);

  return {
    totalUsers: users.count ?? 0,
    totalClasses: classes.count ?? 0,
    totalSubjects: subjects.count ?? 0,
    totalBooks: books.count ?? 0,
    activeModules: modules.count ?? 0,
  };
}

export default async function AdminDashboardPage() {
  await requireAdmin();
  const t = await getTranslations("admin");
  const stats = await getAdminStats();

  const quickActions = [
    { label: t("addUser"), href: "/admin/users", icon: Users },
    { label: t("manageModules"), href: "/admin/modules", icon: Boxes },
    { label: t("editContent"), href: "/admin/content", icon: FileText },
    { label: t("viewAuditLog"), href: "/admin/audit", icon: ScrollText },
  ];

  return (
    <div>
      <AdminNav />

      <div className="space-y-6 animate-in">
        <h1 className="text-2xl font-bold text-neutral-900">{t("dashboard")}</h1>

        {/* Stats grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label={t("totalUsers")} value={stats.totalUsers} icon={<Users className="h-6 w-6" />} />
          <StatCard label={t("totalClasses")} value={stats.totalClasses} icon={<GraduationCap className="h-6 w-6" />} />
          <StatCard label={t("totalSubjects")} value={stats.totalSubjects} icon={<BookOpen className="h-6 w-6" />} />
          <StatCard label={t("totalBooks")} value={stats.totalBooks} icon={<BookOpen className="h-6 w-6" />} />
          <StatCard label={t("activeModules")} value={stats.activeModules} icon={<Boxes className="h-6 w-6" />} />
        </div>

        {/* Quick actions */}
        <Card>
          <CardHeader>
            <CardTitle>{t("quickActions")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link key={action.href} href={action.href}>
                    <Button variant="outline" className="w-full justify-start gap-3">
                      <Icon className="h-4 w-4 text-primary-600" />
                      {action.label}
                    </Button>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit
npm run build
git add src/app/(dashboard)/admin/page.tsx src/app/(dashboard)/admin/admin-nav.tsx src/components/ui/stat-card.tsx
git commit -m "feat: add admin dashboard overview with stats and quick actions"
```

---

### Task 3: Module Management (Feature Management)

**Files:**
- Create: `src/app/(dashboard)/admin/modules/page.tsx`
- Create: `src/app/(dashboard)/admin/modules/module-manager.tsx`
- Create: `src/app/(dashboard)/admin/modules/actions.ts`

**Interfaces:**
- Consumes: `requireAdmin()`, `AdminNav`, `createServerClient()`, `Card`/`Button`/`Badge`/`Skeleton` from UI lib
- Produces: Module enable/disable page at `/admin/modules` with role visibility matrix, server actions for mutations

- [ ] **Step 1: Create module management server actions**

Create `src/app/(dashboard)/admin/modules/actions.ts`:

```typescript
"use server";

import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const toggleModuleSchema = z.object({
  moduleId: z.string().uuid(),
  enabled: z.boolean(),
});

export async function toggleModuleAction(
  _prevState: { error: string | null; success: boolean },
  formData: FormData
): Promise<{ error: string | null; success: boolean }> {
  await requireAdmin();

  const parsed = toggleModuleSchema.safeParse({
    moduleId: formData.get("moduleId"),
    enabled: formData.get("enabled") === "true",
  });

  if (!parsed.success) {
    return { error: "invalidData", success: false };
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("school_modules" as never)
    .update({
      is_enabled: parsed.data.enabled,
      ...(parsed.data.enabled ? { enabled_at: new Date().toISOString() } : { disabled_at: new Date().toISOString() }),
    } as never)
    .eq("module_id" as never, parsed.data.moduleId);

  if (error) {
    return { error: "saveFailed", success: false };
  }

  revalidatePath("/admin/modules");
  revalidatePath("/dashboard");
  return { error: null, success: true };
}

const toggleRoleVisibilitySchema = z.object({
  moduleId: z.string().uuid(),
  roleId: z.string().uuid(),
  visible: z.boolean(),
});

export async function toggleRoleVisibilityAction(
  _prevState: { error: string | null; success: boolean },
  formData: FormData
): Promise<{ error: string | null; success: boolean }> {
  await requireAdmin();

  const parsed = toggleRoleVisibilitySchema.safeParse({
    moduleId: formData.get("moduleId"),
    roleId: formData.get("roleId"),
    visible: formData.get("visible") === "true",
  });

  if (!parsed.success) {
    return { error: "invalidData", success: false };
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("module_role_access" as never)
    .update({ is_visible: parsed.data.visible } as never)
    .eq("module_id" as never, parsed.data.moduleId)
    .eq("role_id" as never, parsed.data.roleId);

  if (error) {
    return { error: "saveFailed", success: false };
  }

  revalidatePath("/admin/modules");
  revalidatePath("/dashboard");
  return { error: null, success: true };
}
```

- [ ] **Step 2: Create module manager client component**

Create `src/app/(dashboard)/admin/modules/module-manager.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toggleModuleAction, toggleRoleVisibilityAction } from "./actions";
import { cn } from "@/lib/utils";

interface Module {
  id: string;
  slug: string;
  nameTg: string;
  nameRu: string | null;
  icon: string;
  isSystem: boolean;
  isEnabled: boolean;
}

interface Role {
  id: string;
  slug: string;
  nameTg: string;
  level: number;
}

interface RoleAccess {
  moduleId: string;
  roleId: string;
  isVisible: boolean;
}

interface ModuleManagerProps {
  modules: Module[];
  roles: Role[];
  roleAccess: RoleAccess[];
}

export function ModuleManager({ modules, roles, roleAccess }: ModuleManagerProps) {
  const t = useTranslations("admin");

  return (
    <div className="space-y-6">
      {/* Module toggle cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod) => (
          <ModuleCard key={mod.id} module={mod} t={t} />
        ))}
      </div>

      {/* Role visibility matrix */}
      <Card>
        <CardHeader>
          <CardTitle>{t("roleVisibility")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="py-3 pr-4 text-left font-medium text-neutral-600">{t("modules")}</th>
                  {roles.map((role) => (
                    <th key={role.id} className="px-3 py-3 text-center font-medium text-neutral-600">
                      {role.nameTg}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modules.filter((m) => !m.isSystem).map((mod) => (
                  <tr key={mod.id} className="border-b border-neutral-100">
                    <td className="py-3 pr-4 font-medium text-neutral-800">
                      {mod.nameTg}
                      {!mod.isEnabled && (
                        <Badge variant="secondary" className="ml-2">{t("moduleDisabled")}</Badge>
                      )}
                    </td>
                    {roles.map((role) => {
                      const access = roleAccess.find(
                        (ra) => ra.moduleId === mod.id && ra.roleId === role.id
                      );
                      return (
                        <td key={role.id} className="px-3 py-3 text-center">
                          <RoleVisibilityToggle
                            moduleId={mod.id}
                            roleId={role.id}
                            visible={access?.isVisible ?? false}
                            disabled={!mod.isEnabled}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ModuleCard({ module: mod, t }: { module: Module; t: ReturnType<typeof useTranslations> }) {
  const [state, formAction, isPending] = useActionState(toggleModuleAction, { error: null, success: false });

  if (mod.isSystem) {
    return (
      <Card className="opacity-60">
        <CardContent className="flex items-center justify-between p-5">
          <div>
            <p className="font-medium text-neutral-800">{mod.nameTg}</p>
            <Badge variant="secondary" className="mt-1">{t("systemRole")}</Badge>
          </div>
          <Badge>{t("moduleEnabled")}</Badge>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(!mod.isEnabled && "border-neutral-100 bg-neutral-50/50")}>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="font-medium text-neutral-800">{mod.nameTg}</p>
        </div>
        <form action={formAction}>
          <input type="hidden" name="moduleId" value={mod.id} />
          <input type="hidden" name="enabled" value={(!mod.isEnabled).toString()} />
          <Button
            type="submit"
            variant={mod.isEnabled ? "outline" : "default"}
            size="sm"
            loading={isPending}
          >
            {mod.isEnabled ? t("disableModule") : t("enableModule")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function RoleVisibilityToggle({
  moduleId,
  roleId,
  visible,
  disabled,
}: {
  moduleId: string;
  roleId: string;
  visible: boolean;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(toggleRoleVisibilityAction, { error: null, success: false });

  return (
    <form action={formAction}>
      <input type="hidden" name="moduleId" value={moduleId} />
      <input type="hidden" name="roleId" value={roleId} />
      <input type="hidden" name="visible" value={(!visible).toString()} />
      <button
        type="submit"
        disabled={disabled || isPending}
        className={cn(
          "h-6 w-6 rounded-md border transition-all duration-[var(--duration-fast)] ease-[var(--ease-default)]",
          visible
            ? "border-primary-500 bg-primary-500 text-white"
            : "border-neutral-300 bg-white hover:border-neutral-400",
          disabled && "cursor-not-allowed opacity-40",
          isPending && "animate-pulse"
        )}
      >
        {visible && (
          <svg className="h-4 w-4 mx-auto" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        )}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Create module management page**

Create `src/app/(dashboard)/admin/modules/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { AdminNav } from "../admin-nav";
import { ModuleManager } from "./module-manager";

async function getModulesData() {
  const supabase = await createServerClient();

  const [modulesRes, rolesRes, accessRes] = await Promise.all([
    supabase
      .from("school_modules" as never)
      .select("is_enabled, modules!inner(id, slug, name_tg, name_ru, icon, is_system, sort_order)" as never)
      .order("modules.sort_order" as never, { ascending: true }),
    supabase
      .from("roles" as never)
      .select("id, slug, name_tg, level" as never)
      .order("level" as never, { ascending: true }),
    supabase
      .from("module_role_access" as never)
      .select("module_id, role_id, is_visible" as never),
  ]);

  const modules = ((modulesRes.data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const mod = row.modules as Record<string, unknown>;
    return {
      id: mod.id as string,
      slug: mod.slug as string,
      nameTg: mod.name_tg as string,
      nameRu: (mod.name_ru as string) ?? null,
      icon: (mod.icon as string) ?? "",
      isSystem: mod.is_system as boolean,
      isEnabled: row.is_enabled as boolean,
    };
  });

  const roles = ((rolesRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    slug: row.slug as string,
    nameTg: row.name_tg as string,
    level: row.level as number,
  }));

  const roleAccess = ((accessRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    moduleId: row.module_id as string,
    roleId: row.role_id as string,
    isVisible: row.is_visible as boolean,
  }));

  return { modules, roles, roleAccess };
}

export default async function ModulesPage() {
  await requireAdmin();
  const t = await getTranslations("admin");
  const { modules, roles, roleAccess } = await getModulesData();

  return (
    <div>
      <AdminNav />
      <div className="animate-in">
        <h1 className="mb-6 text-2xl font-bold text-neutral-900">{t("modulesManagement")}</h1>
        <ModuleManager modules={modules} roles={roles} roleAccess={roleAccess} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit
npm run build
git add src/app/(dashboard)/admin/modules/
git commit -m "feat: add module management with enable/disable and role visibility matrix"
```

---

### Task 4: School Settings Page

**Files:**
- Create: `src/app/(dashboard)/admin/school/page.tsx`
- Create: `src/app/(dashboard)/admin/school/school-settings-form.tsx`
- Create: `src/app/(dashboard)/admin/school/actions.ts`

**Interfaces:**
- Consumes: `requireAdmin()`, `AdminNav`, `createServerClient()`, `Card`/`Input`/`Button` from UI lib
- Produces: School settings page at `/admin/school` with form to edit school info

- [ ] **Step 1: Create school settings server action**

Create `src/app/(dashboard)/admin/school/actions.ts`:

```typescript
"use server";

import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const schoolSettingsSchema = z.object({
  shortName: z.string().min(1).max(100),
  fullName: z.string().min(1).max(500),
  address: z.string().max(500).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional().or(z.literal("")),
  website: z.string().max(255).optional(),
  idPrefix: z.string().min(1).max(5),
});

export async function updateSchoolSettingsAction(
  _prevState: { error: string | null; success: boolean },
  formData: FormData
): Promise<{ error: string | null; success: boolean }> {
  const user = await requireAdmin();

  const parsed = schoolSettingsSchema.safeParse({
    shortName: formData.get("shortName"),
    fullName: formData.get("fullName"),
    address: formData.get("address") || undefined,
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || "",
    website: formData.get("website") || undefined,
    idPrefix: formData.get("idPrefix"),
  });

  if (!parsed.success) {
    return { error: "invalidData", success: false };
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("schools" as never)
    .update({
      short_name: parsed.data.shortName,
      full_name: parsed.data.fullName,
      address: parsed.data.address ?? null,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email || null,
      website: parsed.data.website ?? null,
      id_prefix: parsed.data.idPrefix,
    } as never)
    .eq("id" as never, user.schoolId);

  if (error) {
    return { error: "saveFailed", success: false };
  }

  revalidatePath("/admin/school");
  return { error: null, success: true };
}
```

- [ ] **Step 2: Create school settings form**

Create `src/app/(dashboard)/admin/school/school-settings-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateSchoolSettingsAction } from "./actions";

interface SchoolData {
  shortName: string;
  fullName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  idPrefix: string;
}

export function SchoolSettingsForm({ school }: { school: SchoolData }) {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const [state, formAction, isPending] = useActionState(updateSchoolSettingsAction, { error: null, success: false });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("schoolSettings")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4 max-w-xl">
          <div className="space-y-2">
            <label htmlFor="shortName" className="text-sm font-medium text-neutral-700">{t("schoolName")}</label>
            <Input id="shortName" name="shortName" defaultValue={school.shortName} required />
          </div>
          <div className="space-y-2">
            <label htmlFor="fullName" className="text-sm font-medium text-neutral-700">{t("schoolFullName")}</label>
            <Input id="fullName" name="fullName" defaultValue={school.fullName} required />
          </div>
          <div className="space-y-2">
            <label htmlFor="address" className="text-sm font-medium text-neutral-700">{t("schoolAddress")}</label>
            <Input id="address" name="address" defaultValue={school.address ?? ""} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="phone" className="text-sm font-medium text-neutral-700">{t("schoolPhone")}</label>
              <Input id="phone" name="phone" defaultValue={school.phone ?? ""} />
            </div>
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-neutral-700">{t("schoolEmail")}</label>
              <Input id="email" name="email" type="email" defaultValue={school.email ?? ""} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="website" className="text-sm font-medium text-neutral-700">{t("schoolWebsite")}</label>
              <Input id="website" name="website" defaultValue={school.website ?? ""} />
            </div>
            <div className="space-y-2">
              <label htmlFor="idPrefix" className="text-sm font-medium text-neutral-700">{t("idPrefix")}</label>
              <Input id="idPrefix" name="idPrefix" defaultValue={school.idPrefix} required maxLength={5} />
            </div>
          </div>

          {state.error && (
            <div className="animate-in rounded-lg bg-red-50 p-3 text-sm text-error-600">
              {state.error}
            </div>
          )}
          {state.success && (
            <div className="animate-in rounded-lg bg-green-50 p-3 text-sm text-success-600">
              {t("saved")}
            </div>
          )}

          <Button type="submit" loading={isPending}>{t("saveChanges")}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Create school settings page**

Create `src/app/(dashboard)/admin/school/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { AdminNav } from "../admin-nav";
import { SchoolSettingsForm } from "./school-settings-form";

async function getSchoolData() {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("schools" as never)
    .select("short_name, full_name, address, phone, email, website, id_prefix" as never)
    .single();

  const row = data as Record<string, unknown> | null;
  if (!row) return null;

  return {
    shortName: row.short_name as string,
    fullName: row.full_name as string,
    address: (row.address as string) ?? null,
    phone: (row.phone as string) ?? null,
    email: (row.email as string) ?? null,
    website: (row.website as string) ?? null,
    idPrefix: row.id_prefix as string,
  };
}

export default async function SchoolSettingsPage() {
  await requireAdmin();
  const t = await getTranslations("admin");
  const school = await getSchoolData();

  if (!school) {
    return <div>School data not found</div>;
  }

  return (
    <div>
      <AdminNav />
      <div className="animate-in">
        <h1 className="mb-6 text-2xl font-bold text-neutral-900">{t("schoolSettings")}</h1>
        <SchoolSettingsForm school={school} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit
npm run build
git add src/app/(dashboard)/admin/school/
git commit -m "feat: add school settings page with editable school info"
```

---

### Task 5: CMS — Pages and Content Blocks Management

**Files:**
- Create: `src/app/(dashboard)/admin/content/page.tsx`
- Create: `src/app/(dashboard)/admin/content/pages-list.tsx`
- Create: `src/app/(dashboard)/admin/content/actions.ts`
- Create: `src/app/(dashboard)/admin/content/[pageId]/page.tsx`
- Create: `src/app/(dashboard)/admin/content/[pageId]/content-editor.tsx`
- Create: `src/app/(dashboard)/admin/content/[pageId]/actions.ts`
- Create: `src/app/(dashboard)/admin/content/new/page.tsx`

**Interfaces:**
- Consumes: `requireAdmin()`, `AdminNav`, `createServerClient()`, all UI components, i18n
- Produces: CMS at `/admin/content` with page list, create/edit pages, content blocks CRUD with reorder

- [ ] **Step 1: Create CMS page-level server actions**

Create `src/app/(dashboard)/admin/content/actions.ts`:

```typescript
"use server";

import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const createPageSchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  titleTg: z.string().min(1).max(300),
  titleRu: z.string().max(300).optional(),
});

export async function createPageAction(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const user = await requireAdmin();

  const parsed = createPageSchema.safeParse({
    slug: formData.get("slug"),
    titleTg: formData.get("titleTg"),
    titleRu: formData.get("titleRu") || undefined,
  });

  if (!parsed.success) {
    return { error: "invalidData" };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("pages" as never)
    .insert({
      school_id: user.schoolId,
      slug: parsed.data.slug,
      title_tg: parsed.data.titleTg,
      title_ru: parsed.data.titleRu ?? null,
    } as never)
    .select("id" as never)
    .single();

  if (error) {
    if (error.code === "23505") return { error: "duplicateSlug" };
    return { error: "saveFailed" };
  }

  revalidatePath("/admin/content");
  const row = data as Record<string, unknown>;
  redirect(`/admin/content/${row.id}`);
}

export async function togglePagePublishAction(pageId: string, publish: boolean) {
  await requireAdmin();

  const supabase = await createServerClient();
  await supabase
    .from("pages" as never)
    .update({ is_published: publish } as never)
    .eq("id" as never, pageId);

  revalidatePath("/admin/content");
}

export async function deletePageAction(pageId: string) {
  await requireAdmin();

  const supabase = await createServerClient();
  await supabase
    .from("pages" as never)
    .delete()
    .eq("id" as never, pageId);

  revalidatePath("/admin/content");
}
```

- [ ] **Step 2: Create pages list component**

Create `src/app/(dashboard)/admin/content/pages-list.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { togglePagePublishAction, deletePageAction } from "./actions";
import Link from "next/link";
import { FileText, Plus, Eye, EyeOff, Trash2, Edit } from "lucide-react";

interface PageItem {
  id: string;
  slug: string;
  titleTg: string;
  titleRu: string | null;
  isPublished: boolean;
  sortOrder: number;
  blocksCount: number;
}

export function PagesList({ pages }: { pages: PageItem[] }) {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");

  if (pages.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="h-12 w-12" />}
        title={tCommon("noData")}
        description={t("noPagesYet")}
        action={{ label: t("createPage"), onClick: () => {} }}
      />
    );
  }

  return (
    <div className="space-y-3">
      {pages.map((page) => (
        <Card key={page.id} className="animate-in">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-neutral-400" />
              <div>
                <p className="font-medium text-neutral-800">{page.titleTg}</p>
                <p className="text-sm text-neutral-500">/{page.slug} · {page.blocksCount} blocks</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={page.isPublished ? "default" : "secondary"}>
                {page.isPublished ? t("published") : t("draft")}
              </Badge>
              <form action={async () => {
                "use server";
                await togglePagePublishAction(page.id, !page.isPublished);
              }}>
                <Button type="submit" variant="ghost" size="icon">
                  {page.isPublished ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </form>
              <Link href={`/admin/content/${page.id}`}>
                <Button variant="ghost" size="icon">
                  <Edit className="h-4 w-4" />
                </Button>
              </Link>
              <form action={async () => {
                "use server";
                await deletePageAction(page.id);
              }}>
                <Button type="submit" variant="ghost" size="icon" className="text-error-500 hover:text-error-600">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create content listing page**

Create `src/app/(dashboard)/admin/content/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { AdminNav } from "../admin-nav";
import { PagesList } from "./pages-list";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";

async function getPages() {
  const supabase = await createServerClient();

  const { data } = await supabase
    .from("pages" as never)
    .select("id, slug, title_tg, title_ru, is_published, sort_order" as never)
    .order("sort_order" as never, { ascending: true });

  const pages = (data ?? []) as Array<Record<string, unknown>>;

  const pagesWithCounts = await Promise.all(
    pages.map(async (page) => {
      const { count } = await supabase
        .from("content_blocks" as never)
        .select("id" as never, { count: "exact", head: true })
        .eq("page_id" as never, page.id);

      return {
        id: page.id as string,
        slug: page.slug as string,
        titleTg: page.title_tg as string,
        titleRu: (page.title_ru as string) ?? null,
        isPublished: page.is_published as boolean,
        sortOrder: page.sort_order as number,
        blocksCount: count ?? 0,
      };
    })
  );

  return pagesWithCounts;
}

export default async function ContentPage() {
  await requireAdmin();
  const t = await getTranslations("admin");
  const pages = await getPages();

  return (
    <div>
      <AdminNav />
      <div className="animate-in">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-neutral-900">{t("content")}</h1>
          <Link href="/admin/content/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t("createPage")}
            </Button>
          </Link>
        </div>
        <PagesList pages={pages} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create new page form**

Create `src/app/(dashboard)/admin/content/new/page.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { AdminNav } from "../../admin-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createPageAction } from "../actions";

export default function NewPagePage() {
  const t = useTranslations("admin");
  const [state, formAction, isPending] = useActionState(createPageAction, { error: null });

  return (
    <div>
      <AdminNav />
      <div className="animate-in">
        <h1 className="mb-6 text-2xl font-bold text-neutral-900">{t("createPage")}</h1>
        <Card className="max-w-xl">
          <CardContent className="pt-6">
            <form action={formAction} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="slug" className="text-sm font-medium text-neutral-700">Slug</label>
                <Input id="slug" name="slug" placeholder="about-us" required pattern="[a-z0-9-]+" />
              </div>
              <div className="space-y-2">
                <label htmlFor="titleTg" className="text-sm font-medium text-neutral-700">Сарлавҳа (тҷ)</label>
                <Input id="titleTg" name="titleTg" required />
              </div>
              <div className="space-y-2">
                <label htmlFor="titleRu" className="text-sm font-medium text-neutral-700">Заголовок (ру)</label>
                <Input id="titleRu" name="titleRu" />
              </div>
              {state.error && (
                <div className="animate-in rounded-lg bg-red-50 p-3 text-sm text-error-600">{state.error}</div>
              )}
              <Button type="submit" loading={isPending}>{t("createPage")}</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create content block editor actions**

Create `src/app/(dashboard)/admin/content/[pageId]/actions.ts`:

```typescript
"use server";

import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const blockSchema = z.object({
  section: z.string().min(1).max(50),
  type: z.enum(["text", "image", "html", "banner", "gallery"]),
  titleTg: z.string().optional(),
  titleRu: z.string().optional(),
  bodyTg: z.string().optional(),
  bodyRu: z.string().optional(),
  imageUrl: z.string().optional(),
  linkUrl: z.string().optional(),
});

export async function addBlockAction(
  pageId: string,
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const user = await requireAdmin();

  const parsed = blockSchema.safeParse({
    section: formData.get("section"),
    type: formData.get("type"),
    titleTg: formData.get("titleTg") || undefined,
    titleRu: formData.get("titleRu") || undefined,
    bodyTg: formData.get("bodyTg") || undefined,
    bodyRu: formData.get("bodyRu") || undefined,
    imageUrl: formData.get("imageUrl") || undefined,
    linkUrl: formData.get("linkUrl") || undefined,
  });

  if (!parsed.success) return { error: "invalidData" };

  const supabase = await createServerClient();

  const { count } = await supabase
    .from("content_blocks" as never)
    .select("id" as never, { count: "exact", head: true })
    .eq("page_id" as never, pageId);

  const { error } = await supabase
    .from("content_blocks" as never)
    .insert({
      school_id: user.schoolId,
      page_id: pageId,
      section: parsed.data.section,
      type: parsed.data.type,
      title_tg: parsed.data.titleTg ?? null,
      title_ru: parsed.data.titleRu ?? null,
      body_tg: parsed.data.bodyTg ?? null,
      body_ru: parsed.data.bodyRu ?? null,
      image_url: parsed.data.imageUrl ?? null,
      link_url: parsed.data.linkUrl ?? null,
      sort_order: (count ?? 0) + 1,
    } as never);

  if (error) return { error: "saveFailed" };

  revalidatePath(`/admin/content/${pageId}`);
  return { error: null };
}

export async function updateBlockAction(
  blockId: string,
  formData: FormData
): Promise<{ error: string | null }> {
  await requireAdmin();

  const parsed = blockSchema.safeParse({
    section: formData.get("section"),
    type: formData.get("type"),
    titleTg: formData.get("titleTg") || undefined,
    titleRu: formData.get("titleRu") || undefined,
    bodyTg: formData.get("bodyTg") || undefined,
    bodyRu: formData.get("bodyRu") || undefined,
    imageUrl: formData.get("imageUrl") || undefined,
    linkUrl: formData.get("linkUrl") || undefined,
  });

  if (!parsed.success) return { error: "invalidData" };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("content_blocks" as never)
    .update({
      section: parsed.data.section,
      type: parsed.data.type,
      title_tg: parsed.data.titleTg ?? null,
      title_ru: parsed.data.titleRu ?? null,
      body_tg: parsed.data.bodyTg ?? null,
      body_ru: parsed.data.bodyRu ?? null,
      image_url: parsed.data.imageUrl ?? null,
      link_url: parsed.data.linkUrl ?? null,
    } as never)
    .eq("id" as never, blockId);

  if (error) return { error: "saveFailed" };

  return { error: null };
}

export async function deleteBlockAction(pageId: string, blockId: string) {
  await requireAdmin();

  const supabase = await createServerClient();
  await supabase
    .from("content_blocks" as never)
    .delete()
    .eq("id" as never, blockId);

  revalidatePath(`/admin/content/${pageId}`);
}

export async function toggleBlockVisibilityAction(pageId: string, blockId: string, visible: boolean) {
  await requireAdmin();

  const supabase = await createServerClient();
  await supabase
    .from("content_blocks" as never)
    .update({ is_visible: visible } as never)
    .eq("id" as never, blockId);

  revalidatePath(`/admin/content/${pageId}`);
}

export async function reorderBlocksAction(pageId: string, orderedIds: string[]) {
  await requireAdmin();

  const supabase = await createServerClient();

  for (let i = 0; i < orderedIds.length; i++) {
    await supabase
      .from("content_blocks" as never)
      .update({ sort_order: i + 1 } as never)
      .eq("id" as never, orderedIds[i]);
  }

  revalidatePath(`/admin/content/${pageId}`);
}
```

- [ ] **Step 6: Create content block editor component**

Create `src/app/(dashboard)/admin/content/[pageId]/content-editor.tsx`:

```tsx
"use client";

import { useState, useActionState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { addBlockAction, deleteBlockAction, toggleBlockVisibilityAction, reorderBlocksAction } from "./actions";
import { Plus, Trash2, Eye, EyeOff, GripVertical, FileText } from "lucide-react";

interface ContentBlock {
  id: string;
  section: string;
  type: string;
  titleTg: string | null;
  bodyTg: string | null;
  imageUrl: string | null;
  isVisible: boolean;
  sortOrder: number;
}

interface ContentEditorProps {
  pageId: string;
  pageTitleTg: string;
  blocks: ContentBlock[];
}

export function ContentEditor({ pageId, pageTitleTg, blocks }: ContentEditorProps) {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const [showAddForm, setShowAddForm] = useState(false);

  const boundAddAction = addBlockAction.bind(null, pageId);
  const [addState, addFormAction, isAdding] = useActionState(boundAddAction, { error: null });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-800">{pageTitleTg}</h2>
        <Button onClick={() => setShowAddForm(!showAddForm)} variant={showAddForm ? "outline" : "default"}>
          <Plus className="mr-2 h-4 w-4" />
          {t("addBlock")}
        </Button>
      </div>

      {showAddForm && (
        <Card className="animate-in border-primary-200">
          <CardContent className="pt-6">
            <form action={async (fd) => {
              await addFormAction(fd);
              setShowAddForm(false);
            }} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-700">{t("section")}</label>
                  <Input name="section" placeholder="hero, about, info" required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-700">{t("blockType")}</label>
                  <select name="type" className="flex h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm" required>
                    <option value="text">Text</option>
                    <option value="image">Image</option>
                    <option value="html">HTML</option>
                    <option value="banner">Banner</option>
                    <option value="gallery">Gallery</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700">Title (тҷ)</label>
                <Input name="titleTg" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700">Body (тҷ)</label>
                <textarea name="bodyTg" rows={4} className="flex w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700">Image URL</label>
                <Input name="imageUrl" />
              </div>
              {addState.error && (
                <div className="animate-in rounded-lg bg-red-50 p-3 text-sm text-error-600">{addState.error}</div>
              )}
              <Button type="submit" loading={isAdding}>{tCommon("save")}</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {blocks.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-12 w-12" />}
          title={tCommon("noData")}
          action={{ label: t("addBlock"), onClick: () => setShowAddForm(true) }}
        />
      ) : (
        <div className="space-y-3">
          {blocks.map((block) => (
            <Card key={block.id} className={!block.isVisible ? "opacity-50" : ""}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <GripVertical className="h-5 w-5 cursor-grab text-neutral-300" />
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{block.type}</Badge>
                      <Badge variant="outline">{block.section}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-neutral-600">
                      {block.titleTg ?? block.bodyTg?.slice(0, 60) ?? "(empty)"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <form action={async () => {
                    "use server";
                    await toggleBlockVisibilityAction(pageId, block.id, !block.isVisible);
                  }}>
                    <Button type="submit" variant="ghost" size="icon">
                      {block.isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </Button>
                  </form>
                  <form action={async () => {
                    "use server";
                    await deleteBlockAction(pageId, block.id);
                  }}>
                    <Button type="submit" variant="ghost" size="icon" className="text-error-500">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Create page editor page**

Create `src/app/(dashboard)/admin/content/[pageId]/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { AdminNav } from "../../admin-nav";
import { ContentEditor } from "./content-editor";
import { notFound } from "next/navigation";

async function getPageWithBlocks(pageId: string) {
  const supabase = await createServerClient();

  const { data: page } = await supabase
    .from("pages" as never)
    .select("id, slug, title_tg, title_ru, is_published" as never)
    .eq("id" as never, pageId)
    .single();

  if (!page) return null;

  const { data: blocks } = await supabase
    .from("content_blocks" as never)
    .select("id, section, type, title_tg, body_tg, image_url, is_visible, sort_order" as never)
    .eq("page_id" as never, pageId)
    .order("sort_order" as never, { ascending: true });

  const pageRow = page as Record<string, unknown>;
  return {
    page: {
      id: pageRow.id as string,
      slug: pageRow.slug as string,
      titleTg: pageRow.title_tg as string,
      titleRu: (pageRow.title_ru as string) ?? null,
      isPublished: pageRow.is_published as boolean,
    },
    blocks: ((blocks ?? []) as Array<Record<string, unknown>>).map((b) => ({
      id: b.id as string,
      section: b.section as string,
      type: b.type as string,
      titleTg: (b.title_tg as string) ?? null,
      bodyTg: (b.body_tg as string) ?? null,
      imageUrl: (b.image_url as string) ?? null,
      isVisible: b.is_visible as boolean,
      sortOrder: b.sort_order as number,
    })),
  };
}

export default async function PageEditorPage({
  params,
}: {
  params: Promise<{ pageId: string }>;
}) {
  await requireAdmin();
  const { pageId } = await params;
  const data = await getPageWithBlocks(pageId);

  if (!data) notFound();

  return (
    <div>
      <AdminNav />
      <div className="animate-in">
        <ContentEditor
          pageId={data.page.id}
          pageTitleTg={data.page.titleTg}
          blocks={data.blocks}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Add CMS i18n keys**

Add to `src/i18n/tg.json` under `"admin"`:

```json
"createPage": "Эҷоди саҳифа",
"noPagesYet": "Ҳоло саҳифае нест",
"published": "Нашршуда",
"draft": "Пешнавис",
"addBlock": "Илова кардани блок",
"section": "Бахш",
"blockType": "Навъи блок"
```

Add corresponding to `src/i18n/ru.json` under `"admin"`:

```json
"createPage": "Создать страницу",
"noPagesYet": "Пока нет страниц",
"published": "Опубликовано",
"draft": "Черновик",
"addBlock": "Добавить блок",
"section": "Секция",
"blockType": "Тип блока"
```

- [ ] **Step 9: Verify and commit**

```bash
npx tsc --noEmit
npm run build
git add src/app/(dashboard)/admin/content/ src/i18n/
git commit -m "feat: add CMS with pages and content blocks management"
```

---

### Task 6: Audit Log Viewer

**Files:**
- Create: `src/app/(dashboard)/admin/audit/page.tsx`
- Create: `src/app/(dashboard)/admin/audit/audit-table.tsx`

**Interfaces:**
- Consumes: `requireAdmin()`, `hasPermission()` from `src/lib/permissions/check`, `AdminNav`, `createServerClient()`, UI components
- Produces: Audit log viewer at `/admin/audit` with server-side permission check (`audit_logs.read`)

- [ ] **Step 1: Create audit table component**

Create `src/app/(dashboard)/admin/audit/audit-table.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollText } from "lucide-react";

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  userPublicId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  createdAt: string;
}

const actionColors: Record<string, string> = {
  create: "bg-success-500/10 text-success-600",
  update: "bg-info-500/10 text-info-600",
  delete: "bg-error-500/10 text-error-600",
  login: "bg-primary-500/10 text-primary-600",
  logout: "bg-neutral-500/10 text-neutral-600",
  enable: "bg-success-500/10 text-success-600",
  disable: "bg-warning-500/10 text-warning-600",
  assign: "bg-primary-500/10 text-primary-600",
  revoke: "bg-error-500/10 text-error-600",
};

export function AuditTable({ entries }: { entries: AuditEntry[] }) {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<ScrollText className="h-12 w-12" />}
        title={tCommon("noData")}
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50">
            <th className="px-4 py-3 text-left font-medium text-neutral-600">User</th>
            <th className="px-4 py-3 text-left font-medium text-neutral-600">Action</th>
            <th className="px-4 py-3 text-left font-medium text-neutral-600">Entity</th>
            <th className="px-4 py-3 text-left font-medium text-neutral-600">Date</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b border-neutral-100 transition-colors duration-[var(--duration-fast)] hover:bg-neutral-50">
              <td className="px-4 py-3 font-mono text-xs text-neutral-600">
                {entry.userPublicId ?? "system"}
              </td>
              <td className="px-4 py-3">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${actionColors[entry.action] ?? ""}`}>
                  {entry.action}
                </span>
              </td>
              <td className="px-4 py-3 text-neutral-700">
                {entry.entityType}
                {entry.entityId && (
                  <span className="ml-1 text-xs text-neutral-400">{entry.entityId.slice(0, 8)}</span>
                )}
              </td>
              <td className="px-4 py-3 text-neutral-500">
                {new Date(entry.createdAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Create audit log page with permission enforcement**

Create `src/app/(dashboard)/admin/audit/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/guard";
import { hasPermission } from "@/lib/permissions/check";
import { createServerClient } from "@/lib/supabase/server";
import { AdminNav } from "../admin-nav";
import { AuditTable } from "./audit-table";
import { ErrorState } from "@/components/ui/error-state";
import { redirect } from "next/navigation";

async function getAuditEntries() {
  const supabase = await createServerClient();

  const { data } = await supabase
    .from("audit_logs" as never)
    .select("id, action, entity_type, entity_id, user_public_id, old_values, new_values, created_at" as never)
    .order("created_at" as never, { ascending: false })
    .limit(100);

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    action: row.action as string,
    entityType: row.entity_type as string,
    entityId: (row.entity_id as string) ?? null,
    userPublicId: (row.user_public_id as string) ?? null,
    oldValues: (row.old_values as Record<string, unknown>) ?? null,
    newValues: (row.new_values as Record<string, unknown>) ?? null,
    createdAt: row.created_at as string,
  }));
}

export default async function AuditLogPage() {
  await requireAdmin();
  const t = await getTranslations();
  const tErrors = await getTranslations("errors");

  const canView = await hasPermission("audit_logs.read");
  if (!canView) {
    return (
      <div>
        <AdminNav />
        <ErrorState
          title={tErrors("forbidden")}
          description={tErrors("forbiddenDescription")}
          actions={[{ label: tErrors("goBack"), onClick: () => {} }]}
        />
      </div>
    );
  }

  const entries = await getAuditEntries();
  const tAdmin = await getTranslations("admin");

  return (
    <div>
      <AdminNav />
      <div className="animate-in">
        <h1 className="mb-6 text-2xl font-bold text-neutral-900">{tAdmin("auditLog")}</h1>
        <AuditTable entries={entries} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit
npm run build
git add src/app/(dashboard)/admin/audit/
git commit -m "feat: add audit log viewer with permission-based access control"
```

---

### Task 7: Admin User Management

**Files:**
- Create: `src/app/(dashboard)/admin/users/page.tsx`
- Create: `src/app/(dashboard)/admin/users/users-table.tsx`
- Create: `src/app/(dashboard)/admin/users/actions.ts`
- Create: `src/app/(dashboard)/admin/users/[userId]/page.tsx`
- Create: `src/app/(dashboard)/admin/users/[userId]/user-detail.tsx`
- Create: `src/app/(dashboard)/admin/users/[userId]/actions.ts`

**Interfaces:**
- Consumes: `requireAdmin()`, `AdminNav`, `createServerClient()`, `createAdminClient()`, all UI components, i18n
- Produces: User management at `/admin/users` with list, search, activate/deactivate, role assignment. Server actions enforce admin role + RLS.

- [ ] **Step 1: Create user list server actions**

Create `src/app/(dashboard)/admin/users/actions.ts`:

```typescript
"use server";

import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function toggleUserActiveAction(userId: string, active: boolean) {
  await requireAdmin();

  const supabase = await createServerClient();
  await supabase
    .from("users" as never)
    .update({ is_active: active } as never)
    .eq("id" as never, userId);

  revalidatePath("/admin/users");
}
```

- [ ] **Step 2: Create users table component**

Create `src/app/(dashboard)/admin/users/users-table.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { toggleUserActiveAction } from "./actions";
import Link from "next/link";
import { Users, Eye } from "lucide-react";

interface UserRow {
  id: string;
  publicId: string;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
  roles: string[];
}

export function UsersTable({ users }: { users: UserRow[] }) {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");

  if (users.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-12 w-12" />}
        title={tCommon("noData")}
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50">
            <th className="px-4 py-3 text-left font-medium text-neutral-600">ID</th>
            <th className="px-4 py-3 text-left font-medium text-neutral-600">{t("userDetails")}</th>
            <th className="px-4 py-3 text-left font-medium text-neutral-600">{t("roles")}</th>
            <th className="px-4 py-3 text-left font-medium text-neutral-600">{t("userStatus")}</th>
            <th className="px-4 py-3 text-right font-medium text-neutral-600"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b border-neutral-100 transition-colors duration-[var(--duration-fast)] hover:bg-neutral-50">
              <td className="px-4 py-3 font-mono text-xs text-neutral-500">{user.publicId}</td>
              <td className="px-4 py-3">
                <p className="font-medium text-neutral-800">{user.firstName} {user.lastName}</p>
                <p className="text-xs text-neutral-500">{user.email}</p>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {user.roles.map((role) => (
                    <Badge key={role} variant="secondary">{role}</Badge>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3">
                <Badge variant={user.isActive ? "default" : "destructive"}>
                  {user.isActive ? t("activate") : t("deactivate")}
                </Badge>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <form action={async () => {
                    "use server";
                    await toggleUserActiveAction(user.id, !user.isActive);
                  }}>
                    <Button type="submit" variant="ghost" size="sm">
                      {user.isActive ? t("deactivate") : t("activate")}
                    </Button>
                  </form>
                  <Link href={`/admin/users/${user.id}`}>
                    <Button variant="ghost" size="icon"><Eye className="h-4 w-4" /></Button>
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Create users list page**

Create `src/app/(dashboard)/admin/users/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { AdminNav } from "../admin-nav";
import { UsersTable } from "./users-table";

async function getUsers() {
  const supabase = await createServerClient();

  const { data: users } = await supabase
    .from("users" as never)
    .select("id, public_id, first_name, last_name, email, is_active" as never)
    .order("created_at" as never, { ascending: false });

  const usersArr = (users ?? []) as Array<Record<string, unknown>>;

  const withRoles = await Promise.all(
    usersArr.map(async (user) => {
      const { data: roles } = await supabase
        .from("user_roles" as never)
        .select("roles:role_id(name_tg)" as never)
        .eq("user_id" as never, user.id);

      const roleNames = ((roles ?? []) as Array<Record<string, unknown>>).map((r) => {
        const role = r.roles as Record<string, unknown>;
        return role.name_tg as string;
      });

      return {
        id: user.id as string,
        publicId: user.public_id as string,
        firstName: user.first_name as string,
        lastName: user.last_name as string,
        email: user.email as string,
        isActive: user.is_active as boolean,
        roles: roleNames,
      };
    })
  );

  return withRoles;
}

export default async function UsersPage() {
  await requireAdmin();
  const t = await getTranslations("admin");
  const users = await getUsers();

  return (
    <div>
      <AdminNav />
      <div className="animate-in">
        <h1 className="mb-6 text-2xl font-bold text-neutral-900">{t("users")}</h1>
        <UsersTable users={users} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create user detail server actions**

Create `src/app/(dashboard)/admin/users/[userId]/actions.ts`:

```typescript
"use server";

import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const assignRoleSchema = z.object({
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
});

export async function assignRoleAction(
  _prevState: { error: string | null; success: boolean },
  formData: FormData
): Promise<{ error: string | null; success: boolean }> {
  const admin = await requireAdmin();

  const parsed = assignRoleSchema.safeParse({
    userId: formData.get("userId"),
    roleId: formData.get("roleId"),
  });

  if (!parsed.success) return { error: "invalidData", success: false };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("user_roles" as never)
    .insert({
      user_id: parsed.data.userId,
      role_id: parsed.data.roleId,
      school_id: admin.schoolId,
      assigned_by: admin.id,
    } as never);

  if (error) {
    if (error.code === "23505") return { error: "alreadyAssigned", success: false };
    return { error: "saveFailed", success: false };
  }

  revalidatePath(`/admin/users/${parsed.data.userId}`);
  return { error: null, success: true };
}

export async function removeRoleAction(userId: string, roleId: string) {
  await requireAdmin();

  const supabase = await createServerClient();
  await supabase
    .from("user_roles" as never)
    .delete()
    .eq("user_id" as never, userId)
    .eq("role_id" as never, roleId);

  revalidatePath(`/admin/users/${userId}`);
}
```

- [ ] **Step 5: Create user detail component**

Create `src/app/(dashboard)/admin/users/[userId]/user-detail.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { assignRoleAction, removeRoleAction } from "./actions";
import { Trash2 } from "lucide-react";

interface UserDetailData {
  id: string;
  publicId: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  email: string;
  phone: string | null;
  isActive: boolean;
  avatarUrl: string | null;
  assignedRoles: Array<{ id: string; slug: string; nameTg: string; isSystem: boolean }>;
}

interface AvailableRole {
  id: string;
  slug: string;
  nameTg: string;
}

export function UserDetail({ user, availableRoles }: { user: UserDetailData; availableRoles: AvailableRole[] }) {
  const t = useTranslations("admin");
  const [assignState, assignAction, isAssigning] = useActionState(assignRoleAction, { error: null, success: false });

  const unassignedRoles = availableRoles.filter(
    (r) => !user.assignedRoles.some((ar) => ar.id === r.id)
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* User info */}
      <Card>
        <CardHeader>
          <CardTitle>{t("userDetails")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar src={user.avatarUrl} fallback={`${user.firstName[0]}${user.lastName[0]}`} size="lg" />
            <div>
              <p className="text-lg font-semibold text-neutral-900">
                {user.firstName} {user.lastName} {user.middleName ?? ""}
              </p>
              <p className="font-mono text-sm text-neutral-500">{user.publicId}</p>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-neutral-500">Email</span><span>{user.email}</span></div>
            {user.phone && <div className="flex justify-between"><span className="text-neutral-500">Phone</span><span>{user.phone}</span></div>}
            <div className="flex justify-between">
              <span className="text-neutral-500">{t("userStatus")}</span>
              <Badge variant={user.isActive ? "default" : "destructive"}>
                {user.isActive ? t("activate") : t("deactivate")}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Roles */}
      <Card>
        <CardHeader>
          <CardTitle>{t("roles")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {user.assignedRoles.map((role) => (
              <div key={role.id} className="flex items-center justify-between rounded-lg border border-neutral-200 p-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{role.nameTg}</span>
                  {role.isSystem && <Badge variant="secondary">{t("systemRole")}</Badge>}
                </div>
                {!role.isSystem && (
                  <form action={async () => {
                    "use server";
                    await removeRoleAction(user.id, role.id);
                  }}>
                    <Button type="submit" variant="ghost" size="icon" className="text-error-500">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </form>
                )}
              </div>
            ))}
          </div>

          {unassignedRoles.length > 0 && (
            <form action={assignAction} className="flex items-end gap-3">
              <input type="hidden" name="userId" value={user.id} />
              <div className="flex-1 space-y-1">
                <label className="text-sm font-medium text-neutral-700">{t("assignRole")}</label>
                <select name="roleId" className="flex h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm" required>
                  {unassignedRoles.map((r) => (
                    <option key={r.id} value={r.id}>{r.nameTg}</option>
                  ))}
                </select>
              </div>
              <Button type="submit" loading={isAssigning}>{t("assignRole")}</Button>
            </form>
          )}
          {assignState.error && (
            <div className="animate-in rounded-lg bg-red-50 p-3 text-sm text-error-600">{assignState.error}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 6: Create user detail page**

Create `src/app/(dashboard)/admin/users/[userId]/page.tsx`:

```tsx
import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { AdminNav } from "../../admin-nav";
import { UserDetail } from "./user-detail";
import { notFound } from "next/navigation";

async function getUserDetail(userId: string) {
  const supabase = await createServerClient();

  const { data: user } = await supabase
    .from("users" as never)
    .select("id, public_id, first_name, last_name, middle_name, email, phone, is_active, avatar_url" as never)
    .eq("id" as never, userId)
    .single();

  if (!user) return null;

  const { data: userRoles } = await supabase
    .from("user_roles" as never)
    .select("roles:role_id(id, slug, name_tg, is_system)" as never)
    .eq("user_id" as never, userId);

  const { data: allRoles } = await supabase
    .from("roles" as never)
    .select("id, slug, name_tg" as never)
    .order("level" as never, { ascending: true });

  const row = user as Record<string, unknown>;
  return {
    user: {
      id: row.id as string,
      publicId: row.public_id as string,
      firstName: row.first_name as string,
      lastName: row.last_name as string,
      middleName: (row.middle_name as string) ?? null,
      email: row.email as string,
      phone: (row.phone as string) ?? null,
      isActive: row.is_active as boolean,
      avatarUrl: (row.avatar_url as string) ?? null,
      assignedRoles: ((userRoles ?? []) as Array<Record<string, unknown>>).map((ur) => {
        const r = ur.roles as Record<string, unknown>;
        return {
          id: r.id as string,
          slug: r.slug as string,
          nameTg: r.name_tg as string,
          isSystem: r.is_system as boolean,
        };
      }),
    },
    availableRoles: ((allRoles ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      slug: r.slug as string,
      nameTg: r.name_tg as string,
    })),
  };
}

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  await requireAdmin();
  const { userId } = await params;
  const data = await getUserDetail(userId);

  if (!data) notFound();

  return (
    <div>
      <AdminNav />
      <div className="animate-in">
        <UserDetail user={data.user} availableRoles={data.availableRoles} />
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Verify and commit**

```bash
npx tsc --noEmit
npm run build
git add src/app/(dashboard)/admin/users/
git commit -m "feat: add user management with role assignment and activate/deactivate"
```

---

### Task 8: Roles & Permissions Matrix

**Files:**
- Create: `src/app/(dashboard)/admin/roles/page.tsx`
- Create: `src/app/(dashboard)/admin/roles/permissions-matrix.tsx`
- Create: `src/app/(dashboard)/admin/roles/actions.ts`

**Interfaces:**
- Consumes: `requireAdmin()`, `AdminNav`, `createServerClient()`, UI components
- Produces: Permissions matrix at `/admin/roles` showing all roles × permissions with toggle capability, respecting system role protections

- [ ] **Step 1: Create permissions matrix actions**

Create `src/app/(dashboard)/admin/roles/actions.ts`:

```typescript
"use server";

import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function togglePermissionAction(roleId: string, permissionId: string, assign: boolean) {
  await requireAdmin();

  const supabase = await createServerClient();

  if (assign) {
    await supabase
      .from("role_permissions" as never)
      .insert({ role_id: roleId, permission_id: permissionId } as never);
  } else {
    await supabase
      .from("role_permissions" as never)
      .delete()
      .eq("role_id" as never, roleId)
      .eq("permission_id" as never, permissionId);
  }

  revalidatePath("/admin/roles");
}
```

- [ ] **Step 2: Create permissions matrix component**

Create `src/app/(dashboard)/admin/roles/permissions-matrix.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { togglePermissionAction } from "./actions";
import { cn } from "@/lib/utils";

interface Role {
  id: string;
  slug: string;
  nameTg: string;
  isSystem: boolean;
}

interface Permission {
  id: string;
  slug: string;
  module: string;
  action: string;
  nameTg: string;
}

interface RolePermission {
  roleId: string;
  permissionId: string;
}

interface PermissionsMatrixProps {
  roles: Role[];
  permissions: Permission[];
  rolePermissions: RolePermission[];
}

export function PermissionsMatrix({ roles, permissions, rolePermissions }: PermissionsMatrixProps) {
  const t = useTranslations("admin");

  const modules = Array.from(new Set(permissions.map((p) => p.module)));

  const hasPermission = (roleId: string, permId: string) =>
    rolePermissions.some((rp) => rp.roleId === roleId && rp.permissionId === permId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("permissionsMatrix")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200">
                <th className="py-3 pr-4 text-left font-medium text-neutral-600">Permission</th>
                {roles.map((role) => (
                  <th key={role.id} className="px-2 py-3 text-center font-medium text-neutral-600">
                    <div>{role.nameTg}</div>
                    {role.isSystem && <Badge variant="secondary" className="mt-1 text-[10px]">{t("systemRole")}</Badge>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modules.map((mod) => (
                <>
                  <tr key={`header-${mod}`}>
                    <td colSpan={roles.length + 1} className="bg-neutral-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      {mod}
                    </td>
                  </tr>
                  {permissions
                    .filter((p) => p.module === mod)
                    .map((perm) => (
                      <tr key={perm.id} className="border-b border-neutral-100">
                        <td className="py-2 pr-4 text-neutral-700">{perm.nameTg}</td>
                        {roles.map((role) => {
                          const checked = hasPermission(role.id, perm.id);
                          return (
                            <td key={role.id} className="px-2 py-2 text-center">
                              <form action={async () => {
                                "use server";
                                await togglePermissionAction(role.id, perm.id, !checked);
                              }}>
                                <button
                                  type="submit"
                                  className={cn(
                                    "h-5 w-5 rounded border transition-all duration-[var(--duration-fast)]",
                                    checked
                                      ? "border-primary-500 bg-primary-500"
                                      : "border-neutral-300 bg-white hover:border-neutral-400"
                                  )}
                                >
                                  {checked && (
                                    <svg className="h-3 w-3 mx-auto text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                    </svg>
                                  )}
                                </button>
                              </form>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Create roles page**

Create `src/app/(dashboard)/admin/roles/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { AdminNav } from "../admin-nav";
import { PermissionsMatrix } from "./permissions-matrix";

async function getRolesAndPermissions() {
  const supabase = await createServerClient();

  const [rolesRes, permsRes, rpRes] = await Promise.all([
    supabase.from("roles" as never).select("id, slug, name_tg, is_system" as never).order("level" as never),
    supabase.from("permissions" as never).select("id, slug, module, action, name_tg" as never).order("module" as never),
    supabase.from("role_permissions" as never).select("role_id, permission_id" as never),
  ]);

  return {
    roles: ((rolesRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string, slug: r.slug as string, nameTg: r.name_tg as string, isSystem: r.is_system as boolean,
    })),
    permissions: ((permsRes.data ?? []) as Array<Record<string, unknown>>).map((p) => ({
      id: p.id as string, slug: p.slug as string, module: p.module as string, action: p.action as string, nameTg: p.name_tg as string,
    })),
    rolePermissions: ((rpRes.data ?? []) as Array<Record<string, unknown>>).map((rp) => ({
      roleId: rp.role_id as string, permissionId: rp.permission_id as string,
    })),
  };
}

export default async function RolesPage() {
  await requireAdmin();
  const t = await getTranslations("admin");
  const data = await getRolesAndPermissions();

  return (
    <div>
      <AdminNav />
      <div className="animate-in">
        <h1 className="mb-6 text-2xl font-bold text-neutral-900">{t("permissionsMatrix")}</h1>
        <PermissionsMatrix {...data} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit
npm run build
git add src/app/(dashboard)/admin/roles/
git commit -m "feat: add roles and permissions matrix with toggle controls"
```

---

### Task 9: Notification Settings Admin Page

**Files:**
- Create: `src/app/(dashboard)/admin/notifications/page.tsx`
- Create: `src/app/(dashboard)/admin/notifications/notification-settings.tsx`
- Create: `src/app/(dashboard)/admin/notifications/actions.ts`

**Interfaces:**
- Consumes: `requireAdmin()`, `hasPermission("notifications.manage")`, `AdminNav`, `createServerClient()`, UI components
- Produces: Notification settings at `/admin/notifications` with type enable/disable, server-side permission enforcement

- [ ] **Step 1: Create notification settings actions**

Create `src/app/(dashboard)/admin/notifications/actions.ts`:

```typescript
"use server";

import { requireAdmin } from "@/lib/admin/guard";
import { hasPermission } from "@/lib/permissions/check";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function toggleNotificationTypeAction(settingId: string, enabled: boolean) {
  await requireAdmin();

  const permitted = await hasPermission("notifications.manage");
  if (!permitted) {
    throw new Error("Forbidden");
  }

  const supabase = await createServerClient();
  await supabase
    .from("notification_settings" as never)
    .update({ is_enabled: enabled } as never)
    .eq("id" as never, settingId);

  revalidatePath("/admin/notifications");
}
```

- [ ] **Step 2: Create notification settings component**

Create `src/app/(dashboard)/admin/notifications/notification-settings.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toggleNotificationTypeAction } from "./actions";
import { Bell } from "lucide-react";

interface NotifSetting {
  id: string;
  type: string;
  isEnabled: boolean;
}

export function NotificationSettings({ settings }: { settings: NotifSetting[] }) {
  const t = useTranslations("admin");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("notifications")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {settings.map((setting) => (
            <div key={setting.id} className="flex items-center justify-between rounded-lg border border-neutral-200 p-4 transition-colors duration-[var(--duration-fast)] hover:bg-neutral-50">
              <div className="flex items-center gap-3">
                <Bell className="h-5 w-5 text-neutral-400" />
                <span className="font-medium text-neutral-800">{setting.type}</span>
              </div>
              <form action={async () => {
                "use server";
                await toggleNotificationTypeAction(setting.id, !setting.isEnabled);
              }}>
                <Button
                  type="submit"
                  variant={setting.isEnabled ? "outline" : "default"}
                  size="sm"
                >
                  {setting.isEnabled ? t("disableModule") : t("enableModule")}
                </Button>
              </form>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Create notification settings page**

Create `src/app/(dashboard)/admin/notifications/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/guard";
import { hasPermission } from "@/lib/permissions/check";
import { createServerClient } from "@/lib/supabase/server";
import { AdminNav } from "../admin-nav";
import { NotificationSettings } from "./notification-settings";
import { ErrorState } from "@/components/ui/error-state";

export default async function NotificationsPage() {
  await requireAdmin();
  const t = await getTranslations("admin");
  const tErrors = await getTranslations("errors");

  const canManage = await hasPermission("notifications.manage");
  if (!canManage) {
    return (
      <div>
        <AdminNav />
        <ErrorState
          title={tErrors("forbidden")}
          description={tErrors("forbiddenDescription")}
        />
      </div>
    );
  }

  const supabase = await createServerClient();
  const { data } = await supabase
    .from("notification_settings" as never)
    .select("id, type, is_enabled" as never)
    .order("type" as never);

  const settings = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    type: row.type as string,
    isEnabled: row.is_enabled as boolean,
  }));

  return (
    <div>
      <AdminNav />
      <div className="animate-in">
        <h1 className="mb-6 text-2xl font-bold text-neutral-900">{t("notifications")}</h1>
        <NotificationSettings settings={settings} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit
npm run build
git add src/app/(dashboard)/admin/notifications/
git commit -m "feat: add notification settings admin page with permission enforcement"
```

---

### Task 10: Build Verification and Visual Testing

**Files:** None new — verification only.

**Interfaces:** Verifies all Phase 2 tasks integrate correctly.

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

- [ ] **Step 4: Verify all admin routes render**

Run `npm run dev` and navigate to:
- `/admin` — dashboard with stats
- `/admin/modules` — module management with role visibility
- `/admin/school` — school settings form
- `/admin/content` — CMS pages list
- `/admin/audit` — audit log table
- `/admin/users` — users table
- `/admin/roles` — permissions matrix
- `/admin/notifications` — notification settings

Verify each page renders with correct Tajik text, proper layout, animations.

- [ ] **Step 5: Verify admin guard blocks non-admin access**

Navigate to `/admin` without admin role — should redirect to `/dashboard?error=forbidden`.

- [ ] **Step 6: Verify server-driven navigation**

Check that sidebar navigation only shows modules enabled for the current user's role, not a hardcoded list.

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve Phase 2 build and type errors"
```
