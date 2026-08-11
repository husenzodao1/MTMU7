# МТМУ №7 — School Platform Design Specification

## 1. Overview

**Project:** Full-featured school information platform for МТМУ №7  
**School short name:** МТМУ №7  
**School full name:** Мактаби Таълимии Миёнаи Умумии №7 ба номи Мирзие Ҳабибов  
**Default language:** Tajik (tg)  
**Architecture:** Multi-tenant, production-ready SaaS  

### Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (latest stable, App Router, Server Components) |
| Language | TypeScript (strict mode) |
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth |
| File Storage | Supabase Storage |
| Realtime | Supabase Realtime |
| Styling | Tailwind CSS |
| i18n | next-intl (default: tg, secondary: ru) |
| Forms/Validation | React Hook Form + Zod |
| Icons | Lucide React |
| Deployment | Vercel (frontend) + Supabase Cloud (backend) |

### Key Principles

- Server Components by default; Client Components only where interactivity, browser APIs, realtime, or client-side state are required
- No global state manager; React Context + server state via Supabase. Additional state manager only if architecture demands it
- No external libraries or CDNs without concrete technical justification
- No hardcoded texts in components — all UI text goes through next-intl
- `service_role` key never in client bundle — server-side only
- Zod validation on server is security; client-side Zod/RHF is UX only
- Architecture must support scaling and migration from free tier without rewrite

---

## 2. Project Structure

```
maktabi-miyona-7/
├── src/
│   ├── app/
│   │   ├── (public)/              # Public pages (login, about school)
│   │   ├── (dashboard)/           # Protected pages (post-login)
│   │   │   ├── dashboard/
│   │   │   ├── messages/
│   │   │   ├── library/
│   │   │   ├── notifications/
│   │   │   ├── profile/
│   │   │   └── ...modules
│   │   ├── (admin)/               # Admin Panel (admin role only)
│   │   │   ├── admin/
│   │   │   │   ├── users/
│   │   │   │   ├── roles/
│   │   │   │   ├── school/
│   │   │   │   ├── modules/
│   │   │   │   ├── library/
│   │   │   │   ├── content/
│   │   │   │   ├── notifications/
│   │   │   │   ├── audit/
│   │   │   │   └── settings/
│   │   └── api/                   # API Routes (service_role operations)
│   ├── components/
│   │   ├── ui/                    # Base design system (Button, Input, Card, Dialog, Table, etc.)
│   │   └── modules/               # Module-specific (MessageBubble, BookCard, etc.)
│   ├── lib/
│   │   ├── supabase/              # Supabase client (server/client/admin)
│   │   ├── auth/                  # Auth helpers
│   │   ├── permissions/           # RBAC check utilities
│   │   ├── modules/               # Feature management utilities
│   │   └── utils/                 # General utilities
│   ├── config/
│   │   ├── school.ts              # School config constants (defaults)
│   │   ├── modules.ts             # Module registry
│   │   └── permissions.ts         # Permission slugs registry
│   ├── hooks/                     # React hooks
│   ├── types/                     # TypeScript types
│   ├── i18n/
│   │   ├── tg.json                # Tajik (default, complete)
│   │   └── ru.json                # Russian (secondary)
│   └── styles/
│       └── globals.css            # Tailwind + design tokens
├── supabase/
│   ├── migrations/                # SQL migrations
│   ├── seed.sql                   # Seed data
│   └── config.toml
├── public/                        # Static assets
└── docs/
```

---

## 3. Multi-Tenant Architecture

### Tenant = School

Every business table contains `school_id UUID FK → schools(id) ON DELETE RESTRICT`.

Exceptions (global tables):
- `permissions` — global permission catalog, same for all schools
- `modules` — global module catalog

### Isolation Layers

1. **Database (RLS):** Every RLS policy includes `school_id = current_user_school_id()`. Users never see data from another school.
2. **Cross-school triggers:** 21 PostgreSQL triggers validate that all FK references within a row belong to the same school. No object can reference an object from a different school.
3. **Application layer:** API routes and server actions verify school_id matches authenticated user's school before any operation.

### School Deletion

Physical DELETE of schools is prohibited by trigger. Schools are deactivated via `is_active = false` + `deactivated_at` timestamp. All related data remains protected.

---

## 4. Database Schema

### 4.1 schools

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| short_name | VARCHAR(100) | NOT NULL |
| full_name | VARCHAR(500) | NOT NULL |
| slug | VARCHAR(100) | UNIQUE NOT NULL |
| logo_url | VARCHAR(500) | NULLABLE |
| description_tg | TEXT | NULLABLE |
| description_ru | TEXT | NULLABLE |
| address | VARCHAR(500) | NULLABLE |
| phone | VARCHAR(50) | NULLABLE |
| email | VARCHAR(255) | NULLABLE |
| website | VARCHAR(255) | NULLABLE |
| id_prefix | VARCHAR(5) | NOT NULL DEFAULT 'MT', CHECK len >= 1 |
| id_sequence | BIGINT | NOT NULL DEFAULT 10000, CHECK >= 0 |
| is_active | BOOLEAN | NOT NULL DEFAULT true |
| deactivated_at | TIMESTAMPTZ | NULLABLE |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

Default values: short_name='МТМУ №7', full_name='Мактаби Таълимии Миёнаи Умумии №7 ба номи Мирзие Ҳабибов', id_prefix='MT'.

### 4.2 users

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK (from Supabase Auth auth.users.id) |
| school_id | UUID | FK → schools(id) ON DELETE RESTRICT, NOT NULL |
| public_id | VARCHAR(32) | UNIQUE NOT NULL |
| email | VARCHAR(255) | UNIQUE NOT NULL (globally unique, tied to auth.users) |
| first_name | VARCHAR(100) | NOT NULL |
| last_name | VARCHAR(100) | NOT NULL |
| middle_name | VARCHAR(100) | NULLABLE |
| avatar_url | VARCHAR(500) | NULLABLE |
| phone | VARCHAR(50) | NULLABLE |
| date_of_birth | DATE | NULLABLE |
| gender | VARCHAR(10) | NULLABLE, CHECK IN ('male', 'female') |
| is_active | BOOLEAN | NOT NULL DEFAULT true |
| deactivated_at | TIMESTAMPTZ | NULLABLE |
| last_login_at | TIMESTAMPTZ | NULLABLE |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

**public_id generation:** PostgreSQL trigger `generate_public_id()` BEFORE INSERT atomically increments `schools.id_sequence` via `UPDATE ... RETURNING`, concatenates current `id_prefix` + new number. UNIQUE constraint guarantees no duplicates. Changing `id_prefix` later affects only new users; existing IDs remain unchanged.

**Email uniqueness:** Global UNIQUE. One auth account = one user = one school. Future multi-school membership via separate `user_school_memberships` table without changing email uniqueness.

**Indexes:** idx_users_school_id, idx_users_school_active(school_id, is_active).

### 4.3 roles

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| school_id | UUID | FK → schools RESTRICT, NOT NULL |
| slug | VARCHAR(50) | NOT NULL |
| name_tg | VARCHAR(100) | NOT NULL |
| name_ru | VARCHAR(100) | NULLABLE |
| level | INT | NOT NULL, CHECK 1-100 |
| is_system | BOOLEAN | NOT NULL DEFAULT false |
| is_active | BOOLEAN | NOT NULL DEFAULT true |
| deactivated_at | TIMESTAMPTZ | NULLABLE |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

UNIQUE(school_id, slug). System roles (is_system=true) cannot be deleted (trigger).

**5 default system roles per school:**

| slug | name_tg | level |
|---|---|---|
| admin | Администратор | 1 |
| director | Директор | 2 |
| vice_principal | Завуч | 3 |
| teacher | Муаллим | 4 |
| student | Хонанда | 5 |

### 4.4 permissions

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| slug | VARCHAR(100) | UNIQUE NOT NULL |
| module | VARCHAR(50) | NOT NULL |
| action | VARCHAR(20) | NOT NULL, CHECK IN ('read','create','update','delete','manage') |
| name_tg | VARCHAR(200) | NOT NULL |
| name_ru | VARCHAR(200) | NULLABLE |
| description | TEXT | NULLABLE |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

Global table — same permissions for all schools. Indexes: idx_permissions_module, idx_permissions_module_action.

### 4.5 user_roles

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK → users CASCADE, NOT NULL |
| role_id | UUID | FK → roles RESTRICT, NOT NULL |
| school_id | UUID | FK → schools RESTRICT, NOT NULL |
| assigned_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| assigned_by | UUID | FK → users SET NULL, NULLABLE |

UNIQUE(user_id, role_id, school_id). Indexes: idx_user_roles_user, idx_user_roles_school_user.

**Trigger `validate_user_role_school_match`:** Verifies `users.school_id = roles.school_id = NEW.school_id`.

### 4.6 role_permissions

| Column | Type | Constraints |
|---|---|---|
| role_id | UUID | FK → roles CASCADE, NOT NULL |
| permission_id | UUID | FK → permissions CASCADE, NOT NULL |

PK(role_id, permission_id).

### 4.7 modules

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| slug | VARCHAR(50) | UNIQUE NOT NULL |
| name_tg | VARCHAR(100) | NOT NULL |
| name_ru | VARCHAR(100) | NULLABLE |
| description_tg | TEXT | NULLABLE |
| description_ru | TEXT | NULLABLE |
| icon | VARCHAR(50) | NULLABLE (Lucide icon name) |
| route | VARCHAR(100) | NULLABLE |
| is_system | BOOLEAN | NOT NULL DEFAULT false |
| sort_order | INT | NOT NULL DEFAULT 0 |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

Global catalog. Initial modules: messages, library, grades, attendance, homework, schedule, documents, events, announcements, reports, analytics.

### 4.8 school_modules

| Column | Type | Constraints |
|---|---|---|
| school_id | UUID | FK → schools RESTRICT, NOT NULL |
| module_id | UUID | FK → modules CASCADE, NOT NULL |
| is_enabled | BOOLEAN | NOT NULL DEFAULT true |
| enabled_at | TIMESTAMPTZ | NULLABLE |
| disabled_at | TIMESTAMPTZ | NULLABLE |
| updated_by | UUID | FK → users SET NULL, NULLABLE |

PK(school_id, module_id).

### 4.9 module_role_access

| Column | Type | Constraints |
|---|---|---|
| school_id | UUID | FK → schools RESTRICT, NOT NULL |
| module_id | UUID | FK → modules CASCADE, NOT NULL |
| role_id | UUID | FK → roles CASCADE, NOT NULL |
| is_visible | BOOLEAN | NOT NULL DEFAULT true |

PK(school_id, module_id, role_id).

**Trigger:** `roles.school_id = NEW.school_id`.

### 4.10 academic_years

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| school_id | UUID | FK → schools RESTRICT, NOT NULL |
| name | VARCHAR(20) | NOT NULL |
| start_date | DATE | NOT NULL |
| end_date | DATE | NOT NULL |
| is_current | BOOLEAN | NOT NULL DEFAULT false |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

UNIQUE(school_id, name). CHECK(end_date > start_date). Partial unique index: `UNIQUE(school_id) WHERE is_current = true` — max one current year per school.

### 4.11 classes

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| school_id | UUID | FK → schools RESTRICT, NOT NULL |
| academic_year_id | UUID | FK → academic_years RESTRICT, NOT NULL |
| name | VARCHAR(20) | NOT NULL |
| grade_level | INT | NOT NULL, CHECK 1-11 |
| homeroom_teacher_id | UUID | FK → users SET NULL, NULLABLE |
| is_active | BOOLEAN | NOT NULL DEFAULT true |
| deactivated_at | TIMESTAMPTZ | NULLABLE |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

UNIQUE(school_id, academic_year_id, name). Indexes: idx_classes_school_year, idx_classes_school_active.

**Trigger `validate_class_school`:** academic_years.school_id = NEW.school_id. If homeroom_teacher_id set: users.school_id = NEW.school_id AND user has role slug IN ('teacher', 'vice_principal', 'director').

### 4.12 subjects

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| school_id | UUID | FK → schools RESTRICT, NOT NULL |
| name_tg | VARCHAR(200) | NOT NULL |
| name_ru | VARCHAR(200) | NULLABLE |
| code | VARCHAR(20) | NULLABLE |
| is_active | BOOLEAN | NOT NULL DEFAULT true |
| deactivated_at | TIMESTAMPTZ | NULLABLE |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

UNIQUE(school_id, code) WHERE code IS NOT NULL.

### 4.13 class_students

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| class_id | UUID | FK → classes CASCADE, NOT NULL |
| student_id | UUID | FK → users CASCADE, NOT NULL |
| school_id | UUID | FK → schools RESTRICT, NOT NULL |
| enrolled_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

UNIQUE(class_id, student_id).

**Trigger `validate_class_student_school`:** classes.school_id = users.school_id = NEW.school_id. User must have role slug='student' in same school.

### 4.14 teacher_subjects

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| teacher_id | UUID | FK → users CASCADE, NOT NULL |
| subject_id | UUID | FK → subjects CASCADE, NOT NULL |
| class_id | UUID | FK → classes CASCADE, NOT NULL |
| school_id | UUID | FK → schools RESTRICT, NOT NULL |
| academic_year_id | UUID | FK → academic_years RESTRICT, NOT NULL |

UNIQUE(teacher_id, subject_id, class_id, academic_year_id).

**Trigger `validate_teacher_subject_school`:** All FK school_ids must match NEW.school_id. User must have role slug IN ('teacher', 'vice_principal', 'director') — admin is NOT a teaching role.

### 4.15 conversations

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| school_id | UUID | FK → schools RESTRICT, NOT NULL |
| type | VARCHAR(20) | NOT NULL, CHECK IN ('direct','group','class_group','announcement') |
| name | VARCHAR(200) | NULLABLE |
| avatar_url | VARCHAR(500) | NULLABLE |
| class_id | UUID | FK → classes SET NULL, NULLABLE |
| created_by | UUID | FK → users SET NULL, NULLABLE |
| is_active | BOOLEAN | NOT NULL DEFAULT true |
| deactivated_at | TIMESTAMPTZ | NULLABLE |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

**Trigger:** If class_id set: classes.school_id = NEW.school_id. If created_by set: users.school_id = NEW.school_id.

### 4.16 conversation_members

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| conversation_id | UUID | FK → conversations CASCADE, NOT NULL |
| user_id | UUID | FK → users CASCADE, NOT NULL |
| school_id | UUID | FK → schools RESTRICT, NOT NULL |
| role | VARCHAR(20) | NOT NULL DEFAULT 'member', CHECK IN ('admin','member') |
| joined_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| last_read_at | TIMESTAMPTZ | NULLABLE |
| is_muted | BOOLEAN | NOT NULL DEFAULT false |

UNIQUE(conversation_id, user_id).

**Trigger:** conversations.school_id = users.school_id = NEW.school_id.

### 4.17 messages

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| conversation_id | UUID | FK → conversations CASCADE, NOT NULL |
| sender_id | UUID | FK → users SET NULL, NULLABLE |
| school_id | UUID | FK → schools RESTRICT, NOT NULL |
| content | TEXT | NOT NULL DEFAULT '' |
| type | VARCHAR(20) | NOT NULL DEFAULT 'text', CHECK IN ('text','file','image','system','audio') |
| reply_to_id | UUID | FK → messages SET NULL, NULLABLE |
| is_pinned | BOOLEAN | NOT NULL DEFAULT false |
| is_edited | BOOLEAN | NOT NULL DEFAULT false |
| edited_at | TIMESTAMPTZ | NULLABLE |
| is_deleted | BOOLEAN | NOT NULL DEFAULT false |
| deleted_at | TIMESTAMPTZ | NULLABLE |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

Index: idx_messages_conversation_created(conversation_id, created_at DESC).

**Trigger:** conversations.school_id = NEW.school_id. If sender_id set: users.school_id = NEW.school_id.

### 4.18 message_attachments

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| message_id | UUID | FK → messages CASCADE, NOT NULL |
| file_url | VARCHAR(500) | NOT NULL |
| file_name | VARCHAR(255) | NOT NULL |
| file_size | BIGINT | NOT NULL, CHECK > 0 |
| file_type | VARCHAR(100) | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

No direct school_id — inherits isolation through messages RLS.

### 4.19 library_categories

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| school_id | UUID | FK → schools RESTRICT, NOT NULL |
| parent_id | UUID | FK → library_categories RESTRICT, NULLABLE |
| name_tg | VARCHAR(200) | NOT NULL |
| name_ru | VARCHAR(200) | NULLABLE |
| slug | VARCHAR(100) | NOT NULL |
| sort_order | INT | NOT NULL DEFAULT 0 |
| is_active | BOOLEAN | NOT NULL DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

UNIQUE(school_id, slug). UNIQUE(school_id, parent_id, name_tg).

**Trigger `validate_library_category_parent`:** parent.school_id = NEW.school_id. Delete strategy: RESTRICT if has children or items.

### 4.20 library_items

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| school_id | UUID | FK → schools RESTRICT, NOT NULL |
| title | VARCHAR(500) | NOT NULL |
| author | VARCHAR(300) | NULLABLE |
| description | TEXT | NULLABLE |
| cover_url | VARCHAR(500) | NULLABLE |
| file_url | VARCHAR(500) | NOT NULL |
| file_name | VARCHAR(255) | NOT NULL |
| file_size | BIGINT | NOT NULL, CHECK > 0 |
| file_type | VARCHAR(20) | NOT NULL, CHECK IN ('pdf','epub','audio','image','document') |
| category_id | UUID | FK → library_categories RESTRICT, NOT NULL |
| language | VARCHAR(10) | NOT NULL DEFAULT 'tg' |
| publication_year | INT | NULLABLE |
| publisher | VARCHAR(300) | NULLABLE |
| subject_id | UUID | FK → subjects SET NULL, NULLABLE |
| grade_level | INT | NULLABLE, CHECK 1-11 |
| visibility | VARCHAR(20) | NOT NULL DEFAULT 'all', CHECK IN ('all','teachers','admin','specific') |
| is_published | BOOLEAN | NOT NULL DEFAULT true |
| unpublished_at | TIMESTAMPTZ | NULLABLE |
| uploaded_by | UUID | FK → users SET NULL, NULLABLE |
| metadata | JSONB | NULLABLE |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

Indexes: school+category, school+subject, school+published. Full-text search via generated tsvector column + GIN index.

**Trigger:** category.school_id = NEW.school_id. If subject_id: subjects.school_id = NEW.school_id. If uploaded_by: users.school_id = NEW.school_id.

#### Visibility access logic

- `all` → All users in the school can see the item
- `teachers` → Users with role level <= 4 (admin, director, vice_principal, teacher)
- `admin` → Users with role level <= 3 (admin, director, vice_principal)
- `specific` → Access determined by library_item_access entries:
  - User has access if ANY of their roles matches a role_id entry, OR user is in a class matching a class_id entry
  - If visibility='specific' and no library_item_access entries exist → no one has access (except admin who sees all in their school)

### 4.21 library_item_access

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| item_id | UUID | FK → library_items CASCADE, NOT NULL |
| school_id | UUID | FK → schools RESTRICT, NOT NULL |
| role_id | UUID | FK → roles CASCADE, NULLABLE |
| class_id | UUID | FK → classes CASCADE, NULLABLE |

CHECK(role_id IS NOT NULL OR class_id IS NOT NULL). UNIQUE(item_id, role_id, class_id).

**Trigger:** item.school_id = NEW.school_id. If role_id: roles.school_id = NEW.school_id. If class_id: classes.school_id = NEW.school_id.

### 4.22 library_favorites

| Column | Type | Constraints |
|---|---|---|
| user_id | UUID | FK → users CASCADE, NOT NULL |
| item_id | UUID | FK → library_items CASCADE, NOT NULL |
| school_id | UUID | FK → schools RESTRICT, NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

PK(user_id, item_id).

**Trigger:** users.school_id = library_items.school_id = NEW.school_id.

### 4.23 library_reading_history

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK → users CASCADE, NOT NULL |
| item_id | UUID | FK → library_items CASCADE, NOT NULL |
| school_id | UUID | FK → schools RESTRICT, NOT NULL |
| last_page | INT | NULLABLE, CHECK >= 0 |
| last_position | VARCHAR(100) | NULLABLE |
| opened_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

UNIQUE(user_id, item_id).

**Trigger:** users.school_id = library_items.school_id = NEW.school_id.

### 4.24 notifications

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK → users CASCADE, NOT NULL |
| school_id | UUID | FK → schools RESTRICT, NOT NULL |
| type | VARCHAR(30) | NOT NULL, CHECK IN (message,grade,homework,schedule,attendance,announcement,document,library,system) |
| module | VARCHAR(50) | NOT NULL |
| title | VARCHAR(300) | NOT NULL |
| body | TEXT | NULLABLE |
| data | JSONB | NULLABLE |
| is_read | BOOLEAN | NOT NULL DEFAULT false |
| read_at | TIMESTAMPTZ | NULLABLE |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

Indexes: user+is_read, school+user, school+created_at DESC.

**Retention policy:**
- User can hard delete own read notifications (RLS: DELETE WHERE user_id = auth.uid() AND is_read = true)
- Auto-cleanup via scheduled PostgreSQL function:
  - Read notifications older than 90 days → deleted
  - Unread notifications older than 365 days → deleted
  - Retention periods stored in school_settings: notification_retention_read_days=90, notification_retention_unread_days=365

### 4.25 notification_settings

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| school_id | UUID | FK → schools RESTRICT, NOT NULL |
| type | VARCHAR(30) | NOT NULL, CHECK same as notifications.type |
| is_enabled | BOOLEAN | NOT NULL DEFAULT true |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_by | UUID | FK → users SET NULL, NULLABLE |

UNIQUE(school_id, type). RLS: read by school members, modify only by users with 'notifications.manage' permission.

### 4.26 audit_logs (IMMUTABLE)

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| school_id | UUID | FK → schools RESTRICT, NOT NULL |
| user_id | UUID | NULLABLE (no FK — log survives user deletion) |
| user_public_id | VARCHAR(32) | NULLABLE (snapshot at action time) |
| action | VARCHAR(30) | NOT NULL, CHECK IN (create,update,delete,login,logout,enable,disable,assign,revoke) |
| entity_type | VARCHAR(50) | NOT NULL |
| entity_id | UUID | NULLABLE |
| old_values | JSONB | NULLABLE |
| new_values | JSONB | NULLABLE |
| ip_address | INET | NULLABLE |
| user_agent | TEXT | NULLABLE |
| metadata | JSONB | NULLABLE |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

Indexes: school+created_at DESC, school+user_id, entity_type+entity_id.

**Immutability:** Trigger `prevent_audit_modification` raises exception on UPDATE or DELETE for all users including admin.

**Access:** Permission-based via RLS:
- SELECT: user has 'audit_logs.read' permission in their school
- INSERT: service functions only (service_role)
- UPDATE: prohibited (trigger)
- DELETE: prohibited (trigger)

### 4.27 pages

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| school_id | UUID | FK → schools RESTRICT, NOT NULL |
| slug | VARCHAR(100) | NOT NULL |
| title_tg | VARCHAR(300) | NOT NULL |
| title_ru | VARCHAR(300) | NULLABLE |
| is_published | BOOLEAN | NOT NULL DEFAULT false |
| unpublished_at | TIMESTAMPTZ | NULLABLE |
| sort_order | INT | NOT NULL DEFAULT 0 |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

UNIQUE(school_id, slug).

### 4.28 content_blocks

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| school_id | UUID | FK → schools RESTRICT, NOT NULL |
| page_id | UUID | FK → pages CASCADE, NULLABLE |
| section | VARCHAR(50) | NOT NULL |
| type | VARCHAR(20) | NOT NULL, CHECK IN ('text','image','html','banner','gallery') |
| title_tg | TEXT | NULLABLE |
| title_ru | TEXT | NULLABLE |
| body_tg | TEXT | NULLABLE |
| body_ru | TEXT | NULLABLE |
| image_url | VARCHAR(500) | NULLABLE |
| link_url | VARCHAR(500) | NULLABLE |
| is_visible | BOOLEAN | NOT NULL DEFAULT true |
| hidden_at | TIMESTAMPTZ | NULLABLE |
| sort_order | INT | NOT NULL DEFAULT 0 |
| metadata | JSONB | NULLABLE |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

---

## 5. Triggers (21 total)

### System triggers

| # | Name | Table | Action |
|---|---|---|---|
| 1 | generate_public_id | users | BEFORE INSERT: atomic increment schools.id_sequence + id_prefix |
| 2 | update_updated_at | All with updated_at | BEFORE UPDATE: NEW.updated_at = now() |
| 3 | update_soft_delete_timestamp | All with soft delete | Sets/clears deactivated_at/deleted_at/unpublished_at/hidden_at on boolean change |
| 4 | prevent_audit_modification | audit_logs | BEFORE UPDATE/DELETE: RAISE EXCEPTION |
| 5 | prevent_system_role_delete | roles | BEFORE DELETE WHERE is_system=true: RAISE EXCEPTION |
| 6 | prevent_school_delete | schools | BEFORE DELETE: RAISE EXCEPTION |

### Cross-school validation triggers

| # | Name | Table | Validates |
|---|---|---|---|
| 7 | validate_user_role_school_match | user_roles | users.school = roles.school = NEW.school |
| 8 | validate_class_student_school | class_students | classes.school = users.school = NEW.school + student role |
| 9 | validate_teacher_subject_school | teacher_subjects | teacher/subject/class/year.school = NEW.school + teaching role |
| 10 | validate_class_school | classes | year.school + homeroom teacher school/role |
| 11 | validate_conversation_school | conversations | class.school + creator.school |
| 12 | validate_conv_member_school | conversation_members | conv.school = user.school = NEW.school |
| 13 | validate_message_school | messages | conv.school = sender.school = NEW.school |
| 14 | validate_library_item_school | library_items | category/subject/uploader.school |
| 15 | validate_library_access_school | library_item_access | item/role/class.school |
| 16 | validate_library_favorites_school | library_favorites | user.school = item.school = NEW.school |
| 17 | validate_reading_history_school | library_reading_history | user.school = item.school = NEW.school |
| 18 | validate_module_role_access_school | module_role_access | roles.school = NEW.school |
| 19 | validate_notification_school | notifications | users.school = NEW.school |
| 20 | validate_school_module_school | school_modules | updated_by.school = NEW.school |
| 21 | validate_library_category_parent | library_categories | parent.school = NEW.school |

---

## 6. RLS Policies

### Base principle

Every RLS policy on every table with school_id includes:
```sql
school_id = (SELECT school_id FROM users WHERE id = auth.uid())
```

### Soft delete defaults

Default SELECT policies filter out deactivated/deleted records:

| Table | Default filter | Who sees deactivated |
|---|---|---|
| users | is_active = true | Admin (own school) |
| schools | is_active = true | Service role |
| classes | is_active = true | Admin (own school) |
| subjects | is_active = true | Admin (own school) |
| conversations | is_active = true | — |
| messages | is_deleted = false | Sender sees own as "deleted message" |
| library_items | is_published = true | Admin (own school) |
| pages | is_published = true | Admin (own school) |
| content_blocks | is_visible = true | Admin (own school) |

### Per-table policies

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| schools | Own school | Service role | Admin own school | Prohibited |
| users | Own school, active | Admin/director/VP | Own profile (limited) or admin | Soft delete via admin |
| roles | Own school | Admin own school | Admin own school | RESTRICT system; soft delete others |
| permissions | All authenticated | Service role | Service role | RESTRICT |
| user_roles | Admin or own entry | Admin own school | Admin own school | Admin own school |
| role_permissions | Via roles | Admin own school | — | Admin own school |
| modules | All authenticated | Service role | Service role | — |
| school_modules | Own school | Admin own school | Admin own school | — |
| module_role_access | Own school | Admin own school | Admin own school | Admin own school |
| academic_years | Own school | Admin own school | Admin own school | — |
| classes | Own school, active | Admin own school | Admin own school | Soft delete |
| subjects | Own school, active | Admin own school | Admin own school | Soft delete |
| class_students | Own school | Admin/VP own school | Admin/VP own school | Admin/VP |
| teacher_subjects | Own school | Admin/VP own school | Admin/VP own school | Admin/VP |
| conversations | Member (via conv_members) | Per school structure rules | Admin/creator | Soft delete |
| conversation_members | Own membership or admin | Per rules | Own (mute/last_read) or admin | Admin/creator |
| messages | Member of conversation | Member of conversation | Own messages (edit) | Soft delete own |
| message_attachments | Via messages | Member of conversation | — | Via message cascade |
| library_categories | Own school | Admin + permission | Admin + permission | RESTRICT |
| library_items | Own school + visibility logic | Admin + permission | Admin + permission | Soft delete |
| library_item_access | Own school | Admin + permission | Admin + permission | Admin |
| library_favorites | Own (user_id = auth.uid()) | Own | — | Own |
| library_reading_history | Own | Own | Own (last_page) | — |
| notifications | Own (user_id = auth.uid()) | Service functions | Own (mark read) | Own read only |
| notification_settings | Own school | Admin w/ notifications.manage | Admin w/ notifications.manage | Prohibited |
| audit_logs | Users w/ audit_logs.read perm | Service functions | Prohibited | Prohibited |
| pages | Published: all; unpublished: admin | Admin | Admin | Soft delete |
| content_blocks | Visible: all; hidden: admin | Admin | Admin | Soft delete |

---

## 7. RBAC System

### Architecture

```
User → user_roles → Roles → role_permissions → Permissions
```

### Permission check flow

```
1. Module enabled? (school_modules.is_enabled for user's school)
2. Role sees module? (module_role_access.is_visible for user's role)
3. Role has permission? (role_permissions for specific action)
```

All three checks happen server-side. Frontend uses the same data for UX (hiding elements) but never as security.

### Permission naming convention

`{module}.{action}` where action is one of: read, create, update, delete, manage.

Examples: `users.create`, `users.read`, `grades.update`, `library.manage`, `audit_logs.read`, `audit_logs.export`.

### Helper functions (application layer)

```typescript
// Check if user has specific permission
hasPermission(userId: string, permissionSlug: string): Promise<boolean>

// Check if module is enabled and accessible
isModuleAccessible(userId: string, moduleSlug: string): Promise<boolean>

// Get all permissions for user
getUserPermissions(userId: string): Promise<Permission[]>

// Combined check: module enabled + role access + permission
canPerformAction(userId: string, moduleSlug: string, action: string): Promise<boolean>
```

---

## 8. Feature Management

### Three-level check

```
school_modules.is_enabled → module_role_access.is_visible → role_permissions
```

### Disabled module behavior

When admin disables a module:
- UI: menu items, dashboard widgets, related navigation — all hidden
- API: endpoints return 403 with "module disabled" error
- Direct URL: redirects to dashboard with notification
- Notifications: related auto-notifications stop being created
- Realtime: related subscriptions disconnected

### Re-enabling

When re-enabled, all UI/API/features restore according to role permissions. No data is lost during disabled period.

### Implementation

Centralized module registry in `src/lib/modules/`. Middleware checks module status on every protected route. No scattered `if (moduleEnabled)` checks in individual components — single middleware/provider pattern.

---

## 9. Messaging Module

### Conversation types

- **direct:** 1-to-1 between two users (within same school)
- **group:** Created by users with permission, invite-based
- **class_group:** Auto-created for classes, members based on class_students + teacher_subjects
- **announcement:** One-to-many, only admins/teachers can send

### Communication rules

Users cannot message anyone freely. Communication is governed by school structure:
- Students can message: their teachers, classmates (if in same class group)
- Teachers can message: their students, other teachers, administration
- Administration can message: anyone in their school
- All contacts are determined by roles, class memberships, and teacher-subject assignments

### Features

- Text messages, files, images
- Reply to specific message
- Edit own messages (is_edited + edited_at)
- Soft delete own messages
- Pin messages (group admin/teacher)
- Read/unread status (last_read_at in conversation_members)
- Message delivery status
- Search within conversations
- User search (within school, filtered by communication rules)

### Realtime

Supabase Realtime subscriptions on:
- messages table (new messages in user's conversations)
- conversation_members (new conversations)
- notifications (new notification badge)

### UI

- Sidebar: conversation list with search/filter, unread badges
- Main area: message thread with infinite scroll
- Input area: text field, file attachment, reply preview
- Info panel: conversation/user details
- Responsive: full-screen conversation on mobile, split view on desktop

---

## 10. Digital Library Module

### Features

- Browse by dynamic categories/subcategories (admin-managed)
- Book/material cards with cover, title, author, metadata
- Built-in PDF viewer: pages, zoom, fullscreen, page navigation, search, mobile-optimized
- Search: full-text across title, author, description + filters
- Filters: category, subject, class/grade, language, format, author, date
- Favorites: personal per user
- Reading history: last page/position, "continue reading"
- Access control: visibility levels (all, teachers, admin, specific)

### File handling

Supabase Storage buckets:
- `library-files` — PDFs, EPUBs, audio, documents
- `library-covers` — Cover images

Bucket policies enforce authenticated access with school_id verification.

### PDF Viewer

Built-in viewer using PDF.js (or equivalent):
- Page-by-page rendering
- Zoom controls
- Fullscreen mode
- Jump to page
- Text search within document
- Touch-optimized for mobile
- Saves last viewed page to reading_history

---

## 11. Admin Panel

### Access

Admin role only. Even director cannot access technical admin panel. Server-side verification on every admin route and API call.

### Sections

1. **Dashboard** — Platform overview, stats, recent activity
2. **Users** — CRUD, role assignment, search, filter, view IDs, activate/deactivate
3. **Roles & Permissions** — View/edit role permissions matrix
4. **School Settings** — Name, logo, contacts, address, id_prefix (from DB, not code)
5. **Modules** — Enable/disable modules, configure role visibility
6. **Library Management** — Books, categories, files, covers, access control
7. **Content Management** — CMS: pages, content blocks, banners, images, ordering, visibility
8. **Notifications** — Notification type settings, retention config
9. **Audit Log** — View action history, filter by user/action/entity/date
10. **Classes & Subjects** — Manage school structure

### CMS capabilities

Admin can manage website content without touching code:
- Create/edit/delete pages
- Add/modify/remove text blocks, images, banners
- Reorder content blocks
- Toggle visibility (publish/unpublish)
- Replace background images
- Manage hero sections, info blocks

---

## 12. Notification System

### Centralized module

All notifications flow through a single system. Modules create notifications via a service function that:
1. Checks if notification type is enabled (notification_settings)
2. Checks if related module is enabled (school_modules)
3. Creates notification record
4. Triggers realtime event for the recipient

### Types

message, grade, homework, schedule, attendance, announcement, document, library, system.

### Retention

- User deletes own read notifications (hard delete)
- Auto-cleanup: read >90 days, unread >365 days (configurable per school in school_settings)

---

## 13. User Profiles

### Student profile

- Name, surname, photo, public_id, class, allowed info
- Class is administrative — student cannot change it (only admin/director/VP can)
- Student edits only permitted fields (name display, avatar, etc.)

### All profiles

- Avatar upload to Supabase Storage
- View own public_id
- Activity visible based on role and permissions

---

## 14. Localization (i18n)

### Setup

next-intl with Tajik (tg) as default, Russian (ru) as secondary.

### Rules

- All UI text in translation files, never hardcoded in components
- System messages, notifications, form labels, button text, error messages — all localized
- Admin panel also fully localized
- Database content fields use _tg/_ru suffixes (name_tg, name_ru, etc.)
- Architecture supports adding more languages by adding new JSON file + DB columns

---

## 15. UX/UI — iOS-Level Quality

### Guiding principle

The platform must feel like a modern premium application, not a typical web admin panel. Reference quality: iOS — simplicity, smoothness, predictability, and polish. Not a copy of Apple's interface, but the same level of care.

### Animation & Motion System

Unified animation system as part of the design system. All future modules automatically follow the same motion language.

**Transition timing tokens (CSS custom properties):**
- `--duration-fast`: 150ms — micro-interactions (button press, toggle)
- `--duration-normal`: 250ms — element appear/disappear, dropdowns
- `--duration-slow`: 350ms — page transitions, modals, sheets
- `--duration-extra-slow`: 500ms — complex layout animations
- `--ease-default`: cubic-bezier(0.25, 0.1, 0.25, 1) — natural movement
- `--ease-spring`: cubic-bezier(0.34, 1.56, 0.64, 1) — bouncy interactions
- `--ease-out`: cubic-bezier(0, 0, 0.2, 1) — elements entering
- `--ease-in`: cubic-bezier(0.4, 0, 1, 1) — elements leaving

**Required animations:**
- Page transitions: smooth crossfade between routes
- Element appear/disappear: fade + subtle scale or slide
- Modal/sheet: slide up with backdrop fade, physics-based dismiss
- Skeleton loading states: shimmer animation, never empty flashes
- Micro-interactions: button press scale, toggle slide, save confirmation
- List items: staggered entrance animation
- Layout shifts: zero unexpected jumps — all size changes animated

**Rules:**
- Every animation must serve a purpose: origin, destination, completion, loading, error
- No random animations for decoration
- Respect `prefers-reduced-motion` — disable non-essential animations

### Error States & Empty States

Errors must not look dry or frightening. For appropriate errors, empty states, and some system issues, use small playful character illustrations — e.g., characters arguing, fighting, or trying to fix the problem.

**Requirements:**
- Stylish, unobtrusive, contextually appropriate
- Must not prevent user from understanding the actual error
- Clear human-readable message in Tajik
- Specific action button: "Retry", "Go back", "Refresh", etc.
- Humor is visual layer only — never replaces proper error messaging
- Technical error details available through logging/error tracking, never shown to user

**Example pattern:**
```
[Playful illustration]
"Ой. Чизе хато шуд."
"Ин ду боз чизеро вайрон карданд."
[Такрор кунед]  [Ба саҳифаи асосӣ]
```

### Interactive States

Every interactive component must handle all states with smooth transitions:
- Default → Hover (desktop): subtle highlight, `--duration-fast`
- Hover → Active/Press: scale down slightly, instant feedback
- Focus: visible ring, keyboard-accessible
- Disabled: reduced opacity, no pointer events
- Loading: inline spinner or skeleton, no layout shift
- Success: brief checkmark animation or color flash
- Error: shake or red highlight with message

### Responsive Behavior

- Desktop (1280px+): full sidebar, split views, hover states
- Tablet (768-1279px): collapsible sidebar, touch-optimized tap targets (min 44px)
- Mobile (<768px): full-screen views, bottom navigation, swipe gestures where natural, sheet-style modals

No layout jumps on resize — fluid transitions between breakpoints.

---

## 16. Design System (Visual)

### Principles

- Unified visual language across all screens
- Professional SaaS-level appearance
- Consistent colors, typography, spacing, borders, shadows
- New pages automatically match existing design

### Components (src/components/ui/)

Button, Input, Textarea, Select, Checkbox, Radio, Switch, Card, Dialog/Modal, Dropdown, Table, Tabs, Badge, Avatar, Tooltip, Skeleton (loading), EmptyState, ErrorState, Breadcrumb, Pagination, FileUpload, SearchInput, DatePicker, Notification/Toast.

### States

Every interactive component handles: default, hover, focus, active, disabled, loading, error, success.

### Responsive

- Desktop (1280px+): full sidebar, split views
- Tablet (768-1279px): collapsible sidebar, adapted layouts
- Mobile (<768px): bottom navigation or hamburger, full-screen views, touch-optimized

### Accessibility

- Semantic HTML
- ARIA attributes where needed
- Keyboard navigation
- Focus indicators
- Color contrast compliance
- Screen reader support

---

## 17. Security

### Authentication

Supabase Auth handles: email/password login, session management, token refresh.

### Authorization layers

1. **RLS (database):** Enforces tenant isolation and row-level access
2. **Middleware (Next.js):** Checks auth, module access, redirects
3. **API Routes:** Verify permissions before any mutation
4. **UI:** Hides elements for UX only — never relied upon for security

### File upload security

- Validate file type server-side (not just extension)
- Enforce size limits
- Supabase Storage bucket policies with auth checks
- No direct public URLs for protected files — use signed URLs

### Data protection

- service_role key only in server environment
- No sensitive data in URL parameters
- Secure error messages (no stack traces to client)
- Input sanitization via Zod schemas

---

## 18. Deployment

### Frontend

Vercel — optimized for Next.js. Free tier sufficient for school usage.

### Backend/DB/Storage

Supabase Cloud — free tier: 500MB database, 1GB storage, 50K monthly active users.

### Migration path

Architecture does not depend on Supabase-specific features beyond standard PostgreSQL + Auth + Storage. Migration to self-hosted Supabase or alternative PostgreSQL + S3-compatible storage is possible without application rewrite.

---

## 19. Delete Strategy Summary

| Entity | Strategy | Details |
|---|---|---|
| schools | Soft (is_active + deactivated_at) | Physical DELETE prohibited |
| users | Soft (is_active + deactivated_at) | Cascades: user_roles, class_students, etc. |
| classes | Soft (is_active + deactivated_at) | — |
| subjects | Soft (is_active + deactivated_at) | — |
| roles | RESTRICT (system), soft (custom) | — |
| conversations | Soft (is_active + deactivated_at) | — |
| messages | Soft (is_deleted + deleted_at) | — |
| library_items | Soft (is_published + unpublished_at) | — |
| library_categories | RESTRICT | Cannot delete with children/items |
| pages | Soft (is_published + unpublished_at) | — |
| content_blocks | Soft (is_visible + hidden_at) | — |
| permissions | RESTRICT | — |
| notifications | Hard delete (user's own read; auto-cleanup) | Retention: 90d read, 365d unread |
| audit_logs | Prohibited | INSERT only, immutable |

---

## 20. Future Modules (architecture ready, not implemented)

The following modules have entries in the `modules` table and can be enabled/disabled, but their specific tables and UI will be designed when requirements are provided:

- Grades & Electronic Journal
- Attendance
- Homework/Assignments
- Schedule/Timetable
- Documents
- Events
- Announcements
- Reports/Analytics

Each will follow the same patterns: school_id isolation, RLS, cross-school triggers, permission-based access, soft delete where appropriate.
