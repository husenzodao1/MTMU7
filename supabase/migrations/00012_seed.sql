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
