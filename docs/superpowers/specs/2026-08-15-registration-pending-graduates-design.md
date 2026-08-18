# Registration, Pending Users, Enrollment History & Graduates — Design Spec

## 1. Overview

**Goal:** Replace the invitation-code-only registration with an open registration flow where users select their role, verify via OTP, fill in profile details, and enter a pending queue for Super Admin approval. Add student enrollment history tracking, graduate management, and comprehensive user lifecycle management.

**Constraints:**
- Must not break existing auth flows (login, password reset OTP, invitation codes)
- Must not weaken existing RLS, Super Admin protections, or school-scoping
- `is_super_admin` can never be obtained through registration — only via existing Super Admin + service_role
- Admin/super_admin roles cannot be self-assigned through registration
- `school_id` never comes from the client — always derived server-side from the school's config
- All UI strings go through next-intl (tg/ru/en)
- service_role key stays server-side only

**Key architectural decisions informed by existing codebase:**
- Users are differentiated by `user_roles`, not separate student/teacher tables
- `class_students` already links students to classes; `teacher_subjects` links teachers
- `academic_years` table exists with `is_current` flag
- `audit_logs` table exists and is immutable — reuse it for all admin actions
- `classes` has `grade_level` (1-11) and `academic_year_id`
- Super admin is protected by trigger `trg_protect_super_admin` (service_role only)
- Invitation codes are blocked from granting admin-level roles by `trg_check_invitation_role_level`

---

## 2. Database Changes

### 2.1 New Table: `registration_requests`

Stores pending user registrations before admin approval.

```sql
CREATE TABLE public.registration_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  middle_name TEXT,
  avatar_url TEXT,
  requested_role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  requested_class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
  enrollment_year INT,
  additional_data JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- `auth_user_id` is set after Supabase Auth account creation (OTP verification creates the auth user)
- `requested_role_id` references existing `roles` table — no hardcoded roles
- `requested_class_id` only for students; NULL for other roles
- `additional_data` JSONB for teacher subjects, etc. without schema proliferation
- `status` is the pending lifecycle: pending → approved or rejected
- School-scoped with RLS

**Trigger:** Prevent requesting admin-level roles (level ≤ 1) at registration — same logic as `trg_check_invitation_role_level`.

### 2.2 New Table: `student_enrollments`

Tracks student class history across academic years.

```sql
CREATE TABLE public.student_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  enrolled_by UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(student_id, academic_year_id)
);
```

- One enrollment per student per academic year
- Links to `classes` (which already has `grade_level` and `academic_year_id`)
- `enrolled_by` tracks which admin made the assignment
- Cross-school trigger to validate all FKs share the same school

### 2.3 New Table: `user_status_history`

Tracks important user lifecycle changes.

```sql
CREATE TABLE public.user_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL
    CHECK (action IN ('registered', 'approved', 'rejected', 'role_changed',
      'class_changed', 'graduated', 'blocked', 'unblocked', 'reactivated')),
  old_value TEXT,
  new_value TEXT,
  performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- Immutable (trigger prevents UPDATE/DELETE, like `audit_logs`)
- Records role changes, class transfers, graduation, blocking
- Complements `audit_logs` with user-focused history

### 2.4 Modify `users` Table

Add a `status` column for user lifecycle:

```sql
ALTER TABLE public.users
  ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending', 'approved', 'active', 'blocked', 'graduated', 'rejected'));
```

- Existing users get `status = 'active'` (via DEFAULT)
- New registrations start as `pending`
- After admin approval: `approved` → then `active` on first login (or immediately)
- Graduates: `graduated`
- `is_active` column remains for soft-delete; `status` is for lifecycle

Add graduation fields:

```sql
ALTER TABLE public.users
  ADD COLUMN graduation_year INT,
  ADD COLUMN graduation_date DATE,
  ADD COLUMN years_in_school INT;
```

### 2.5 RLS Policies

**registration_requests:**
- Users can INSERT their own (auth.uid() matches the email being registered, or auth_user_id)
- Users can SELECT their own request
- Admins can SELECT/UPDATE all requests in their school
- No user can UPDATE status — only admins via server action with service_role or admin RLS

**student_enrollments:**
- Students can SELECT their own enrollments
- Admins can full CRUD within their school
- Teachers can SELECT enrollments in their classes

**user_status_history:**
- Users can SELECT their own history
- Admins can SELECT all in school
- INSERT only by admins (or service_role)
- No UPDATE/DELETE (immutable)

---

## 3. Registration Flow (Redesigned)

### Current Flow (kept for invitation-code users)
email → OTP → invitation code + name + password → immediate dashboard access

### New Flow (open registration)
1. **Step 1: Email + Role Selection**
   - User enters email
   - User selects role from available roles (loaded from DB `roles` table where `is_active = true`)
   - Roles with `level ≤ 1` (admin) are **hidden** — cannot be selected
   - If role is "student": show class selection (from `classes` where `academic_year_id` = current year)
   - If role is "teacher": optional subject selection

2. **Step 2: OTP Verification**
   - 6-digit OTP sent to email via `signInWithOtp({ shouldCreateUser: true })`
   - User enters OTP code
   - On success: auth user is created in Supabase Auth

3. **Step 3: Profile Completion**
   - First name, last name, middle name
   - Password + confirm password
   - Avatar/photo upload (Supabase Storage)
   - For students: class and enrollment year (pre-filled from step 1)
   - For teachers: subjects (multi-select from `subjects` table)

4. **Step 4: Submission → Pending**
   - Server action creates `registration_requests` entry with `status = 'pending'`
   - Creates `users` entry with `status = 'pending'` and `is_active = false`
   - Does NOT create `user_roles` entry yet (that happens on approval)
   - Redirects to `/pending` page

### Registration Mode Selection

The registration page will detect whether the user has an invitation code:
- **With invitation code:** existing flow (immediate access, no pending)
- **Without invitation code:** new flow (pending approval)

Both flows share the same OTP step. The invitation code flow skips role selection (role comes from the code).

### The `/pending` Page

A friendly waiting page shown to users whose `status = 'pending'`:
- School branding
- Message: "Ваша заявка отправлена администрации школы. Пожалуйста, ожидайте одобрения."
- Animated illustration or friendly empty state
- User can log out

**Middleware change:** When an authenticated user with `status = 'pending'` tries to access dashboard routes, redirect them to `/pending`.

---

## 4. Admin: Pending Users

### Route: `/admin/pending`

New admin page showing all registration requests with `status = 'pending'`.

**List View:**
- Card/table layout (responsive)
- Each entry shows: avatar, name, email, requested role, requested class, enrollment year, registration date
- Filter by role, date
- Search by name/email

**Detail View / Actions:**
- **Approve:** 
  - Admin can change the role before approving
  - Admin can assign/change class for students
  - Creates `user_roles` entry
  - For students: creates `class_students` and `student_enrollments` entries
  - For teachers: creates `teacher_subjects` entries if subjects specified
  - Sets `users.status = 'active'`, `users.is_active = true`
  - Sets `registration_requests.status = 'approved'`
  - Logs to `audit_logs` and `user_status_history`

- **Reject:**
  - Admin provides rejection reason
  - Sets `registration_requests.status = 'rejected'`
  - Sets `users.status = 'rejected'`
  - User cannot access dashboard
  - Logs to `audit_logs` and `user_status_history`

- **Modify Before Approval:**
  - Change requested role
  - Change/assign class
  - Edit name fields

All actions require `requireSuperAdmin()` or `requireAdmin()` guard + server-side validation.

---

## 5. Admin: Users Management Enhancement

### Route: `/admin/users` (existing, enhanced)

**New Filters:**
- All / Pending / Active / Students / Teachers / Directors / Vice Principals / Administrators / Graduates / Blocked / Rejected

**New Actions per User:**
- Change role (with `requireSuperAdmin()` for elevated roles)
- Change class (for students)
- Transfer to different class
- Block / Unblock
- Mark as graduated
- View full history

**Role Change Guard:**
- Only Super Admin can change roles to/from admin, director, vice_principal
- Role changes are logged to `user_status_history` and `audit_logs`
- Cannot self-promote to admin/super_admin

---

## 6. Student Enrollment History

Each student has an enrollment timeline:
```
2024-2025 → 8-А
2025-2026 → 9-А  
2026-2027 → 10-А
2027-2028 → 11-А → Graduated
```

**Visible in:**
- Admin user detail page
- Student's own profile
- Graduates section

**Admin can:**
- Add enrollment for a year
- Transfer student to different class
- Each change is logged in `student_enrollments` + `user_status_history`

---

## 7. Graduates

### Route: `/admin/graduates`

**Entry Criteria:**
- Admin manually marks a student as graduated (not automatic based on class = 11)
- Sets `users.status = 'graduated'`
- Sets `graduation_year`, `graduation_date`, `years_in_school`
- Logs to `user_status_history`

**Graduate Record Contains:**
- Full name, photo, email
- Enrollment year (from first `student_enrollments` entry)
- Graduation year
- Last class (grade + section letter)
- Academic year of graduation
- Years in school (calculated from enrollment history)
- Full enrollment history

**Filters:** By graduation year, class, search by name
**Graduates remain in the `users` table** with `status = 'graduated'` — never deleted.

---

## 8. Academic Year Handling

Academic years already exist in the DB. The system must:
- Use `academic_years.is_current` to determine the current year
- Classes are always scoped to an academic year
- Student enrollments link student → class → academic year
- When filtering classes for registration, only show classes from the current academic year
- 11-А in 2026-2027 is different from 11-А in 2027-2028 (different `classes` rows with different `academic_year_id`)

---

## 9. Photo Upload

New capability needed. Use Supabase Storage:
- Bucket: `avatars` (public or with signed URLs)
- Upload during registration (step 3) and in profile edit
- Server action validates: max 2MB, image types only (jpg/png/webp)
- Stores URL in `users.avatar_url` or `registration_requests.avatar_url`

---

## 10. Super Admin Protection

Existing protections (kept and reinforced):
1. **DB Trigger** `trg_protect_super_admin`: Only `service_role` can set `is_super_admin = true`
2. **DB Trigger** `trg_check_invitation_role_level`: Invitation codes can't grant admin roles
3. **New DB Trigger**: Registration requests can't request admin-level roles
4. **Server Action guard**: `requireSuperAdmin()` for all elevated operations
5. **UI**: Admin/super_admin roles hidden from registration role picker
6. **RLS**: Users cannot update their own `is_super_admin`, `status`, or `role`

Super Admin `mtmuraqami7@gmail.com` password update: Use `supabase.auth.admin.updateUserById()` via a one-time migration or manual Supabase dashboard action. Password `10012009` set via Supabase Auth (hashed, never stored plaintext).

---

## 11. Security Rules Summary

| Rule | Enforcement |
|------|------------|
| No self-role-elevation | RLS + server action guards |
| No client-provided school_id | Server derives from school config |
| No admin via registration | DB trigger + UI hiding + server validation |
| No super_admin via registration | DB trigger (service_role only) |
| Pending users can't access dashboard | Middleware redirect |
| Role changes logged | audit_logs + user_status_history |
| Immutable history | DB triggers prevent UPDATE/DELETE |
| Service role server-only | admin.ts uses env var, never in client bundle |

---

## 12. i18n Keys (new)

New namespace groups needed:
- `registration` — role selection, pending message, class selection
- `pending` — waiting page messages
- `admin.pending` — pending users management
- `admin.graduates` — graduates section
- `admin.enrollment` — enrollment history
- `admin.userActions` — approve/reject/role change actions

All in tg.json, ru.json, en.json.

---

## 13. File Structure (new/modified)

```
src/app/(public)/register/        # Modified: add role selection, class picker
src/app/(public)/pending/         # NEW: pending waiting page
src/app/(dashboard)/admin/pending/   # NEW: admin pending users
src/app/(dashboard)/admin/graduates/ # NEW: admin graduates
src/app/(dashboard)/admin/users/     # Modified: enhanced filters, role mgmt
src/lib/supabase/storage.ts          # NEW: file upload helpers
src/components/ui/file-upload.tsx    # NEW: avatar upload component
supabase/migrations/00016_*.sql      # NEW: registration_requests, student_enrollments, user_status_history, users.status
```
