# Phase 7: Registration, Pending Users, Enrollment History & Graduates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace invitation-code-only registration with an open registration flow (role selection → OTP → profile → pending queue), add admin approval/rejection, student enrollment history, graduate management, and comprehensive user lifecycle.

**Architecture:** New `registration_requests`, `student_enrollments`, and `user_status_history` tables extend the existing school-scoped schema. The registration form becomes a multi-step wizard with role selection. Middleware enforces pending-user redirection. Admin panel gains Pending Users and Graduates sections. All admin actions use `requireAdmin()`/`requireSuperAdmin()` guards and log to `audit_logs` + `user_status_history`.

**Tech Stack:** Next.js 16 App Router, Supabase (Auth OTP + PostgreSQL + Storage), TypeScript, Tailwind CSS, next-intl, Zod, Radix UI, Lucide React

## Global Constraints

- All UI strings go through next-intl (tg.json, ru.json, en.json) — no hardcoded text in components
- `school_id` is NEVER accepted from the client — always derived server-side (from `user.schoolId` in admin actions, from the default school in registration)
- `is_super_admin` can only be set by `service_role` (enforced by `trg_protect_super_admin` trigger)
- Admin-level roles (`level ≤ 1`) cannot be requested through registration (enforced by DB trigger + server validation + UI hiding)
- `service_role` key (`SUPABASE_SERVICE_ROLE_KEY`) is used only in `src/lib/supabase/admin.ts` and never imported in client components
- Use `"use server"` directive on all server action files
- Use `as never` type casts for Supabase queries (matches existing pattern since `database.ts` types are empty placeholders)
- Use `requireAdmin()` from `src/lib/admin/guard.ts` for admin pages; `requireSuperAdmin()` for super-admin-only operations
- Use `revalidatePath()` after mutations to refresh server component data
- Follow existing form pattern: `useActionState` + server actions (NOT react-hook-form)
- RLS policies use existing helper functions: `current_user_school_id()`, `current_user_is_admin()`, `current_user_has_permission()`
- Supabase Storage bucket `avatars` for profile photos
- The default school ID is `'00000000-0000-0000-0000-000000000001'` (seeded in `00012_seed.sql`)
- Roles are seeded with fixed UUIDs: admin=`00000000-0000-0000-0001-000000000001`, director=`..02`, vice_principal=`..03`, teacher=`..04`, student=`..05`
- **Super Admin User Management Center:** Super Admin (`is_super_admin = true`) has full control over every user. For each user, a detailed card shows: photo, full name, email, current role, status, class, academic year, registration date, approval date, enrollment date, and change history. Super Admin can: approve/reject requests, change role, change class, change academic year, assign/change homeroom teacher, block/unblock, graduate, and edit registration data.
- **Dangerous actions require confirmation dialogs:** Block, Reject, and Graduate actions must show a confirmation dialog before executing. The dialog must explain the consequence and require explicit user action to proceed.
- **All mutations via server actions with `requireSuperAdmin()` + RLS:** Role changes, class changes, status changes, and data edits are NEVER trusted from the client. Every mutation server action validates permissions, validates input data server-side, and logs to `audit_logs` + `user_status_history`.
- **Homeroom teacher assignment:** Classes have a `homeroom_teacher_id` FK to `users`. Super Admin can assign/change the homeroom teacher for any class. This is logged in `audit_logs`.

---

### Task 1: Database Migration — New Tables and Schema Changes

**Files:**
- Create: `supabase/migrations/00016_registration_and_enrollment.sql`

**Interfaces:**
- Consumes: Existing tables `schools`, `users`, `roles`, `classes`, `academic_years` (from migrations 00001-00015)
- Produces: Tables `registration_requests`, `student_enrollments`, `user_status_history`; columns `users.status`, `users.graduation_year`, `users.graduation_date`, `users.years_in_school`; trigger `trg_check_registration_role_level`; RLS policies for all new tables

- [ ] **Step 1: Create the migration file**

```sql
-- ============================================================
-- 00016: Registration Requests, Student Enrollments, User Status History
-- ============================================================

-- 1. Add status and graduation columns to users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending', 'approved', 'active', 'blocked', 'graduated', 'rejected'));

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS graduation_year INT,
  ADD COLUMN IF NOT EXISTS graduation_date DATE,
  ADD COLUMN IF NOT EXISTS years_in_school INT;

-- 2. Registration requests table
CREATE TABLE public.registration_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  auth_user_id UUID,
  email TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  middle_name TEXT,
  avatar_url TEXT,
  requested_role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  requested_class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  enrollment_year INT,
  additional_data JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_registration_requests_school_status
  ON public.registration_requests(school_id, status);
CREATE INDEX idx_registration_requests_email
  ON public.registration_requests(email);
CREATE INDEX idx_registration_requests_auth_user
  ON public.registration_requests(auth_user_id) WHERE auth_user_id IS NOT NULL;

-- 3. Prevent requesting admin-level roles in registration
CREATE OR REPLACE FUNCTION public.check_registration_role_level()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.roles WHERE id = NEW.requested_role_id AND level <= 1) THEN
    RAISE EXCEPTION 'Registration cannot request admin-level roles';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_registration_role_level
  BEFORE INSERT OR UPDATE ON public.registration_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.check_registration_role_level();

-- 4. Student enrollments table
CREATE TABLE public.student_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  enrolled_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT student_enrollments_unique UNIQUE (student_id, academic_year_id)
);

CREATE INDEX idx_student_enrollments_school ON public.student_enrollments(school_id);
CREATE INDEX idx_student_enrollments_student ON public.student_enrollments(student_id);
CREATE INDEX idx_student_enrollments_class ON public.student_enrollments(class_id);

-- 5. User status history table (immutable)
CREATE TABLE public.user_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL
    CHECK (action IN ('registered', 'approved', 'rejected', 'role_changed',
      'class_changed', 'graduated', 'blocked', 'unblocked', 'reactivated')),
  old_value TEXT,
  new_value TEXT,
  performed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_status_history_user ON public.user_status_history(user_id);
CREATE INDEX idx_user_status_history_school ON public.user_status_history(school_id);

-- Make user_status_history immutable (same pattern as audit_logs)
CREATE OR REPLACE FUNCTION public.prevent_status_history_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'user_status_history records are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_status_history_immutable
  BEFORE UPDATE OR DELETE ON public.user_status_history
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_status_history_mutation();

-- 6. RLS on registration_requests
ALTER TABLE public.registration_requests ENABLE ROW LEVEL SECURITY;

-- Service role (admin client) can do everything — used during registration
-- Authenticated users can read their own requests
CREATE POLICY registration_requests_self_read ON public.registration_requests
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- Admin can read all requests in their school
CREATE POLICY registration_requests_admin_read ON public.registration_requests
  FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin());

-- Admin can update requests in their school (approve/reject)
CREATE POLICY registration_requests_admin_update ON public.registration_requests
  FOR UPDATE TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (school_id = public.current_user_school_id() AND public.current_user_is_admin());

-- 7. RLS on student_enrollments
ALTER TABLE public.student_enrollments ENABLE ROW LEVEL SECURITY;

-- Students can read their own enrollments
CREATE POLICY student_enrollments_self_read ON public.student_enrollments
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

-- Admin can do everything in their school
CREATE POLICY student_enrollments_admin_all ON public.student_enrollments
  FOR ALL TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin())
  WITH CHECK (school_id = public.current_user_school_id() AND public.current_user_is_admin());

-- 8. RLS on user_status_history
ALTER TABLE public.user_status_history ENABLE ROW LEVEL SECURITY;

-- Users can read their own history
CREATE POLICY user_status_history_self_read ON public.user_status_history
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Admin can read all in their school
CREATE POLICY user_status_history_admin_read ON public.user_status_history
  FOR SELECT TO authenticated
  USING (school_id = public.current_user_school_id() AND public.current_user_is_admin());

-- Admin can insert history records
CREATE POLICY user_status_history_admin_insert ON public.user_status_history
  FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_user_school_id() AND public.current_user_is_admin());
```

- [ ] **Step 2: Verify migration syntax**

```bash
cd /Users/mehrovar/Desktop/maktabi-miyona-7
cat supabase/migrations/00016_registration_and_enrollment.sql | head -5
```

Expected: File exists and starts with the comment header.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00016_registration_and_enrollment.sql
git commit -m "feat: add registration_requests, student_enrollments, user_status_history tables

Add migration 00016 with:
- registration_requests table for pending user registrations
- student_enrollments table for academic year enrollment history
- user_status_history table (immutable) for lifecycle tracking
- users.status column (pending/approved/active/blocked/graduated/rejected)
- users.graduation_year, graduation_date, years_in_school columns
- Trigger preventing admin-level role requests in registration
- RLS policies for all new tables (school-scoped, admin-managed)"
```

---

### Task 2: i18n — Add All New Translation Keys

**Files:**
- Modify: `src/i18n/tg.json`
- Modify: `src/i18n/ru.json`
- Modify: `src/i18n/en.json`

**Interfaces:**
- Consumes: Existing i18n structure with top-level groups (`auth`, `admin`, `common`, etc.)
- Produces: New keys under `registration`, `pending`, `admin` (extended) namespaces, used by Tasks 3-9

- [ ] **Step 1: Add English translations**

Add these new keys to `src/i18n/en.json` — merge into the existing JSON structure:

In the `"auth"` section, add:
```json
"registerRoleStep": "Choose your role",
"registerProfileStep": "Complete your profile",
"selectRole": "Who are you?",
"selectClass": "Select your class",
"enrollmentYear": "Enrollment year",
"profilePhoto": "Profile photo",
"uploadPhoto": "Upload photo",
"changePhoto": "Change photo",
"photoHint": "JPG, PNG or WebP, max 2MB",
"registerSubmit": "Submit Registration",
"registrationPending": "Registration submitted",
"alreadyPending": "You already have a pending registration"
```

Add a new `"pending"` section:
```json
"pending": {
  "title": "Registration Submitted",
  "message": "Your registration request has been sent to the school administration.",
  "waitMessage": "Please wait for approval. You will be notified when your request is reviewed.",
  "logoutButton": "Sign Out",
  "statusPending": "Pending Review",
  "statusRejected": "Registration Rejected",
  "rejectedMessage": "Your registration was not approved.",
  "rejectionReason": "Reason"
}
```

In the `"admin"` section, add:
```json
"pendingUsers": "Pending Users",
"pendingUsersDesc": "Review and approve user registration requests",
"noPendingUsers": "No pending registration requests",
"noPendingUsersDesc": "New registrations will appear here for review",
"requestedRole": "Requested Role",
"requestedClass": "Requested Class",
"registrationDate": "Registration Date",
"approveUser": "Approve",
"rejectUser": "Reject",
"rejectionReason": "Rejection Reason",
"rejectionReasonPlaceholder": "Enter reason for rejection...",
"userApproved": "User approved",
"userRejected": "User rejected",
"changeRole": "Change Role",
"changeClass": "Change Class",
"transferClass": "Transfer Class",
"blockUser": "Block",
"unblockUser": "Unblock",
"graduateUser": "Graduate",
"markAsGraduated": "Mark as Graduated",
"graduates": "Graduates",
"graduatesList": "Graduates List",
"noGraduates": "No graduates yet",
"noGraduatesDesc": "Graduated students will appear here",
"graduationYear": "Graduation Year",
"graduationDate": "Graduation Date",
"yearsInSchool": "Years in School",
"enrollmentHistory": "Enrollment History",
"noEnrollments": "No enrollment history",
"addEnrollment": "Add Enrollment",
"enrollmentYear": "Enrollment Year",
"classHistory": "Class History",
"statusHistory": "Status History",
"allUsers": "All",
"pendingFilter": "Pending",
"activeFilter": "Active",
"studentsFilter": "Students",
"teachersFilter": "Teachers",
"directorsFilter": "Directors",
"vicePrincipalsFilter": "Vice Principals",
"adminsFilter": "Administrators",
"graduatesFilter": "Graduates",
"blockedFilter": "Blocked",
"rejectedFilter": "Rejected",
"userStatus_pending": "Pending",
"userStatus_approved": "Approved",
"userStatus_active": "Active",
"userStatus_blocked": "Blocked",
"userStatus_graduated": "Graduated",
"userStatus_rejected": "Rejected",
"confirmGraduate": "Are you sure you want to mark this student as graduated?",
"confirmBlock": "Are you sure you want to block this user?",
"confirmUnblock": "Are you sure you want to unblock this user?",
"editData": "Edit Data",
"editUserData": "Edit User Information",
"approvalDate": "Approval Date",
"enrollmentDate": "Enrollment Date",
"homeroomTeacher": "Homeroom Teacher",
"assignHomeroomTeacher": "Assign Homeroom Teacher",
"changeAcademicYear": "Change Academic Year",
"confirmReject": "Are you sure you want to reject this registration? This action requires a reason.",
"blockWarning": "They will lose access to the platform.",
"graduateWarning": "This changes their status permanently.",
"rejectWarning": "The user will not be able to access the platform.",
"savingChanges": "Saving...",
"changesSaved": "Changes saved"
```

- [ ] **Step 2: Add Tajik translations**

Add the same keys to `src/i18n/tg.json` with Tajik translations:

In `"auth"`:
```json
"registerRoleStep": "Навъи корбарро интихоб кунед",
"registerProfileStep": "Маълумоти шахсиро пур кунед",
"selectRole": "Шумо кистед?",
"selectClass": "Синфро интихоб кунед",
"enrollmentYear": "Соли қабул",
"profilePhoto": "Акси профил",
"uploadPhoto": "Акс боргузорӣ",
"changePhoto": "Акс иваз кардан",
"photoHint": "JPG, PNG ё WebP, то 2МБ",
"registerSubmit": "Фиристодани аризаи бақайдгирӣ",
"registrationPending": "Ариза фиристода шуд",
"alreadyPending": "Шумо аллакай ариза фиристодаед"
```

In `"pending"`:
```json
"pending": {
  "title": "Ариза фиристода шуд",
  "message": "Аризаи бақайдгирии шумо ба маъмурияти мактаб фиристода шуд.",
  "waitMessage": "Лутфан интизор шавед. Вақте ки аризаи шумо баррасӣ шавад, ба шумо хабар дода мешавад.",
  "logoutButton": "Баромадан",
  "statusPending": "Дар навбат",
  "statusRejected": "Ариза рад шуд",
  "rejectedMessage": "Аризаи бақайдгирии шумо тасдиқ нашуд.",
  "rejectionReason": "Сабаб"
}
```

In `"admin"`:
```json
"pendingUsers": "Интизоршавандагон",
"pendingUsersDesc": "Баррасӣ ва тасдиқи аризаҳои бақайдгирӣ",
"noPendingUsers": "Аризаи интизорӣ нест",
"noPendingUsersDesc": "Аризаҳои нави бақайдгирӣ дар ин ҷо пайдо мешаванд",
"requestedRole": "Вазифаи дархостшуда",
"requestedClass": "Синфи дархостшуда",
"registrationDate": "Санаи бақайдгирӣ",
"approveUser": "Тасдиқ кардан",
"rejectUser": "Рад кардан",
"rejectionReason": "Сабаби рад",
"rejectionReasonPlaceholder": "Сабаби рад кардани аризаро нависед...",
"userApproved": "Корбар тасдиқ шуд",
"userRejected": "Корбар рад шуд",
"changeRole": "Вазифа иваз кардан",
"changeClass": "Синф иваз кардан",
"transferClass": "Гузаронидан ба синфи дигар",
"blockUser": "Баста кардан",
"unblockUser": "Кушодан",
"graduateUser": "Хатмкунанда",
"markAsGraduated": "Ҳамчун хатмкунанда қайд кардан",
"graduates": "Хатмкунандагон",
"graduatesList": "Рӯйхати хатмкунандагон",
"noGraduates": "Хатмкунандагон ҳанӯз нестанд",
"noGraduatesDesc": "Хонандагони хатмкарда дар ин ҷо пайдо мешаванд",
"graduationYear": "Соли хатм",
"graduationDate": "Санаи хатм",
"yearsInSchool": "Солҳо дар мактаб",
"enrollmentHistory": "Таърихи таълим",
"noEnrollments": "Таърихи таълим нест",
"addEnrollment": "Илова кардан",
"enrollmentYear": "Соли таълим",
"classHistory": "Таърихи синфҳо",
"statusHistory": "Таърихи ҳолат",
"allUsers": "Ҳама",
"pendingFilter": "Интизорӣ",
"activeFilter": "Фаъол",
"studentsFilter": "Хонандагон",
"teachersFilter": "Муаллимон",
"directorsFilter": "Директорҳо",
"vicePrincipalsFilter": "Муовинон",
"adminsFilter": "Маъмурон",
"graduatesFilter": "Хатмкунандагон",
"blockedFilter": "Басташуда",
"rejectedFilter": "Радшуда",
"userStatus_pending": "Интизорӣ",
"userStatus_approved": "Тасдиқшуда",
"userStatus_active": "Фаъол",
"userStatus_blocked": "Басташуда",
"userStatus_graduated": "Хатмкунанда",
"userStatus_rejected": "Радшуда",
"confirmGraduate": "Оё мутмаин ҳастед, ки ин хонандаро ҳамчун хатмкунанда қайд мекунед?",
"confirmBlock": "Оё мутмаин ҳастед, ки ин корбарро баста мекунед?",
"confirmUnblock": "Оё мутмаин ҳастед, ки ин корбарро мекушоед?",
"editData": "Маълумот тағйир додан",
"editUserData": "Маълумоти корбарро тағйир додан",
"approvalDate": "Санаи тасдиқ",
"enrollmentDate": "Санаи қабул",
"homeroomTeacher": "Роҳбари синф",
"assignHomeroomTeacher": "Роҳбари синфро таъин кардан",
"changeAcademicYear": "Соли таълимро иваз кардан",
"confirmReject": "Оё мутмаин ҳастед, ки ин аризаро рад мекунед? Ин амал сабаб талаб мекунад.",
"blockWarning": "Онҳо ба платформа дастрасӣ надоранд.",
"graduateWarning": "Ин ҳолатро доимӣ тағйир медиҳад.",
"rejectWarning": "Корбар ба платформа дастрасӣ пайдо карда наметавонад.",
"savingChanges": "Нигоҳ доштан...",
"changesSaved": "Тағйирот нигоҳ дошта шуд"
```

- [ ] **Step 3: Add Russian translations**

Add the same keys to `src/i18n/ru.json` with Russian translations:

In `"auth"`:
```json
"registerRoleStep": "Выберите тип пользователя",
"registerProfileStep": "Заполните профиль",
"selectRole": "Кто вы?",
"selectClass": "Выберите класс",
"enrollmentYear": "Год поступления",
"profilePhoto": "Фото профиля",
"uploadPhoto": "Загрузить фото",
"changePhoto": "Изменить фото",
"photoHint": "JPG, PNG или WebP, макс. 2МБ",
"registerSubmit": "Отправить заявку",
"registrationPending": "Заявка отправлена",
"alreadyPending": "У вас уже есть заявка на рассмотрении"
```

In `"pending"`:
```json
"pending": {
  "title": "Заявка отправлена",
  "message": "Ваша заявка на регистрацию отправлена администрации школы.",
  "waitMessage": "Пожалуйста, ожидайте одобрения. Вам сообщат, когда заявка будет рассмотрена.",
  "logoutButton": "Выйти",
  "statusPending": "На рассмотрении",
  "statusRejected": "Заявка отклонена",
  "rejectedMessage": "Ваша заявка на регистрацию не была одобрена.",
  "rejectionReason": "Причина"
}
```

In `"admin"`:
```json
"pendingUsers": "Ожидающие",
"pendingUsersDesc": "Просмотр и одобрение заявок на регистрацию",
"noPendingUsers": "Нет заявок на рассмотрении",
"noPendingUsersDesc": "Новые заявки на регистрацию появятся здесь",
"requestedRole": "Запрошенная роль",
"requestedClass": "Запрошенный класс",
"registrationDate": "Дата регистрации",
"approveUser": "Одобрить",
"rejectUser": "Отклонить",
"rejectionReason": "Причина отклонения",
"rejectionReasonPlaceholder": "Укажите причину отклонения...",
"userApproved": "Пользователь одобрен",
"userRejected": "Пользователь отклонён",
"changeRole": "Изменить роль",
"changeClass": "Изменить класс",
"transferClass": "Перевести в другой класс",
"blockUser": "Заблокировать",
"unblockUser": "Разблокировать",
"graduateUser": "Выпускник",
"markAsGraduated": "Отметить как выпускника",
"graduates": "Выпускники",
"graduatesList": "Список выпускников",
"noGraduates": "Выпускников пока нет",
"noGraduatesDesc": "Выпускники появятся здесь",
"graduationYear": "Год выпуска",
"graduationDate": "Дата выпуска",
"yearsInSchool": "Лет в школе",
"enrollmentHistory": "История обучения",
"noEnrollments": "Истории обучения нет",
"addEnrollment": "Добавить",
"enrollmentYear": "Учебный год",
"classHistory": "История классов",
"statusHistory": "История статусов",
"allUsers": "Все",
"pendingFilter": "Ожидающие",
"activeFilter": "Активные",
"studentsFilter": "Ученики",
"teachersFilter": "Учителя",
"directorsFilter": "Директора",
"vicePrincipalsFilter": "Завучи",
"adminsFilter": "Администраторы",
"graduatesFilter": "Выпускники",
"blockedFilter": "Заблокированные",
"rejectedFilter": "Отклонённые",
"userStatus_pending": "Ожидание",
"userStatus_approved": "Одобрен",
"userStatus_active": "Активный",
"userStatus_blocked": "Заблокирован",
"userStatus_graduated": "Выпускник",
"userStatus_rejected": "Отклонён",
"confirmGraduate": "Вы уверены, что хотите отметить этого ученика как выпускника?",
"confirmBlock": "Вы уверены, что хотите заблокировать этого пользователя?",
"confirmUnblock": "Вы уверены, что хотите разблокировать этого пользователя?",
"editData": "Редактировать данные",
"editUserData": "Редактировать информацию пользователя",
"approvalDate": "Дата одобрения",
"enrollmentDate": "Дата поступления",
"homeroomTeacher": "Классный руководитель",
"assignHomeroomTeacher": "Назначить классного руководителя",
"changeAcademicYear": "Изменить учебный год",
"confirmReject": "Вы уверены, что хотите отклонить эту заявку? Необходимо указать причину.",
"blockWarning": "Пользователь потеряет доступ к платформе.",
"graduateWarning": "Это действие изменяет статус навсегда.",
"rejectWarning": "Пользователь не сможет получить доступ к платформе.",
"savingChanges": "Сохранение...",
"changesSaved": "Изменения сохранены"
```

- [ ] **Step 4: Verify JSON validity**

```bash
cd /Users/mehrovar/Desktop/maktabi-miyona-7
node -e "JSON.parse(require('fs').readFileSync('src/i18n/en.json','utf8')); console.log('en.json OK')"
node -e "JSON.parse(require('fs').readFileSync('src/i18n/tg.json','utf8')); console.log('tg.json OK')"
node -e "JSON.parse(require('fs').readFileSync('src/i18n/ru.json','utf8')); console.log('ru.json OK')"
```

Expected: All three print OK.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/en.json src/i18n/tg.json src/i18n/ru.json
git commit -m "feat: add i18n keys for registration, pending users, graduates

Add translation keys in tg/ru/en for:
- Registration flow (role selection, profile completion, pending)
- Pending page (waiting message, status)
- Admin pending users (approve/reject/review)
- Admin graduates section
- Enrollment history
- User status filters and lifecycle labels"
```

---

### Task 3: Avatar Upload — Storage Helper and Component

**Files:**
- Create: `src/lib/supabase/storage.ts`
- Create: `src/components/ui/file-upload.tsx`

**Interfaces:**
- Consumes: `createServerClient()` from `src/lib/supabase/server.ts`; `createBrowserClient()` from `src/lib/supabase/client.ts`
- Produces: `uploadAvatar(file: File): Promise<{ url: string | null; error: string | null }>` (client-side); `deleteAvatar(path: string): Promise<void>` (server-side); `<FileUpload>` component used by Tasks 4 and later

- [ ] **Step 1: Create the storage helper**

Create `src/lib/supabase/storage.ts`:

```typescript
"use server";

import { createServerClient } from "@/lib/supabase/server";

const AVATAR_BUCKET = "avatars";
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function uploadAvatarAction(
  formData: FormData
): Promise<{ url: string | null; error: string | null }> {
  const file = formData.get("avatar") as File | null;
  if (!file || file.size === 0) {
    return { url: null, error: null };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { url: null, error: "fileTooLarge" };
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return { url: null, error: "invalidFileType" };
  }

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { url: null, error: "unauthorized" };
  }

  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${user.id}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    return { url: null, error: "uploadFailed" };
  }

  const { data: urlData } = supabase.storage
    .from(AVATAR_BUCKET)
    .getPublicUrl(path);

  return { url: urlData.publicUrl, error: null };
}
```

- [ ] **Step 2: Create the FileUpload component**

Create `src/components/ui/file-upload.tsx`:

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Camera, Loader2, X } from "lucide-react";

interface FileUploadProps {
  name: string;
  currentUrl?: string | null;
  onUploaded?: (url: string) => void;
  className?: string;
}

export function FileUpload({ name, currentUrl, onUploaded, className }: FileUploadProps) {
  const t = useTranslations("auth");
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setError(null);
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError(t("photoHint"));
      return;
    }

    const url = URL.createObjectURL(file);
    setPreview(url);
  };

  const handleClear = () => {
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className={cn("space-y-2", className)}>
      <label className="text-sm font-medium text-neutral-700">
        {t("profilePhoto")}
      </label>
      <div className="flex items-center gap-4">
        <div
          className="relative flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-neutral-300 bg-neutral-50 transition-colors hover:border-primary-400"
          onClick={() => inputRef.current?.click()}
        >
          {preview ? (
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <Camera className="h-6 w-6 text-neutral-400" />
          )}
        </div>
        <div className="space-y-1">
          <button
            type="button"
            className="text-sm font-medium text-primary-600 hover:text-primary-700"
            onClick={() => inputRef.current?.click()}
          >
            {preview ? t("changePhoto") : t("uploadPhoto")}
          </button>
          {preview && (
            <button
              type="button"
              className="block text-xs text-neutral-500 hover:text-error-600"
              onClick={handleClear}
            >
              <X className="mr-0.5 inline h-3 w-3" />
              {t("delete" as never) ?? "Remove"}
            </button>
          )}
          <p className="text-xs text-neutral-400">{t("photoHint")}</p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleChange}
      />
      {error && <p className="text-xs text-error-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/mehrovar/Desktop/maktabi-miyona-7
npx tsc --noEmit --pretty 2>&1 | tail -20
```

Expected: No errors in the new files.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/storage.ts src/components/ui/file-upload.tsx
git commit -m "feat: add avatar upload storage helper and FileUpload component

- Server action uploadAvatarAction validates file size (2MB) and type (jpg/png/webp)
- Uploads to Supabase Storage 'avatars' bucket
- FileUpload component with preview, change, and remove functionality
- Used by registration form and profile edit"
```

---

### Task 4: Redesigned Registration Flow — Server Actions

**Files:**
- Modify: `src/app/(public)/register/actions.ts`
- Create: `src/app/(public)/register/data.ts`

**Interfaces:**
- Consumes: `createServerClient()`, `createAdminClient()`, `uploadAvatarAction()` from Task 3; existing `invitation_codes` table; new `registration_requests` table from Task 1
- Produces: `RegistrationState` type (expanded with `roleSelection` and `profile` steps), `sendOtpAction()`, `verifyOtpAction()`, `completeRegistrationAction()` (modified), `submitOpenRegistrationAction()` (new), `getAvailableRoles()`, `getAvailableClasses()`

- [ ] **Step 1: Create data.ts for role/class fetching**

Create `src/app/(public)/register/data.ts`:

```typescript
"use server";

import { createAnonClient } from "@/lib/supabase/anon";

const DEFAULT_SCHOOL_ID = "00000000-0000-0000-0000-000000000001";

export async function getAvailableRoles(): Promise<
  Array<{ id: string; slug: string; nameTg: string; nameRu: string | null; level: number }>
> {
  const supabase = createAnonClient();
  const { data } = await supabase
    .from("roles" as never)
    .select("id, slug, name_tg, name_ru, level" as never)
    .eq("school_id" as never, DEFAULT_SCHOOL_ID)
    .eq("is_active" as never, true)
    .gt("level" as never, 1)
    .order("level" as never, { ascending: true });

  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    slug: r.slug as string,
    nameTg: r.name_tg as string,
    nameRu: (r.name_ru as string) ?? null,
    level: r.level as number,
  }));
}

export async function getAvailableClasses(): Promise<
  Array<{ id: string; name: string; gradeLevel: number }>
> {
  const supabase = createAnonClient();

  const { data: currentYear } = await supabase
    .from("academic_years" as never)
    .select("id" as never)
    .eq("school_id" as never, DEFAULT_SCHOOL_ID)
    .eq("is_current" as never, true)
    .single();

  if (!currentYear) return [];

  const yearRow = currentYear as Record<string, unknown>;

  const { data } = await supabase
    .from("classes" as never)
    .select("id, name, grade_level" as never)
    .eq("school_id" as never, DEFAULT_SCHOOL_ID)
    .eq("academic_year_id" as never, yearRow.id as string)
    .eq("is_active" as never, true)
    .order("grade_level" as never, { ascending: true })
    .order("name" as never, { ascending: true });

  return ((data ?? []) as Array<Record<string, unknown>>).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    gradeLevel: c.grade_level as number,
  }));
}

export async function getAvailableSubjects(): Promise<
  Array<{ id: string; nameTg: string; nameRu: string | null }>
> {
  const supabase = createAnonClient();
  const { data } = await supabase
    .from("subjects" as never)
    .select("id, name_tg, name_ru" as never)
    .eq("school_id" as never, DEFAULT_SCHOOL_ID)
    .eq("is_active" as never, true)
    .order("name_tg" as never, { ascending: true });

  return ((data ?? []) as Array<Record<string, unknown>>).map((s) => ({
    id: s.id as string,
    nameTg: s.name_tg as string,
    nameRu: (s.name_ru as string) ?? null,
  }));
}
```

- [ ] **Step 2: Rewrite actions.ts to support both invitation-code and open registration**

Replace `src/app/(public)/register/actions.ts` with:

```typescript
"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadAvatarAction } from "@/lib/supabase/storage";
import { redirect } from "next/navigation";
import { z } from "zod";

const DEFAULT_SCHOOL_ID = "00000000-0000-0000-0000-000000000001";

const emailSchema = z.object({
  email: z.string().email(),
  roleId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  registrationMode: z.enum(["open", "invitation"]).optional(),
});

const otpSchema = z.object({
  email: z.string().email(),
  token: z.string().length(6).regex(/^\d+$/),
});

const invitationCompleteSchema = z.object({
  invitationCode: z.string().min(6).max(10).regex(/^[A-Z0-9]+$/),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional(),
});

const openCompleteSchema = z.object({
  password: z.string().min(8).max(128),
  confirmPassword: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional(),
  enrollmentYear: z.coerce.number().int().min(2000).max(2100).optional(),
});

export type RegistrationState = {
  step: "email" | "otp" | "complete";
  mode: "open" | "invitation";
  email: string | null;
  roleId: string | null;
  classId: string | null;
  error: string | null;
};

export async function sendOtpAction(
  prevState: RegistrationState,
  formData: FormData
): Promise<RegistrationState> {
  const parsed = emailSchema.safeParse({
    email: formData.get("email"),
    roleId: formData.get("roleId") || undefined,
    classId: formData.get("classId") || undefined,
    registrationMode: formData.get("registrationMode") || undefined,
  });

  if (!parsed.success) {
    return { ...prevState, error: "invalidEmail" };
  }

  const mode = parsed.data.registrationMode ?? "open";

  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { shouldCreateUser: true },
  });

  if (error) {
    console.error("OTP send error:", error.message, error.status);
    if (error.status === 429) {
      return { ...prevState, error: "rateLimitExceeded" };
    }
    return { ...prevState, error: "otpSendFailed" };
  }

  return {
    step: "otp",
    mode: mode as "open" | "invitation",
    email: parsed.data.email,
    roleId: parsed.data.roleId ?? null,
    classId: parsed.data.classId ?? null,
    error: null,
  };
}

export async function verifyOtpAction(
  prevState: RegistrationState,
  formData: FormData
): Promise<RegistrationState> {
  const email = prevState.email;
  if (!email) {
    return { ...prevState, step: "email", error: "sessionExpired" };
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

  return { ...prevState, step: "complete", error: null };
}

export async function completeRegistrationAction(
  prevState: RegistrationState,
  formData: FormData
): Promise<RegistrationState> {
  if (prevState.mode === "invitation") {
    return completeInvitationRegistration(prevState, formData);
  }
  return completeOpenRegistration(prevState, formData);
}

async function completeInvitationRegistration(
  prevState: RegistrationState,
  formData: FormData
): Promise<RegistrationState> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ...prevState, step: "email", error: "sessionExpired" };
  }

  const parsed = invitationCompleteSchema.safeParse({
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

  const { data: invitation } = await admin
    .from("invitation_codes" as never)
    .select("id, school_id, role_id, max_uses, used_count, expires_at, is_active" as never)
    .eq("code" as never, parsed.data.invitationCode)
    .eq("is_active" as never, true)
    .single();

  const inv = invitation as Record<string, unknown> | null;
  if (!inv) return { ...prevState, error: "invalidInvitationCode" };
  if (Number(inv.used_count) >= Number(inv.max_uses)) return { ...prevState, error: "invitationCodeUsed" };
  if (inv.expires_at && new Date(String(inv.expires_at)) < new Date()) return { ...prevState, error: "invitationCodeExpired" };

  const { error: pwError } = await admin.auth.admin.updateUserById(user.id, {
    password: parsed.data.password,
  });
  if (pwError) return { ...prevState, error: "passwordSetFailed" };

  const { data: existingUser } = await admin
    .from("users" as never)
    .select("id" as never)
    .eq("id" as never, user.id)
    .single();
  if (existingUser) return { ...prevState, error: "alreadyRegistered" };

  const { error: userError } = await admin
    .from("users" as never)
    .insert({
      id: user.id,
      school_id: String(inv.school_id),
      email: user.email!,
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      middle_name: parsed.data.middleName ?? null,
      status: "active",
    } as never);
  if (userError) return { ...prevState, error: "registrationFailed" };

  await admin
    .from("user_roles" as never)
    .insert({
      user_id: user.id,
      role_id: String(inv.role_id),
      school_id: String(inv.school_id),
    } as never);

  await admin
    .from("invitation_codes" as never)
    .update({ used_count: Number(inv.used_count) + 1 } as never)
    .eq("id" as never, String(inv.id));

  redirect("/dashboard");
}

async function completeOpenRegistration(
  prevState: RegistrationState,
  formData: FormData
): Promise<RegistrationState> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ...prevState, step: "email", error: "sessionExpired" };
  }

  const parsed = openCompleteSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    middleName: formData.get("middleName") || undefined,
    enrollmentYear: formData.get("enrollmentYear") || undefined,
  });

  if (!parsed.success) return { ...prevState, error: "invalidData" };
  if (parsed.data.password !== parsed.data.confirmPassword) {
    return { ...prevState, error: "passwordMismatch" };
  }

  const roleId = prevState.roleId;
  if (!roleId) return { ...prevState, step: "email", error: "invalidData" };

  const admin = createAdminClient();

  // Validate role exists and is NOT admin-level
  const { data: roleData } = await admin
    .from("roles" as never)
    .select("id, level, slug" as never)
    .eq("id" as never, roleId)
    .eq("school_id" as never, DEFAULT_SCHOOL_ID)
    .eq("is_active" as never, true)
    .single();

  const role = roleData as Record<string, unknown> | null;
  if (!role || Number(role.level) <= 1) {
    return { ...prevState, error: "invalidData" };
  }

  // Check for existing registration request or user
  const { data: existingUser } = await admin
    .from("users" as never)
    .select("id" as never)
    .eq("id" as never, user.id)
    .single();
  if (existingUser) return { ...prevState, error: "alreadyRegistered" };

  const { data: existingRequest } = await admin
    .from("registration_requests" as never)
    .select("id, status" as never)
    .eq("auth_user_id" as never, user.id)
    .in("status" as never, ["pending"])
    .single();
  if (existingRequest) return { ...prevState, error: "alreadyPending" };

  // Set password
  const { error: pwError } = await admin.auth.admin.updateUserById(user.id, {
    password: parsed.data.password,
  });
  if (pwError) return { ...prevState, error: "passwordSetFailed" };

  // Handle avatar upload
  let avatarUrl: string | null = null;
  const avatarFile = formData.get("avatar") as File | null;
  if (avatarFile && avatarFile.size > 0) {
    const avatarFormData = new FormData();
    avatarFormData.set("avatar", avatarFile);
    const uploadResult = await uploadAvatarAction(avatarFormData);
    if (uploadResult.url) avatarUrl = uploadResult.url;
  }

  // Build additional data
  const additionalData: Record<string, unknown> = {};
  const subjectIds = formData.getAll("subjectIds");
  if (subjectIds.length > 0) {
    additionalData.subjectIds = subjectIds;
  }

  // Create registration request
  const { error: reqError } = await admin
    .from("registration_requests" as never)
    .insert({
      school_id: DEFAULT_SCHOOL_ID,
      auth_user_id: user.id,
      email: user.email!,
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      middle_name: parsed.data.middleName ?? null,
      avatar_url: avatarUrl,
      requested_role_id: roleId,
      requested_class_id: prevState.classId,
      enrollment_year: parsed.data.enrollmentYear ?? null,
      additional_data: additionalData,
      status: "pending",
    } as never);
  if (reqError) return { ...prevState, error: "registrationFailed" };

  // Create pending user record
  const { error: userError } = await admin
    .from("users" as never)
    .insert({
      id: user.id,
      school_id: DEFAULT_SCHOOL_ID,
      email: user.email!,
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      middle_name: parsed.data.middleName ?? null,
      avatar_url: avatarUrl,
      status: "pending",
      is_active: false,
    } as never);
  if (userError) {
    // Clean up the registration request
    await admin
      .from("registration_requests" as never)
      .delete()
      .eq("auth_user_id" as never, user.id);
    return { ...prevState, error: "registrationFailed" };
  }

  redirect("/pending");
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/mehrovar/Desktop/maktabi-miyona-7
npx tsc --noEmit --pretty 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(public\)/register/actions.ts src/app/\(public\)/register/data.ts
git commit -m "feat: add dual-mode registration (invitation code + open with pending)

- Split registration into two modes: invitation (immediate) and open (pending)
- New data.ts fetches available roles (level > 1), classes, subjects from DB
- Open registration creates registration_request + pending user
- Server validates role level to prevent admin self-assignment
- Avatar upload integrated into registration flow"
```

---

### Task 5: Redesigned Registration Form — UI Component

**Files:**
- Modify: `src/app/(public)/register/register-form.tsx`
- Modify: `src/app/(public)/register/page.tsx`

**Interfaces:**
- Consumes: `RegistrationState`, `sendOtpAction`, `verifyOtpAction`, `completeRegistrationAction` from Task 4; `getAvailableRoles()`, `getAvailableClasses()`, `getAvailableSubjects()` from Task 4 `data.ts`; `<FileUpload>` from Task 3; `<Input>`, `<Button>` from `src/components/ui/`
- Produces: Complete multi-step registration form with role selection, class picker, avatar upload

- [ ] **Step 1: Update page.tsx to fetch roles and classes**

Replace `src/app/(public)/register/page.tsx`:

```tsx
import { RegisterForm } from "./register-form";
import { getAvailableRoles, getAvailableClasses, getAvailableSubjects } from "./data";

export default async function RegisterPage() {
  const [roles, classes, subjects] = await Promise.all([
    getAvailableRoles(),
    getAvailableClasses(),
    getAvailableSubjects(),
  ]);

  return <RegisterForm roles={roles} classes={classes} subjects={subjects} />;
}
```

- [ ] **Step 2: Rewrite register-form.tsx with role selection and dual-mode**

Replace `src/app/(public)/register/register-form.tsx` with the new multi-step form. The form has these steps:

1. **Email step**: email input + role selection (radio buttons from DB roles) + optional class selection (for students) + toggle for "I have an invitation code"
2. **OTP step**: 6-digit code input (same as before)
3. **Complete step**: name fields + password + avatar upload + (for invitation mode) invitation code field

The component receives `roles`, `classes`, `subjects` as props from the server component page.

```tsx
"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import {
  sendOtpAction,
  verifyOtpAction,
  completeRegistrationAction,
  type RegistrationState,
} from "./actions";
import { Mail, KeyRound, UserPlus, GraduationCap, BookOpen, School } from "lucide-react";
import Link from "next/link";

interface Role {
  id: string;
  slug: string;
  nameTg: string;
  nameRu: string | null;
  level: number;
}

interface ClassOption {
  id: string;
  name: string;
  gradeLevel: number;
}

interface Subject {
  id: string;
  nameTg: string;
  nameRu: string | null;
}

const ROLE_ICONS: Record<string, typeof GraduationCap> = {
  student: GraduationCap,
  teacher: BookOpen,
  director: School,
  vice_principal: School,
};

const initialState: RegistrationState = {
  step: "email",
  mode: "open",
  email: null,
  roleId: null,
  classId: null,
  error: null,
};

export function RegisterForm({
  roles,
  classes,
  subjects,
}: {
  roles: Role[];
  classes: ClassOption[];
  subjects: Subject[];
}) {
  const t = useTranslations("auth");
  const [hasInvitation, setHasInvitation] = useState(false);
  const [selectedRoleSlug, setSelectedRoleSlug] = useState<string | null>(null);

  const [state, formAction, isPending] = useActionState(
    (prevState: RegistrationState, formData: FormData) => {
      if (hasInvitation) {
        formData.set("registrationMode", "invitation");
      } else {
        formData.set("registrationMode", "open");
      }
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

  const isStudentSelected = selectedRoleSlug === "student";
  const isTeacherSelected = selectedRoleSlug === "teacher";

  return (
    <div className="w-full max-w-md space-y-6 animate-in">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50">
          {state.step === "email" && <Mail className="h-6 w-6 text-primary-600" />}
          {state.step === "otp" && <KeyRound className="h-6 w-6 text-primary-600" />}
          {state.step === "complete" && <UserPlus className="h-6 w-6 text-primary-600" />}
        </div>
        <h1 className="text-2xl font-bold text-neutral-900">{t("registerTitle")}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {state.step === "email" && t("registerRoleStep")}
          {state.step === "otp" && t("registerOtpStep")}
          {state.step === "complete" && t("registerProfileStep")}
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        {state.step === "email" && (
          <>
            {/* Registration mode toggle */}
            <div className="flex gap-2 rounded-lg border border-neutral-200 p-1">
              <button
                type="button"
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  !hasInvitation ? "bg-primary-50 text-primary-700" : "text-neutral-500 hover:text-neutral-700"
                }`}
                onClick={() => setHasInvitation(false)}
              >
                {t("registerButton")}
              </button>
              <button
                type="button"
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  hasInvitation ? "bg-primary-50 text-primary-700" : "text-neutral-500 hover:text-neutral-700"
                }`}
                onClick={() => setHasInvitation(true)}
              >
                {t("invitationCode")}
              </button>
            </div>

            {/* Email */}
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

            {/* Role selection (only for open registration) */}
            {!hasInvitation && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700">
                  {t("selectRole")}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {roles.map((role) => {
                    const Icon = ROLE_ICONS[role.slug] ?? UserPlus;
                    return (
                      <label
                        key={role.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border-2 p-3 transition-colors ${
                          selectedRoleSlug === role.slug
                            ? "border-primary-500 bg-primary-50"
                            : "border-neutral-200 hover:border-neutral-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name="roleId"
                          value={role.id}
                          required
                          className="hidden"
                          onChange={() => setSelectedRoleSlug(role.slug)}
                        />
                        <Icon className="h-4 w-4 shrink-0 text-neutral-600" />
                        <span className="text-sm font-medium">{role.nameTg}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Class selection for students */}
            {!hasInvitation && isStudentSelected && classes.length > 0 && (
              <div className="space-y-2">
                <label htmlFor="classId" className="text-sm font-medium text-neutral-700">
                  {t("selectClass")}
                </label>
                <select
                  id="classId"
                  name="classId"
                  required
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="">{t("selectClass")}</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name} ({cls.gradeLevel}-{t("class" as never) ?? "класс"})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
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
            <p className="text-xs text-neutral-500">{t("otpSentTo", { email: state.email ?? "" })}</p>
          </div>
        )}

        {state.step === "complete" && (
          <>
            {/* Invitation code (only for invitation mode) */}
            {state.mode === "invitation" && (
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
            )}

            {/* Avatar upload (open registration only) */}
            {state.mode === "open" && (
              <FileUpload name="avatar" />
            )}

            {/* Name fields */}
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

            {/* Password */}
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

            {/* Confirm password (open mode) */}
            {state.mode === "open" && (
              <div className="space-y-2">
                <label htmlFor="confirmPassword" className="text-sm font-medium text-neutral-700">
                  {t("confirmPassword")}
                </label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  error={!!state.error}
                />
              </div>
            )}

            {/* Enrollment year (students in open mode) */}
            {state.mode === "open" && state.roleId && (
              <div className="space-y-2">
                <label htmlFor="enrollmentYear" className="text-sm font-medium text-neutral-700">
                  {t("enrollmentYear")}
                </label>
                <Input
                  id="enrollmentYear"
                  name="enrollmentYear"
                  type="number"
                  min={2000}
                  max={2100}
                  defaultValue={new Date().getFullYear()}
                  error={!!state.error}
                />
              </div>
            )}
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
          {state.step === "complete" && (state.mode === "invitation" ? t("registerButton") : t("registerSubmit"))}
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

- [ ] **Step 3: Verify TypeScript and build**

```bash
cd /Users/mehrovar/Desktop/maktabi-miyona-7
npx tsc --noEmit --pretty 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(public\)/register/register-form.tsx src/app/\(public\)/register/page.tsx
git commit -m "feat: redesign registration form with role selection and dual mode

- Toggle between open registration and invitation code modes
- Role selection from DB roles (admin-level hidden)
- Class selection for students (current academic year classes)
- Avatar upload in open registration mode
- Password confirmation in open mode
- Enrollment year field for students"
```

---

### Task 6: Pending Page and Middleware Enhancement

**Files:**
- Create: `src/app/(public)/pending/page.tsx`
- Modify: `src/lib/supabase/middleware.ts`

**Interfaces:**
- Consumes: `createServerClient()`, `supabase.auth.getUser()`, `users` table `status` column from Task 1
- Produces: `/pending` page route; middleware redirects pending users from dashboard routes to `/pending`

- [ ] **Step 1: Create the pending page**

Create `src/app/(public)/pending/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { PendingContent } from "./pending-content";

export default async function PendingPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("users" as never)
    .select("status" as never)
    .eq("id" as never, user.id)
    .single();

  const row = profile as Record<string, unknown> | null;

  if (!row) {
    redirect("/login");
  }

  if (row.status === "active" || row.status === "approved") {
    redirect("/dashboard");
  }

  const { data: request } = await supabase
    .from("registration_requests" as never)
    .select("status, rejection_reason" as never)
    .eq("auth_user_id" as never, user.id)
    .order("created_at" as never, { ascending: false })
    .limit(1)
    .single();

  const req = request as Record<string, unknown> | null;

  return (
    <PendingContent
      status={(row.status as string) ?? "pending"}
      rejectionReason={(req?.rejection_reason as string) ?? null}
    />
  );
}
```

- [ ] **Step 2: Create the pending content client component**

Create `src/app/(public)/pending/pending-content.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, XCircle } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function PendingContent({
  status,
  rejectionReason,
}: {
  status: string;
  rejectionReason: string | null;
}) {
  const t = useTranslations("pending");
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const isRejected = status === "rejected";

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center animate-in">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary-50">
        {isRejected ? (
          <XCircle className="h-10 w-10 text-error-500" />
        ) : (
          <Clock className="h-10 w-10 text-primary-500" />
        )}
      </div>

      <Badge variant={isRejected ? "destructive" : "warning"} className="mb-4">
        {isRejected ? t("statusRejected") : t("statusPending")}
      </Badge>

      <h1 className="mb-2 text-2xl font-bold text-neutral-900">
        {isRejected ? t("statusRejected") : t("title")}
      </h1>

      <p className="mb-2 max-w-sm text-neutral-600">
        {isRejected ? t("rejectedMessage") : t("message")}
      </p>

      {!isRejected && (
        <p className="mb-6 max-w-sm text-sm text-neutral-500">
          {t("waitMessage")}
        </p>
      )}

      {isRejected && rejectionReason && (
        <div className="mb-6 max-w-sm rounded-lg bg-red-50 p-4 text-sm text-neutral-700">
          <span className="font-medium">{t("rejectionReason")}:</span>{" "}
          {rejectionReason}
        </div>
      )}

      <Button variant="outline" onClick={handleLogout}>
        {t("logoutButton")}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Update middleware to redirect pending users**

In `src/lib/supabase/middleware.ts`, add pending user check. After the existing profile check (around line 48-69), add a check for `status = 'pending'` or `status = 'rejected'`:

After the existing `if (user && isAuthRoute)` block that checks for missing profile (lines 48-69), add a new block:

```typescript
  // Check if authenticated user on protected routes has pending/rejected status
  if (user && isAuthRoute) {
    const { data: userStatus } = await supabase
      .from("users" as never)
      .select("status" as never)
      .eq("id" as never, user.id)
      .single();

    const statusRow = userStatus as Record<string, unknown> | null;
    if (statusRow && (statusRow.status === "pending" || statusRow.status === "rejected")) {
      if (!request.nextUrl.pathname.startsWith("/pending")) {
        const url = request.nextUrl.clone();
        url.pathname = "/pending";
        return NextResponse.redirect(url);
      }
    }
  }
```

Also add `/pending` to the `isPublicAuthRoute` check so that authenticated active users on `/pending` get redirected to dashboard. And add `/pending` to the list of routes that don't redirect pending users away.

The middleware needs careful ordering:
1. Refresh session (existing)
2. Unauthenticated on protected routes → redirect to login (existing)
3. Authenticated but no profile → sign out, redirect to login (existing)
4. **NEW**: Authenticated with pending/rejected status on protected routes → redirect to /pending
5. Authenticated on public auth routes → redirect to dashboard (existing, modified to also redirect from /pending if active)

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/mehrovar/Desktop/maktabi-miyona-7
npx tsc --noEmit --pretty 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add src/app/\(public\)/pending/ src/lib/supabase/middleware.ts
git commit -m "feat: add pending page and middleware redirect for pending users

- /pending page shows waiting message or rejection reason
- Middleware redirects pending/rejected users from dashboard to /pending
- Active users on /pending redirected to dashboard
- Pending users can sign out"
```

---

### Task 7: Admin Pending Users — Page and Actions

**Files:**
- Create: `src/app/(dashboard)/admin/pending/page.tsx`
- Create: `src/app/(dashboard)/admin/pending/actions.ts`
- Create: `src/app/(dashboard)/admin/pending/pending-list.tsx`
- Modify: `src/app/(dashboard)/admin/admin-nav.tsx`

**Interfaces:**
- Consumes: `requireAdmin()`, `requireSuperAdmin()` from `src/lib/admin/guard.ts`; `createServerClient()`, `createAdminClient()`; `registration_requests`, `users`, `user_roles`, `class_students`, `student_enrollments`, `user_status_history`, `audit_logs` tables
- Produces: `/admin/pending` page with list of pending requests; `approveUserAction()`, `rejectUserAction()` server actions

- [ ] **Step 1: Create the admin pending actions**

Create `src/app/(dashboard)/admin/pending/actions.ts`:

```typescript
"use server";

import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const approveSchema = z.object({
  requestId: z.string().uuid(),
  roleId: z.string().uuid(),
  classId: z.string().uuid().optional(),
});

const rejectSchema = z.object({
  requestId: z.string().uuid(),
  reason: z.string().min(1).max(500),
});

export async function approveUserAction(
  _prevState: { error: string | null; success: boolean },
  formData: FormData
): Promise<{ error: string | null; success: boolean }> {
  const admin = await requireAdmin();

  const parsed = approveSchema.safeParse({
    requestId: formData.get("requestId"),
    roleId: formData.get("roleId"),
    classId: formData.get("classId") || undefined,
  });

  if (!parsed.success) return { error: "invalidData", success: false };

  const supabase = await createServerClient();

  // Get the registration request
  const { data: request } = await supabase
    .from("registration_requests" as never)
    .select("*" as never)
    .eq("id" as never, parsed.data.requestId)
    .eq("school_id" as never, admin.schoolId)
    .eq("status" as never, "pending")
    .single();

  const req = request as Record<string, unknown> | null;
  if (!req) return { error: "invalidData", success: false };

  // Validate role is not admin-level
  const { data: roleData } = await supabase
    .from("roles" as never)
    .select("level" as never)
    .eq("id" as never, parsed.data.roleId)
    .single();

  const role = roleData as Record<string, unknown> | null;
  if (!role || Number(role.level) <= 1) {
    return { error: "invalidData", success: false };
  }

  const userId = req.auth_user_id as string;

  // Update user status to active
  await supabase
    .from("users" as never)
    .update({ status: "active", is_active: true } as never)
    .eq("id" as never, userId);

  // Assign role
  await supabase
    .from("user_roles" as never)
    .insert({
      user_id: userId,
      role_id: parsed.data.roleId,
      school_id: admin.schoolId,
      assigned_by: admin.id,
    } as never);

  // For students: assign to class
  if (parsed.data.classId) {
    await supabase
      .from("class_students" as never)
      .insert({
        class_id: parsed.data.classId,
        student_id: userId,
        school_id: admin.schoolId,
      } as never);

    // Get the academic year for the class
    const { data: classData } = await supabase
      .from("classes" as never)
      .select("academic_year_id" as never)
      .eq("id" as never, parsed.data.classId)
      .single();

    const cls = classData as Record<string, unknown> | null;
    if (cls) {
      await supabase
        .from("student_enrollments" as never)
        .insert({
          school_id: admin.schoolId,
          student_id: userId,
          class_id: parsed.data.classId,
          academic_year_id: cls.academic_year_id as string,
          enrolled_by: admin.id,
        } as never);
    }
  }

  // Update registration request
  await supabase
    .from("registration_requests" as never)
    .update({
      status: "approved",
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
    } as never)
    .eq("id" as never, parsed.data.requestId);

  // Log to user_status_history
  await supabase
    .from("user_status_history" as never)
    .insert({
      school_id: admin.schoolId,
      user_id: userId,
      action: "approved",
      old_value: "pending",
      new_value: "active",
      performed_by: admin.id,
    } as never);

  // Log to audit_logs
  await supabase
    .from("audit_logs" as never)
    .insert({
      school_id: admin.schoolId,
      user_id: admin.id,
      user_public_id: admin.publicId,
      action: "update",
      entity_type: "registration_request",
      entity_id: parsed.data.requestId,
      old_values: { status: "pending" },
      new_values: { status: "approved", role_id: parsed.data.roleId },
    } as never);

  revalidatePath("/admin/pending");
  revalidatePath("/admin/users");
  return { error: null, success: true };
}

export async function rejectUserAction(
  _prevState: { error: string | null; success: boolean },
  formData: FormData
): Promise<{ error: string | null; success: boolean }> {
  const admin = await requireAdmin();

  const parsed = rejectSchema.safeParse({
    requestId: formData.get("requestId"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) return { error: "invalidData", success: false };

  const supabase = await createServerClient();

  const { data: request } = await supabase
    .from("registration_requests" as never)
    .select("auth_user_id" as never)
    .eq("id" as never, parsed.data.requestId)
    .eq("school_id" as never, admin.schoolId)
    .eq("status" as never, "pending")
    .single();

  const req = request as Record<string, unknown> | null;
  if (!req) return { error: "invalidData", success: false };

  const userId = req.auth_user_id as string;

  // Update user status
  await supabase
    .from("users" as never)
    .update({ status: "rejected" } as never)
    .eq("id" as never, userId);

  // Update registration request
  await supabase
    .from("registration_requests" as never)
    .update({
      status: "rejected",
      rejection_reason: parsed.data.reason,
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
    } as never)
    .eq("id" as never, parsed.data.requestId);

  // Log to user_status_history
  await supabase
    .from("user_status_history" as never)
    .insert({
      school_id: admin.schoolId,
      user_id: userId,
      action: "rejected",
      old_value: "pending",
      new_value: "rejected",
      performed_by: admin.id,
      notes: parsed.data.reason,
    } as never);

  revalidatePath("/admin/pending");
  return { error: null, success: true };
}
```

- [ ] **Step 2: Create the pending list client component**

Create `src/app/(dashboard)/admin/pending/pending-list.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { approveUserAction, rejectUserAction } from "./actions";
import { Check, X, UserPlus, Clock } from "lucide-react";

interface PendingRequest {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  avatarUrl: string | null;
  requestedRoleId: string;
  requestedRoleName: string;
  requestedClassName: string | null;
  requestedClassId: string | null;
  enrollmentYear: number | null;
  createdAt: string;
}

interface AvailableRole {
  id: string;
  nameTg: string;
  slug: string;
}

interface AvailableClass {
  id: string;
  name: string;
}

export function PendingList({
  requests,
  roles,
  classes,
}: {
  requests: PendingRequest[];
  roles: AvailableRole[];
  classes: AvailableClass[];
}) {
  const t = useTranslations("admin");
  const [rejectDialogId, setRejectDialogId] = useState<string | null>(null);
  const [approveState, approveAction, isApproving] = useActionState(approveUserAction, {
    error: null,
    success: false,
  });
  const [rejectState, rejectAction, isRejecting] = useActionState(rejectUserAction, {
    error: null,
    success: false,
  });

  if (requests.length === 0) {
    return (
      <EmptyState
        icon={<UserPlus className="h-12 w-12" />}
        title={t("noPendingUsers")}
        description={t("noPendingUsersDesc")}
      />
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {requests.map((req) => (
          <Card key={req.id}>
            <CardContent className="p-4">
              <div className="mb-3 flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-100">
                  {req.avatarUrl ? (
                    <img src={req.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm font-semibold text-primary-700">
                      {req.firstName[0]}{req.lastName[0]}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-neutral-900">
                    {req.firstName} {req.lastName}
                    {req.middleName ? ` ${req.middleName}` : ""}
                  </p>
                  <p className="truncate text-xs text-neutral-500">{req.email}</p>
                </div>
              </div>

              <div className="mb-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-500">{t("requestedRole")}</span>
                  <Badge variant="secondary">{req.requestedRoleName}</Badge>
                </div>
                {req.requestedClassName && (
                  <div className="flex justify-between">
                    <span className="text-neutral-500">{t("requestedClass")}</span>
                    <span className="text-neutral-700">{req.requestedClassName}</span>
                  </div>
                )}
                {req.enrollmentYear && (
                  <div className="flex justify-between">
                    <span className="text-neutral-500">{t("enrollmentYear")}</span>
                    <span className="text-neutral-700">{req.enrollmentYear}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-neutral-500">{t("registrationDate")}</span>
                  <span className="text-neutral-700">
                    {new Date(req.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <form action={approveAction} className="flex-1">
                  <input type="hidden" name="requestId" value={req.id} />
                  <input type="hidden" name="roleId" value={req.requestedRoleId} />
                  {req.requestedClassId && (
                    <input type="hidden" name="classId" value={req.requestedClassId} />
                  )}
                  <Button
                    type="submit"
                    size="sm"
                    className="w-full"
                    loading={isApproving}
                  >
                    <Check className="mr-1 h-3 w-3" />
                    {t("approveUser")}
                  </Button>
                </form>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setRejectDialogId(req.id)}
                >
                  <X className="mr-1 h-3 w-3" />
                  {t("rejectUser")}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Reject dialog */}
      <Dialog open={!!rejectDialogId} onOpenChange={() => setRejectDialogId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("rejectUser")}</DialogTitle>
          </DialogHeader>
          <form action={rejectAction} className="space-y-4">
            <input type="hidden" name="requestId" value={rejectDialogId ?? ""} />
            <div className="space-y-2">
              <label htmlFor="reason" className="text-sm font-medium text-neutral-700">
                {t("rejectionReason")}
              </label>
              <textarea
                id="reason"
                name="reason"
                required
                rows={3}
                placeholder={t("rejectionReasonPlaceholder")}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            {rejectState.error && (
              <p className="text-sm text-error-600">{rejectState.error}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRejectDialogId(null)}>
                {t("cancel" as never) ?? "Cancel"}
              </Button>
              <Button type="submit" variant="destructive" loading={isRejecting}>
                {t("rejectUser")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 3: Create the admin pending page**

Create `src/app/(dashboard)/admin/pending/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { AdminNav } from "../admin-nav";
import { PendingList } from "./pending-list";

async function getPendingRequests(schoolId: string) {
  const supabase = await createServerClient();

  const { data } = await supabase
    .from("registration_requests" as never)
    .select("*, roles:requested_role_id(name_tg, slug), classes:requested_class_id(name)" as never)
    .eq("school_id" as never, schoolId)
    .eq("status" as never, "pending")
    .order("created_at" as never, { ascending: false });

  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const role = r.roles as Record<string, unknown> | null;
    const cls = r.classes as Record<string, unknown> | null;
    return {
      id: r.id as string,
      email: r.email as string,
      firstName: r.first_name as string,
      lastName: r.last_name as string,
      middleName: (r.middle_name as string) ?? null,
      avatarUrl: (r.avatar_url as string) ?? null,
      requestedRoleId: r.requested_role_id as string,
      requestedRoleName: role ? (role.name_tg as string) : "—",
      requestedClassName: cls ? (cls.name as string) : null,
      requestedClassId: (r.requested_class_id as string) ?? null,
      enrollmentYear: (r.enrollment_year as number) ?? null,
      createdAt: r.created_at as string,
    };
  });
}

async function getRolesAndClasses(schoolId: string) {
  const supabase = await createServerClient();

  const { data: roles } = await supabase
    .from("roles" as never)
    .select("id, slug, name_tg" as never)
    .eq("school_id" as never, schoolId)
    .eq("is_active" as never, true)
    .gt("level" as never, 1)
    .order("level" as never, { ascending: true });

  const { data: classes } = await supabase
    .from("classes" as never)
    .select("id, name" as never)
    .eq("school_id" as never, schoolId)
    .eq("is_active" as never, true)
    .order("name" as never, { ascending: true });

  return {
    roles: ((roles ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      nameTg: r.name_tg as string,
      slug: r.slug as string,
    })),
    classes: ((classes ?? []) as Array<Record<string, unknown>>).map((c) => ({
      id: c.id as string,
      name: c.name as string,
    })),
  };
}

export default async function AdminPendingPage() {
  const admin = await requireAdmin();
  const t = await getTranslations("admin");

  const [requests, { roles, classes }] = await Promise.all([
    getPendingRequests(admin.schoolId),
    getRolesAndClasses(admin.schoolId),
  ]);

  return (
    <div>
      <AdminNav />
      <div className="animate-in">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-neutral-900">{t("pendingUsers")}</h1>
          <p className="mt-1 text-sm text-neutral-500">{t("pendingUsersDesc")}</p>
        </div>
        <PendingList requests={requests} roles={roles} classes={classes} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add pending to admin nav**

In `src/app/(dashboard)/admin/admin-nav.tsx`, add the pending users entry to `adminSections` array, right after the overview entry (line 24):

```typescript
  { label: "admin.pendingUsers", href: "/admin/pending", icon: Clock },
```

Add `Clock` to the import from `lucide-react` on line 16.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /Users/mehrovar/Desktop/maktabi-miyona-7
npx tsc --noEmit --pretty 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/admin/pending/ src/app/\(dashboard\)/admin/admin-nav.tsx
git commit -m "feat: add admin pending users page with approve/reject

- /admin/pending lists all pending registration requests
- Card layout showing avatar, name, email, role, class, date
- Approve action creates user_roles, class_students, student_enrollments
- Reject action with required reason
- Logs all actions to audit_logs and user_status_history
- Added 'Pending Users' to admin nav"
```

---

### Task 8: Super Admin User Management Center — Users List, Detail Card, Full Actions

**Files:**
- Modify: `src/app/(dashboard)/admin/users/page.tsx`
- Modify: `src/app/(dashboard)/admin/users/users-table.tsx`
- Modify: `src/app/(dashboard)/admin/users/actions.ts`
- Modify: `src/app/(dashboard)/admin/users/[userId]/page.tsx`
- Modify: `src/app/(dashboard)/admin/users/[userId]/user-detail.tsx`
- Create: `src/app/(dashboard)/admin/users/[userId]/actions.ts`
- Create: `src/components/ui/confirm-dialog.tsx`

**Interfaces:**
- Consumes: `requireAdmin()`, `requireSuperAdmin()` from `src/lib/admin/guard.ts`; `createServerClient()`, `createAdminClient()`; `users` (with `status`, `graduation_year`, `graduation_date`, `years_in_school`, `created_at`), `user_roles`, `roles`, `classes`, `class_students`, `academic_years`, `student_enrollments`, `user_status_history`, `registration_requests`, `audit_logs` tables
- Produces: Enhanced users list with status/role filters and search; comprehensive user detail card with photo, full info, dates, history; server actions for all management operations; confirmation dialogs for dangerous actions

**User Detail Card must show:**
- Photo (avatar or initials)
- Full name (first, last, middle)
- Email (Gmail)
- Current role (from `user_roles` → `roles`)
- Status (pending/approved/active/blocked/graduated/rejected)
- Current class (from `class_students` → `classes`, for students)
- Academic year (from current class's `academic_year_id` → `academic_years`)
- Registration date (`users.created_at`)
- Approval date (from `registration_requests.reviewed_at` or `user_status_history` where action='approved')
- Enrollment date (from first `student_enrollments.enrolled_at`)
- Change history (from `user_status_history`, chronological)

**Super Admin actions (ALL via server actions with `requireSuperAdmin()`):**
- Approve pending request (creates `user_roles`, `class_students`, `student_enrollments`)
- Reject pending request (with required reason)
- Change role (select from all roles; `requireSuperAdmin()`)
- Change class (select from classes in current academic year; `requireSuperAdmin()`)
- Change academic year enrollment (select academic year + class; `requireSuperAdmin()`)
- Assign/change homeroom teacher for a class (`requireSuperAdmin()`)
- Block user (with confirmation dialog; `requireSuperAdmin()`)
- Unblock user (`requireSuperAdmin()`)
- Graduate student (with confirmation dialog; `requireSuperAdmin()`)
- Edit registration data (first name, last name, middle name, email; `requireSuperAdmin()`)

**Confirmation dialogs required for dangerous actions:**
- Block: "Are you sure you want to block {name}? They will lose access to the platform."
- Reject: "Are you sure you want to reject {name}'s registration? Provide a reason."
- Graduate: "Are you sure you want to mark {name} as graduated? This changes their status permanently."

**Security requirements:**
- Every server action starts with `const admin = await requireSuperAdmin();`
- `school_id` comes from `admin.schoolId`, never from client
- `userId` parameter is validated as UUID via Zod
- Role changes validate that the target role exists and belongs to the same school
- Cannot change own role (self-protection)
- All mutations log to both `audit_logs` and `user_status_history`

- [ ] **Step 1: Create reusable ConfirmDialog component**

Create `src/components/ui/confirm-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  variant?: "default" | "destructive";
  onConfirm: () => void | Promise<void>;
  children?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  variant = "destructive",
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" variant={variant} onClick={handleConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Update users page.tsx with status filters and enriched data**

Replace `src/app/(dashboard)/admin/users/page.tsx` with enhanced version that:
- Uses `requireAdmin()` guard (page accessible to admins; super-admin actions are guarded per-action)
- Fetches users with: `id, public_id, first_name, last_name, middle_name, email, is_active, avatar_url, status, created_at`
- Joins `user_roles` → `roles` for each user (role name + slug)
- Joins `class_students` → `classes` for student class info
- Accepts `?filter=` and `?q=` search params
- Passes all data to `UsersTable`

```tsx
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { AdminNav } from "../admin-nav";
import { UsersTable } from "./users-table";

async function getUsers(schoolId: string) {
  const supabase = await createServerClient();

  const { data: users } = await supabase
    .from("users" as never)
    .select("id, public_id, first_name, last_name, middle_name, email, is_active, avatar_url, status, created_at" as never)
    .order("created_at" as never, { ascending: false });

  const usersArr = (users ?? []) as Array<Record<string, unknown>>;

  const withDetails = await Promise.all(
    usersArr.map(async (user) => {
      const { data: roles } = await supabase
        .from("user_roles" as never)
        .select("roles:role_id(name_tg, slug)" as never)
        .eq("user_id" as never, user.id as never);

      const roleData = ((roles ?? []) as Array<Record<string, unknown>>).map((r) => {
        const role = r.roles as Record<string, unknown>;
        return { name: role.name_tg as string, slug: role.slug as string };
      });

      const { data: classAssignment } = await supabase
        .from("class_students" as never)
        .select("classes:class_id(name)" as never)
        .eq("student_id" as never, user.id as string)
        .limit(1)
        .single();

      const cls = classAssignment as Record<string, unknown> | null;
      const className = cls ? ((cls.classes as Record<string, unknown>).name as string) : null;

      return {
        id: user.id as string,
        publicId: user.public_id as string,
        firstName: user.first_name as string,
        lastName: user.last_name as string,
        middleName: (user.middle_name as string) ?? null,
        email: user.email as string,
        isActive: user.is_active as boolean,
        avatarUrl: (user.avatar_url as string) ?? null,
        status: (user.status as string) ?? "active",
        createdAt: user.created_at as string,
        roles: roleData,
        className,
      };
    })
  );

  return withDetails;
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const admin = await requireAdmin();
  const t = await getTranslations("admin");
  const { filter, q } = await searchParams;
  const users = await getUsers(admin.schoolId);

  return (
    <div>
      <AdminNav />
      <div className="animate-in">
        <h1 className="mb-6 text-2xl font-bold text-neutral-900">
          {t("users")}
        </h1>
        <UsersTable users={users} currentFilter={filter ?? "all"} searchQuery={q ?? ""} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite users-table.tsx with filters, status badges, and class column**

Replace `src/app/(dashboard)/admin/users/users-table.tsx` with enhanced version including:
- Filter tabs: All, Pending, Active, Students, Teachers, Directors, Vice Principals, Admins, Graduates, Blocked, Rejected
- Search by name/email/publicId
- Status badge with color coding
- Avatar display
- Class column for students
- Registration date column
- Link to detail card

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";
import { Users, Eye, Search } from "lucide-react";

interface UserRow {
  id: string;
  publicId: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  email: string;
  isActive: boolean;
  avatarUrl: string | null;
  status: string;
  createdAt: string;
  roles: Array<{ name: string; slug: string }>;
  className: string | null;
}

const STATUS_VARIANTS: Record<string, "default" | "warning" | "success" | "destructive" | "secondary"> = {
  pending: "warning",
  approved: "success",
  active: "default",
  blocked: "destructive",
  graduated: "secondary",
  rejected: "destructive",
};

const FILTERS = [
  "all", "pending", "active", "students", "teachers",
  "directors", "vicePrincipals", "admins", "graduates", "blocked", "rejected",
] as const;

type Filter = typeof FILTERS[number];

const ROLE_FILTERS: Record<string, string> = {
  students: "student",
  teachers: "teacher",
  directors: "director",
  vicePrincipals: "vice_principal",
  admins: "admin",
};

export function UsersTable({
  users,
  currentFilter,
  searchQuery,
}: {
  users: UserRow[];
  currentFilter: string;
  searchQuery: string;
}) {
  const t = useTranslations("admin");
  const [filter, setFilter] = useState<Filter>((currentFilter as Filter) || "all");
  const [search, setSearch] = useState(searchQuery);

  const filtered = users.filter((user) => {
    if (filter === "pending") return user.status === "pending";
    if (filter === "active") return user.status === "active";
    if (filter === "blocked") return user.status === "blocked";
    if (filter === "graduated") return user.status === "graduated";
    if (filter === "rejected") return user.status === "rejected";
    const roleSlug = ROLE_FILTERS[filter];
    if (roleSlug) return user.roles.some((r) => r.slug === roleSlug);
    return true;
  }).filter((user) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      user.firstName.toLowerCase().includes(q) ||
      user.lastName.toLowerCase().includes(q) ||
      user.email.toLowerCase().includes(q) ||
      user.publicId.toLowerCase().includes(q)
    );
  });

  const filterLabels: Record<Filter, string> = {
    all: t("allUsers"),
    pending: t("pendingFilter"),
    active: t("activeFilter"),
    students: t("studentsFilter"),
    teachers: t("teachersFilter"),
    directors: t("directorsFilter"),
    vicePrincipals: t("vicePrincipalsFilter"),
    admins: t("adminsFilter"),
    graduates: t("graduatesFilter"),
    blocked: t("blockedFilter"),
    rejected: t("rejectedFilter"),
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <Input
          placeholder={t("search" as never) ?? "Search..."}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === f
                ? "bg-primary-100 text-primary-700"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {filterLabels[f]}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={<Users className="h-12 w-12" />} title={t("noData" as never) ?? "No data"} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <th className="px-4 py-3 text-left font-medium text-neutral-600">{t("userDetails")}</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">{t("roles")}</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">{t("requestedClass")}</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">{t("userStatus")}</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">{t("registrationDate")}</th>
                <th className="px-4 py-3 text-right font-medium text-neutral-600" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id} className="border-b border-neutral-100 transition-colors hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-100">
                        {user.avatarUrl ? (
                          <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-xs font-semibold text-primary-700">
                            {user.firstName[0]}{user.lastName[0]}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-neutral-800">
                          {user.lastName} {user.firstName} {user.middleName ?? ""}
                        </p>
                        <p className="text-xs text-neutral-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map((role) => (
                        <Badge key={role.slug} variant="secondary">{role.name}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{user.className ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANTS[user.status] ?? "default"}>
                      {t(`userStatus_${user.status}`)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-500">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/users/${user.id}`}>
                      <Button variant="ghost" size="icon">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create comprehensive user detail server actions**

Create `src/app/(dashboard)/admin/users/[userId]/actions.ts` with ALL Super Admin actions. Every action:
1. Starts with `const admin = await requireSuperAdmin();`
2. Validates input via Zod
3. Derives `school_id` from `admin.schoolId`
4. Logs to both `audit_logs` and `user_status_history`
5. Calls `revalidatePath()` after mutation

Actions to implement:
- `changeUserRoleAction(userId: string, newRoleId: string)` — validates role exists in same school, removes old role, assigns new, logs change
- `blockUserAction(userId: string)` — sets `status='blocked'`, `is_active=false`; validates user is not self
- `unblockUserAction(userId: string)` — sets `status='active'`, `is_active=true`
- `graduateUserAction(userId: string)` — sets `status='graduated'`, fills graduation fields, calculates `years_in_school` from enrollment count
- `transferClassAction(userId: string, newClassId: string)` — removes old `class_students`, inserts new, upserts `student_enrollments`
- `changeAcademicYearEnrollmentAction(userId: string, academicYearId: string, classId: string)` — upserts `student_enrollments` for the given year
- `assignHomeroomTeacherAction(classId: string, teacherId: string)` — updates `classes.homeroom_teacher_id`
- `editUserDataAction(userId: string, data: { firstName, lastName, middleName })` — updates `users` table fields; `requireSuperAdmin()`
- `approveFromDetailAction(userId: string, roleId: string, classId?: string)` — same logic as Task 7's approve but callable from user detail
- `rejectFromDetailAction(userId: string, reason: string)` — same as Task 7's reject

```typescript
"use server";

import { requireSuperAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const uuidSchema = z.string().uuid();

export async function changeUserRoleAction(userId: string, newRoleId: string) {
  uuidSchema.parse(userId);
  uuidSchema.parse(newRoleId);
  const admin = await requireSuperAdmin();
  if (admin.id === userId) throw new Error("Cannot change own role");
  const supabase = await createServerClient();

  const { data: roleData } = await supabase
    .from("roles" as never)
    .select("id, slug, level, name_tg" as never)
    .eq("id" as never, newRoleId)
    .eq("school_id" as never, admin.schoolId)
    .single();
  const role = roleData as Record<string, unknown> | null;
  if (!role) throw new Error("Invalid role");

  const { data: oldRoles } = await supabase
    .from("user_roles" as never)
    .select("roles:role_id(name_tg)" as never)
    .eq("user_id" as never, userId);
  const oldRoleNames = ((oldRoles ?? []) as Array<Record<string, unknown>>)
    .map((r) => ((r.roles as Record<string, unknown>).name_tg as string))
    .join(", ");

  await supabase.from("user_roles" as never).delete().eq("user_id" as never, userId);
  await supabase.from("user_roles" as never).insert({
    user_id: userId, role_id: newRoleId, school_id: admin.schoolId, assigned_by: admin.id,
  } as never);

  await supabase.from("user_status_history" as never).insert({
    school_id: admin.schoolId, user_id: userId, action: "role_changed",
    old_value: oldRoleNames, new_value: role.name_tg as string, performed_by: admin.id,
  } as never);
  await supabase.from("audit_logs" as never).insert({
    school_id: admin.schoolId, user_id: admin.id, user_public_id: admin.publicId,
    action: "update", entity_type: "user_roles", entity_id: userId,
    old_values: { roles: oldRoleNames }, new_values: { role: role.name_tg },
  } as never);

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

export async function blockUserAction(userId: string) {
  uuidSchema.parse(userId);
  const admin = await requireSuperAdmin();
  if (admin.id === userId) throw new Error("Cannot block self");
  const supabase = await createServerClient();

  const { data: targetUser } = await supabase
    .from("users" as never).select("status" as never).eq("id" as never, userId).single();
  const target = targetUser as Record<string, unknown> | null;
  const oldStatus = (target?.status as string) ?? "active";

  await supabase.from("users" as never)
    .update({ status: "blocked", is_active: false } as never).eq("id" as never, userId);

  await supabase.from("user_status_history" as never).insert({
    school_id: admin.schoolId, user_id: userId, action: "blocked",
    old_value: oldStatus, new_value: "blocked", performed_by: admin.id,
  } as never);
  await supabase.from("audit_logs" as never).insert({
    school_id: admin.schoolId, user_id: admin.id, user_public_id: admin.publicId,
    action: "update", entity_type: "users", entity_id: userId,
    old_values: { status: oldStatus }, new_values: { status: "blocked" },
  } as never);

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

export async function unblockUserAction(userId: string) {
  uuidSchema.parse(userId);
  const admin = await requireSuperAdmin();
  const supabase = await createServerClient();

  await supabase.from("users" as never)
    .update({ status: "active", is_active: true } as never).eq("id" as never, userId);

  await supabase.from("user_status_history" as never).insert({
    school_id: admin.schoolId, user_id: userId, action: "unblocked",
    old_value: "blocked", new_value: "active", performed_by: admin.id,
  } as never);

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

export async function graduateUserAction(userId: string) {
  uuidSchema.parse(userId);
  const admin = await requireSuperAdmin();
  const supabase = await createServerClient();

  const { data: enrollments } = await supabase
    .from("student_enrollments" as never)
    .select("id" as never).eq("student_id" as never, userId);
  const enrollmentCount = (enrollments ?? []).length;
  const currentYear = new Date().getFullYear();

  await supabase.from("users" as never).update({
    status: "graduated", graduation_year: currentYear,
    graduation_date: new Date().toISOString().split("T")[0],
    years_in_school: enrollmentCount > 0 ? enrollmentCount : null,
  } as never).eq("id" as never, userId);

  await supabase.from("user_status_history" as never).insert({
    school_id: admin.schoolId, user_id: userId, action: "graduated",
    old_value: "active", new_value: "graduated", performed_by: admin.id,
    notes: `Graduation year: ${currentYear}`,
  } as never);

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

export async function transferClassAction(userId: string, newClassId: string) {
  uuidSchema.parse(userId);
  uuidSchema.parse(newClassId);
  const admin = await requireSuperAdmin();
  const supabase = await createServerClient();

  const { data: oldAssignment } = await supabase
    .from("class_students" as never)
    .select("classes:class_id(name)" as never)
    .eq("student_id" as never, userId).single();
  const old = oldAssignment as Record<string, unknown> | null;
  const oldClassName = old ? ((old.classes as Record<string, unknown>).name as string) : null;

  await supabase.from("class_students" as never).delete().eq("student_id" as never, userId);
  await supabase.from("class_students" as never).insert({
    class_id: newClassId, student_id: userId, school_id: admin.schoolId,
  } as never);

  const { data: newClass } = await supabase
    .from("classes" as never).select("name, academic_year_id" as never)
    .eq("id" as never, newClassId).single();
  const newCls = newClass as Record<string, unknown> | null;

  if (newCls) {
    await supabase.from("student_enrollments" as never).upsert({
      school_id: admin.schoolId, student_id: userId, class_id: newClassId,
      academic_year_id: newCls.academic_year_id as string, enrolled_by: admin.id,
    } as never, { onConflict: "student_id,academic_year_id" });
  }

  await supabase.from("user_status_history" as never).insert({
    school_id: admin.schoolId, user_id: userId, action: "class_changed",
    old_value: oldClassName, new_value: newCls ? (newCls.name as string) : null,
    performed_by: admin.id,
  } as never);

  revalidatePath(`/admin/users/${userId}`);
}

export async function changeAcademicYearEnrollmentAction(
  userId: string, academicYearId: string, classId: string
) {
  uuidSchema.parse(userId);
  uuidSchema.parse(academicYearId);
  uuidSchema.parse(classId);
  const admin = await requireSuperAdmin();
  const supabase = await createServerClient();

  await supabase.from("student_enrollments" as never).upsert({
    school_id: admin.schoolId, student_id: userId, class_id: classId,
    academic_year_id: academicYearId, enrolled_by: admin.id,
  } as never, { onConflict: "student_id,academic_year_id" });

  const { data: cls } = await supabase
    .from("classes" as never).select("name" as never).eq("id" as never, classId).single();
  const clsRow = cls as Record<string, unknown> | null;
  const { data: yr } = await supabase
    .from("academic_years" as never).select("name" as never).eq("id" as never, academicYearId).single();
  const yrRow = yr as Record<string, unknown> | null;

  await supabase.from("user_status_history" as never).insert({
    school_id: admin.schoolId, user_id: userId, action: "class_changed",
    new_value: `${clsRow?.name ?? ""} (${yrRow?.name ?? ""})`, performed_by: admin.id,
  } as never);

  revalidatePath(`/admin/users/${userId}`);
}

export async function assignHomeroomTeacherAction(classId: string, teacherId: string) {
  uuidSchema.parse(classId);
  uuidSchema.parse(teacherId);
  const admin = await requireSuperAdmin();
  const supabase = await createServerClient();

  const { data: oldClass } = await supabase
    .from("classes" as never).select("homeroom_teacher_id, name" as never)
    .eq("id" as never, classId).single();
  const oldCls = oldClass as Record<string, unknown> | null;

  await supabase.from("classes" as never)
    .update({ homeroom_teacher_id: teacherId } as never)
    .eq("id" as never, classId);

  await supabase.from("audit_logs" as never).insert({
    school_id: admin.schoolId, user_id: admin.id, user_public_id: admin.publicId,
    action: "update", entity_type: "classes", entity_id: classId,
    old_values: { homeroom_teacher_id: oldCls?.homeroom_teacher_id ?? null },
    new_values: { homeroom_teacher_id: teacherId },
  } as never);

  revalidatePath(`/admin/users/${teacherId}`);
}

export async function editUserDataAction(
  userId: string, data: { firstName?: string; lastName?: string; middleName?: string }
) {
  uuidSchema.parse(userId);
  const admin = await requireSuperAdmin();
  const supabase = await createServerClient();

  const { data: oldUser } = await supabase
    .from("users" as never)
    .select("first_name, last_name, middle_name" as never)
    .eq("id" as never, userId).single();
  const old = oldUser as Record<string, unknown> | null;

  const updates: Record<string, unknown> = {};
  if (data.firstName !== undefined) updates.first_name = data.firstName;
  if (data.lastName !== undefined) updates.last_name = data.lastName;
  if (data.middleName !== undefined) updates.middle_name = data.middleName || null;

  if (Object.keys(updates).length === 0) return;

  await supabase.from("users" as never).update(updates as never).eq("id" as never, userId);

  await supabase.from("audit_logs" as never).insert({
    school_id: admin.schoolId, user_id: admin.id, user_public_id: admin.publicId,
    action: "update", entity_type: "users", entity_id: userId,
    old_values: { first_name: old?.first_name, last_name: old?.last_name, middle_name: old?.middle_name },
    new_values: updates,
  } as never);

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}
```

- [ ] **Step 5: Rewrite user detail page.tsx to fetch comprehensive user data**

Replace `src/app/(dashboard)/admin/users/[userId]/page.tsx` to fetch ALL required data:
- User record with all fields including `status`, `created_at`, graduation fields
- User roles (with role details)
- Current class (from `class_students` → `classes` → `academic_years`)
- Registration request (for `reviewed_at` / approval date)
- Student enrollments with class + academic year names
- User status history (chronological)
- Available roles (for role change dropdown)
- Available classes (for class change dropdown)
- Available academic years (for enrollment management)
- Available teachers (for homeroom teacher assignment)
- Whether current user is Super Admin (to show/hide management actions)

All data passed as props to `<UserDetail>`.

- [ ] **Step 6: Rewrite user-detail.tsx as comprehensive management card**

Replace `src/app/(dashboard)/admin/users/[userId]/user-detail.tsx` with a full-featured component:

**Layout: Two-column on desktop, single on mobile**

**Left column — User Info Card:**
- Large avatar (96px) with initials fallback
- Full name (editable inline by Super Admin)
- Email
- Public ID
- Status badge (color-coded)
- Current role badge
- Current class (if student)
- Academic year

**Right column — Details & Dates:**
- Registration date (`users.created_at`)
- Approval date (from `registration_requests.reviewed_at` or `user_status_history`)
- Enrollment date (first `student_enrollments.enrolled_at`)
- Graduation date (if graduated)
- Years in school (if graduated)

**Action buttons (only shown to Super Admin, below info cards):**
- "Change Role" — opens dropdown with all available roles
- "Change Class" — opens dropdown with classes from current year (students only)
- "Block" / "Unblock" — with ConfirmDialog for block
- "Graduate" — with ConfirmDialog (students only)
- "Edit Data" — opens inline editing for name fields
- "Assign Homeroom Teacher" — dropdown of teachers (shown on teacher's card or class context)

**Enrollment History section (below actions):**
- Timeline of `student_enrollments` entries: academic year → class name
- Each with enrolled date and enrolled-by admin name

**Status History section (below enrollment):**
- Chronological list of `user_status_history` entries
- Each shows: action, old → new values, performed by, date, notes

**Pending user actions (shown only when `status === 'pending'`):**
- "Approve" button (with role/class selection)
- "Reject" button (with ConfirmDialog + reason textarea)

```tsx
// Key imports
"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  changeUserRoleAction, blockUserAction, unblockUserAction,
  graduateUserAction, transferClassAction, editUserDataAction,
} from "./actions";
// ... full component implementation with all sections described above
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd /Users/mehrovar/Desktop/maktabi-miyona-7
npx tsc --noEmit --pretty 2>&1 | tail -20
```

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/confirm-dialog.tsx src/app/\(dashboard\)/admin/users/
git commit -m "feat: Super Admin user management center with full control

- Users list with status/role filter tabs, search, class column, dates
- Comprehensive user detail card: photo, name, email, role, status, class,
  academic year, registration/approval/enrollment dates, change history
- Super Admin actions: change role, change class, block/unblock, graduate,
  edit registration data, assign homeroom teacher
- All actions via server actions with requireSuperAdmin() + Zod validation
- Confirmation dialogs for block, reject, and graduate (dangerous actions)
- Self-protection: cannot change own role or block self
- All mutations logged to audit_logs + user_status_history
- school_id always derived server-side from admin.schoolId"
```

---

### Task 9: Admin Graduates Page

**Files:**
- Create: `src/app/(dashboard)/admin/graduates/page.tsx`
- Create: `src/app/(dashboard)/admin/graduates/graduates-list.tsx`
- Modify: `src/app/(dashboard)/admin/admin-nav.tsx`

**Interfaces:**
- Consumes: `requireAdmin()`, `createServerClient()`; `users` table with `status = 'graduated'`, `student_enrollments`
- Produces: `/admin/graduates` page with searchable, filterable graduate list

- [ ] **Step 1: Create graduates list component**

Create `src/app/(dashboard)/admin/graduates/graduates-list.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { GraduationCap, Search } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface Graduate {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  email: string;
  avatarUrl: string | null;
  graduationYear: number | null;
  yearsInSchool: number | null;
  lastClass: string | null;
  publicId: string;
}

export function GraduatesList({ graduates }: { graduates: Graduate[] }) {
  const t = useTranslations("admin");
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState<string>("all");

  const years = [...new Set(graduates.map((g) => g.graduationYear).filter(Boolean))] as number[];
  years.sort((a, b) => b - a);

  const filtered = graduates.filter((g) => {
    if (yearFilter !== "all" && g.graduationYear !== Number(yearFilter)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      g.firstName.toLowerCase().includes(q) ||
      g.lastName.toLowerCase().includes(q) ||
      g.email.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            placeholder={t("search" as never) ?? "Search..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
        >
          <option value="all">{t("graduationYear")}</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-12 w-12" />}
          title={t("noGraduates")}
          description={t("noGraduatesDesc")}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <th className="px-4 py-3 text-left font-medium text-neutral-600">{t("userDetails")}</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">{t("graduationYear")}</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">{t("requestedClass")}</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">{t("yearsInSchool")}</th>
                <th className="px-4 py-3 text-right font-medium text-neutral-600" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((g) => (
                <tr key={g.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-100">
                        {g.avatarUrl ? (
                          <img src={g.avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-xs font-semibold text-primary-700">
                            {g.firstName[0]}{g.lastName[0]}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-neutral-800">
                          {g.firstName} {g.lastName} {g.middleName ?? ""}
                        </p>
                        <p className="text-xs text-neutral-500">{g.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary">{g.graduationYear ?? "—"}</Badge>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{g.lastClass ?? "—"}</td>
                  <td className="px-4 py-3 text-neutral-700">{g.yearsInSchool ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/users/${g.id}`}>
                      <Button variant="ghost" size="sm">
                        {t("enrollmentHistory")}
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create graduates page**

Create `src/app/(dashboard)/admin/graduates/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/guard";
import { createServerClient } from "@/lib/supabase/server";
import { AdminNav } from "../admin-nav";
import { GraduatesList } from "./graduates-list";

async function getGraduates(schoolId: string) {
  const supabase = await createServerClient();

  const { data } = await supabase
    .from("users" as never)
    .select("id, public_id, first_name, last_name, middle_name, email, avatar_url, graduation_year, years_in_school" as never)
    .eq("status" as never, "graduated")
    .order("graduation_year" as never, { ascending: false });

  const graduatesArr = (data ?? []) as Array<Record<string, unknown>>;

  const withClasses = await Promise.all(
    graduatesArr.map(async (g) => {
      const { data: lastEnrollment } = await supabase
        .from("student_enrollments" as never)
        .select("classes:class_id(name)" as never)
        .eq("student_id" as never, g.id as string)
        .order("created_at" as never, { ascending: false })
        .limit(1)
        .single();

      const enrollment = lastEnrollment as Record<string, unknown> | null;
      const cls = enrollment?.classes as Record<string, unknown> | null;

      return {
        id: g.id as string,
        publicId: g.public_id as string,
        firstName: g.first_name as string,
        lastName: g.last_name as string,
        middleName: (g.middle_name as string) ?? null,
        email: g.email as string,
        avatarUrl: (g.avatar_url as string) ?? null,
        graduationYear: (g.graduation_year as number) ?? null,
        yearsInSchool: (g.years_in_school as number) ?? null,
        lastClass: cls ? (cls.name as string) : null,
      };
    })
  );

  return withClasses;
}

export default async function GraduatesPage() {
  const admin = await requireAdmin();
  const t = await getTranslations("admin");
  const graduates = await getGraduates(admin.schoolId);

  return (
    <div>
      <AdminNav />
      <div className="animate-in">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-neutral-900">{t("graduates")}</h1>
          <p className="mt-1 text-sm text-neutral-500">{t("graduatesList")}</p>
        </div>
        <GraduatesList graduates={graduates} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add graduates to admin nav**

In `src/app/(dashboard)/admin/admin-nav.tsx`, add after the classes entry:

```typescript
  { label: "admin.graduates", href: "/admin/graduates", icon: GraduationCap },
```

(GraduationCap is already imported.)

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/mehrovar/Desktop/maktabi-miyona-7
npx tsc --noEmit --pretty 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/admin/graduates/ src/app/\(dashboard\)/admin/admin-nav.tsx
git commit -m "feat: add admin graduates page with search and year filter

- /admin/graduates lists all graduated students
- Shows name, email, graduation year, last class, years in school
- Filter by graduation year, search by name/email
- Link to user detail for full enrollment history
- Added 'Graduates' to admin nav"
```

---

### Task 10: Build Verification, Security Audit, and Super Admin Password

**Files:**
- No new files — verification task

**Interfaces:**
- Consumes: All prior tasks
- Produces: Verified build, security audit results

- [ ] **Step 1: TypeScript check**

```bash
cd /Users/mehrovar/Desktop/maktabi-miyona-7
npx tsc --noEmit --pretty
```

Expected: No errors.

- [ ] **Step 2: Production build**

```bash
cd /Users/mehrovar/Desktop/maktabi-miyona-7
npx next build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Security audit — service_role never in client bundle**

```bash
cd /Users/mehrovar/Desktop/maktabi-miyona-7
grep -rn "SUPABASE_SERVICE_ROLE_KEY" src/ --include="*.ts" --include="*.tsx" | grep -v "server\.\|admin\.\|actions\.\|storage\." | head -10
```

Expected: No matches (service_role key only used in server files).

- [ ] **Step 4: Security audit — admin roles not requestable via registration**

```bash
cd /Users/mehrovar/Desktop/maktabi-miyona-7
grep -n "level.*<=.*1\|level.*>.*1\|gt.*level.*1" src/app/\(public\)/register/
```

Expected: Server action validates `role.level > 1`; data.ts fetches only roles with `level > 1`.

- [ ] **Step 5: Security audit — school_id never from client**

```bash
cd /Users/mehrovar/Desktop/maktabi-miyona-7
grep -n "school_id.*formData\|schoolId.*formData" src/app/\(public\)/register/actions.ts
```

Expected: No matches — school_id comes from `DEFAULT_SCHOOL_ID` constant or admin's `schoolId`.

- [ ] **Step 6: Security audit — RLS policies exist**

```bash
cd /Users/mehrovar/Desktop/maktabi-miyona-7
grep "registration_requests\|student_enrollments\|user_status_history" supabase/migrations/00016_*.sql | grep "POLICY\|ENABLE ROW"
```

Expected: RLS enabled and policies defined for all three new tables.

- [ ] **Step 7: Set Super Admin password**

The Super Admin password (`10012009` for `mtmuraqami7@gmail.com`) must be set through Supabase Auth, not stored in code. This requires a manual step:

**Option A (Supabase Dashboard):** Go to Authentication → Users → find `mtmuraqami7@gmail.com` → update password to `10012009`.

**Option B (SQL Editor in Supabase Dashboard):**
```sql
-- Run in Supabase SQL Editor (not committed to code)
SELECT auth.uid(); -- verify you're connected
UPDATE auth.users
SET encrypted_password = crypt('10012009', gen_salt('bf'))
WHERE email = 'mtmuraqami7@gmail.com';
```

**NEVER commit this password to the codebase.** Document it in a secure location only.

- [ ] **Step 8: Commit final state**

```bash
cd /Users/mehrovar/Desktop/maktabi-miyona-7
git status
git log --oneline -10
```

Verify all tasks are committed and no untracked files remain.
