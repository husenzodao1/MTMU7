-- МТМУ: навсозии база, қисми 2 аз 7. Пурра ворид кунед ва Run-ро пахш кунед.
BEGIN;
DO $$
BEGIN
IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE name = '00093_policies_ask_once') THEN
RAISE EXCEPTION 'Навсозӣ аллакай гузошта шудааст. Ҳеҷ чиз тағйир наёфт.';
END IF;
IF to_regclass('supabase_migrations.live_update_2026_10') IS NOT NULL THEN
IF EXISTS (SELECT 1 FROM supabase_migrations.live_update_2026_10 WHERE part = 2) THEN
RAISE EXCEPTION 'Қисми 2 аллакай иҷро шудааст. Қисми 3-ро иҷро кунед.';
END IF;
IF NOT EXISTS (SELECT 1 FROM supabase_migrations.live_update_2026_10 WHERE part = 1) THEN
RAISE EXCEPTION 'Аввал қисми 1-ро иҷро кунед. Ҳеҷ чиз тағйир наёфт.';
END IF;
ELSE
RAISE EXCEPTION 'Аввал қисми 1-ро иҷро кунед. Ҳеҷ чиз тағйир наёфт.';
END IF;
END;
$$;
CREATE OR REPLACE FUNCTION app.subject_translation(p_name text, p_lang text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
v_key text := app.subject_key(p_name);
v_ru text;
v_en text;
v_rest text;
BEGIN
IF v_key = '' THEN
RETURN NULL;
END IF;
SELECT d.ru, d.en INTO v_ru, v_en
FROM (VALUES
('математика', 'Математика', 'Mathematics'),
('алгебра', 'Алгебра', 'Algebra'),
('геометрия', 'Геометрия', 'Geometry'),
('алгебра ва ибтидои анализ', 'Алгебра и начала анализа', 'Algebra and calculus'),
('физика', 'Физика', 'Physics'),
('химия', 'Химия', 'Chemistry'),
('биология', 'Биология', 'Biology'),
('информатика', 'Информатика', 'Computer science'),
('информатика ва технологияи иттилооти', 'Информатика и ИКТ', 'Computer science and ICT'),
('чугрофия', 'География', 'Geography'),
('география', 'География', 'Geography'),
('таърих', 'История', 'History'),
('таърихи халки точик', 'История таджикского народа', 'History of the Tajik people'),
('таърихи точик', 'История таджикского народа', 'History of the Tajik people'),
('таърихи умуми', 'Всеобщая история', 'World history'),
('таърихи чахон', 'Всемирная история', 'World history'),
('таърихи дин', 'История религий', 'History of religions'),
('хониш', 'Чтение', 'Reading'),
('хониши адаби', 'Литературное чтение', 'Literary reading'),
('хониши синфи', 'Классное чтение', 'Class reading'),
('алифбо', 'Букварь', 'ABC book'),
('савод', 'Обучение грамоте', 'Literacy'),
('саводи хат', 'Обучение грамоте', 'Literacy'),
('хуснавис', 'Чистописание', 'Penmanship'),
('хуснависи', 'Чистописание', 'Penmanship'),
('хатнавис', 'Чистописание', 'Penmanship'),
('хатнависи', 'Чистописание', 'Penmanship'),
('табиатшиноси', 'Природоведение', 'Natural science'),
('олами атроф', 'Окружающий мир', 'The world around us'),
('тарбияи чисмони', 'Физическая культура', 'Physical education'),
('варзиш', 'Физическая культура', 'Physical education'),
('мусики', 'Музыка', 'Music'),
('мусики ва суруд', 'Музыка и пение', 'Music and singing'),
('санъати тасвири', 'Изобразительное искусство', 'Fine arts'),
('расмкаши', 'Рисование', 'Drawing'),
('накшакаши', 'Черчение', 'Technical drawing'),
('технология', 'Технология', 'Technology'),
('мехнат', 'Трудовое обучение', 'Handicraft'),
('таълими мехнат', 'Трудовое обучение', 'Handicraft'),
('тарбияи мехнати', 'Трудовое обучение', 'Handicraft'),
('хукук', 'Право', 'Law'),
('асосхои давлат ва хукук', 'Основы государства и права', 'Fundamentals of state and law'),
('асосхои давлатдори ва хукук', 'Основы государства и права', 'Fundamentals of state and law'),
('чомеашиноси', 'Обществознание', 'Social studies'),
('инсон ва чомеа', 'Человек и общество', 'Man and society'),
('иктисод', 'Экономика', 'Economics'),
('асосхои иктисод', 'Основы экономики', 'Fundamentals of economics'),
('одоб', 'Этика', 'Ethics'),
('ахлок', 'Этика', 'Ethics'),
('мантик', 'Логика', 'Logic'),
('астрономия', 'Астрономия', 'Astronomy'),
('экология', 'Экология', 'Ecology'),
('омодагии ибтидоии харби', 'Начальная военная подготовка', 'Pre-military training'),
('тайёрии ибтидоии харби', 'Начальная военная подготовка', 'Pre-military training'),
('тайёрии харби', 'Начальная военная подготовка', 'Pre-military training'),
('асосхои бехатарии фаъолияти хаёти', 'Основы безопасности жизнедеятельности', 'Life safety'),
('бехатарии хаёт', 'Основы безопасности жизнедеятельности', 'Life safety'),
('соати синфи', 'Классный час', 'Class hour'),
('соати тарбияви', 'Воспитательный час', 'Pastoral hour'),
('забон ва адабиёт', 'Язык и литература', 'Language and literature'),
('забони точики ва адабиёт', 'Таджикский язык и литература', 'Tajik language and literature'),
('адабиёт', 'Литература', 'Literature'),
('адабиёти чахон', 'Мировая литература', 'World literature'),
('адабиёти чахони', 'Мировая литература', 'World literature'),
('арифметика', 'Арифметика', 'Arithmetic'),
('хисоб', 'Арифметика', 'Arithmetic'),
('табиатшиноси ва олами атроф', 'Окружающий мир', 'The world around us'),
('робототехника', 'Робототехника', 'Robotics'),
('асосхои ислом', 'Основы ислама', 'Fundamentals of Islam'),
('корхои амали', 'Практические работы', 'Practical work')
) AS d(key, ru, en)
WHERE d.key = v_key;
IF v_ru IS NULL AND v_key LIKE 'забони %' THEN
v_rest := substr(v_key, 8);
SELECT l.ru || ' язык', l.en INTO v_ru, v_en
FROM (VALUES
('точики', 'Таджикский', 'Tajik language'),
('руси', 'Русский', 'Russian language'),
('англиси', 'Английский', 'English'),
('олмони', 'Немецкий', 'German'),
('фаронсави', 'Французский', 'French'),
('араби', 'Арабский', 'Arabic'),
('хитои', 'Китайский', 'Chinese'),
('форси', 'Персидский', 'Persian'),
('турки', 'Турецкий', 'Turkish'),
('узбеки', 'Узбекский', 'Uzbek'),
('испани', 'Испанский', 'Spanish'),
('корея', 'Корейский', 'Korean'),
('корейги', 'Корейский', 'Korean'),
('япони', 'Японский', 'Japanese'),
('итолиёви', 'Итальянский', 'Italian'),
('хинди', 'Хинди', 'Hindi'),
('модари', 'Родной', 'Mother tongue'),
('давлати', 'Государственный', 'State language'),
('хоричи', 'Иностранный', 'Foreign language')
) AS l(key, ru, en)
WHERE l.key = v_rest;
END IF;
IF v_ru IS NULL AND v_key LIKE 'адабиёти %' THEN
v_rest := substr(v_key, 10);
SELECT l.ru, l.en INTO v_ru, v_en
FROM (VALUES
('точик', 'Таджикская литература', 'Tajik literature'),
('точики', 'Таджикская литература', 'Tajik literature'),
('классики', 'Классическая литература', 'Classical literature'),
('рус', 'Русская литература', 'Russian literature'),
('руси', 'Русская литература', 'Russian literature'),
('англис', 'Английская литература', 'English literature'),
('англиси', 'Английская литература', 'English literature'),
('форс', 'Персидская литература', 'Persian literature'),
('чахон', 'Мировая литература', 'World literature'),
('чахони', 'Мировая литература', 'World literature')
) AS l(key, ru, en)
WHERE l.key = v_rest;
END IF;
RETURN CASE lower(coalesce(p_lang, '')) WHEN 'ru' THEN v_ru WHEN 'en' THEN v_en ELSE NULL END;
END;
$$;
GRANT EXECUTE ON FUNCTION app.subject_translation(text, text) TO authenticated;
CREATE OR REPLACE FUNCTION app.latin(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
SELECT replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
translate(upper(coalesce(p_text, '')), 'АБВГҒДЕЗИӢЙКҚЛМНОПРСТУӮФҲЦЫЭЪ', 'ABVGGDEZIIYKQLMNOPRSTUUFHCYE'''),
'Ё', 'YO'), 'Ж', 'ZH'), 'Ҷ', 'J'), 'Ч', 'CH'), 'Ш', 'SH'), 'Щ', 'SH'), 'Х', 'KH'), 'Ю', 'YU'), 'Я', 'YA'), 'Ь', '')
$$;
CREATE OR REPLACE FUNCTION app.subject_code_for(p_school uuid, p_name text, p_except uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
v_source text := coalesce(app.subject_translation(p_name, 'en'), app.latin(p_name));
v_words text[];
v_base text;
v_code text;
v_n int := 1;
BEGIN
SELECT array_agg(w ORDER BY o) INTO v_words
FROM regexp_split_to_table(upper(regexp_replace(v_source, '[^A-Za-z ]+', ' ', 'g')), '\s+') WITH ORDINALITY AS t(w, o)
WHERE w <> '' AND w NOT IN ('OF', 'THE', 'AND', 'VA', 'A', 'AN');
IF v_words IS NULL OR cardinality(v_words) = 0 THEN
v_base := 'SUB';
ELSE
v_base := left(v_words[1], 3);
IF cardinality(v_words) > 1 THEN
v_base := v_base || (SELECT string_agg(left(w, 1), '') FROM unnest(v_words[2:4]) AS w);
END IF;
END IF;
v_code := v_base;
WHILE EXISTS (
SELECT 1 FROM public.subjects s
WHERE s.school_id = p_school AND upper(s.code) = v_code AND s.id IS DISTINCT FROM p_except
) LOOP
v_n := v_n + 1;
v_code := v_base || v_n::text;
END LOOP;
RETURN v_code;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.subject_code_for(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION app.complete_subject()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
NEW.name_tg := regexp_replace(btrim(NEW.name_tg), '\s+', ' ', 'g');
IF TG_OP = 'UPDATE' AND NEW.name_tg IS DISTINCT FROM OLD.name_tg THEN
IF OLD.name_ru IS NOT DISTINCT FROM app.subject_translation(OLD.name_tg, 'ru') AND NEW.name_ru IS NOT DISTINCT FROM OLD.name_ru THEN
NEW.name_ru := NULL;
END IF;
IF OLD.name_en IS NOT DISTINCT FROM app.subject_translation(OLD.name_tg, 'en') AND NEW.name_en IS NOT DISTINCT FROM OLD.name_en THEN
NEW.name_en := NULL;
END IF;
END IF;
NEW.name_ru := coalesce(nullif(btrim(NEW.name_ru), ''), app.subject_translation(NEW.name_tg, 'ru'));
NEW.name_en := coalesce(nullif(btrim(NEW.name_en), ''), app.subject_translation(NEW.name_tg, 'en'));
IF nullif(btrim(coalesce(NEW.code, '')), '') IS NULL THEN
NEW.code := app.subject_code_for(NEW.school_id, NEW.name_tg, NEW.id);
END IF;
RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_complete_subject ON public.subjects;
CREATE TRIGGER trg_complete_subject
BEFORE INSERT OR UPDATE OF name_tg, name_ru, name_en, code ON public.subjects
FOR EACH ROW EXECUTE FUNCTION app.complete_subject();
DO $$
DECLARE
v_id uuid;
BEGIN
FOR v_id IN
SELECT id FROM public.subjects
WHERE name_ru IS NULL OR name_en IS NULL OR nullif(btrim(coalesce(code, '')), '') IS NULL
ORDER BY created_at, id
LOOP
UPDATE public.subjects SET name_tg = name_tg WHERE id = v_id;
END LOOP;
END;
$$;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261011180087', '00087_subjects_by_their_name') ON CONFLICT (version) DO NOTHING;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS subjects_note varchar(500);
COMMENT ON COLUMN public.staff.subjects_note IS
'The subjects the teachers'' workbook lists for this person: information only; the timetable decides who teaches what.';
ALTER TABLE public.guardians ADD COLUMN IF NOT EXISTS telegram_confirmed_at timestamptz;
ALTER TABLE public.telegram_chats ADD COLUMN IF NOT EXISTS pending_guardian uuid REFERENCES public.guardians(id) ON DELETE SET NULL;
ALTER TABLE public.telegram_outbox DROP CONSTRAINT IF EXISTS telegram_outbox_kind_check;
ALTER TABLE public.telegram_outbox ADD CONSTRAINT telegram_outbox_kind_check
CHECK (kind IN ('grade', 'absence', 'digest', 'note'));
CREATE OR REPLACE FUNCTION app.random_parent_password()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
v_letters constant text := 'abcdefghijkmnpqrstuvwxyz';
v_bytes bytea := extensions.gen_random_bytes(16);
v_out text := '';
i int;
BEGIN
FOR i IN 0 .. 1 LOOP
v_out := v_out || substr(v_letters, (get_byte(v_bytes, i) % 24) + 1, 1);
END LOOP;
FOR i IN 2 .. 7 LOOP
v_out := v_out || ((get_byte(v_bytes, i) * 256 + get_byte(v_bytes, i + 8)) % 10)::text;
END LOOP;
RETURN v_out;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.random_parent_password() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION app.attach_parent(
p_school uuid,
p_student uuid,
p_relationship text,
p_name text,
p_phone text,
p_workplace text,
p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
v_parts text[] := regexp_split_to_array(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), ' ');
v_last text;
v_first text;
v_middle text;
v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
v_workplace text := nullif(btrim(coalesce(p_workplace, '')), '');
v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
v_rel text := CASE WHEN p_relationship IN ('mother', 'father', 'guardian', 'grandparent', 'sibling', 'other') THEN p_relationship ELSE 'guardian' END;
v_guardian public.guardians%ROWTYPE;
v_user uuid;
v_holder uuid;
v_holder_is_pupil boolean;
v_password text;
v_login text;
v_role uuid;
BEGIN
v_last := v_parts[1];
v_first := coalesce(v_parts[2], v_parts[1]);
v_middle := nullif(array_to_string(v_parts[3:], ' '), '');
SELECT * INTO v_guardian FROM public.guardians g
WHERE g.school_id = p_school AND app.phone_key(g.phone) = app.phone_key(v_phone)
ORDER BY (g.user_id IS NOT NULL) DESC, g.created_at
LIMIT 1;
IF v_guardian.id IS NULL THEN
INSERT INTO public.guardians (school_id, first_name, last_name, middle_name, phone, email, workplace)
VALUES (p_school, v_first, v_last, v_middle, v_phone, v_email, v_workplace)
RETURNING * INTO v_guardian;
ELSE
UPDATE public.guardians SET
first_name = coalesce(v_first, first_name),
last_name = coalesce(v_last, last_name),
middle_name = coalesce(v_middle, middle_name),
email = coalesce(v_email, email),
workplace = coalesce(v_workplace, workplace),
status = 'active',
updated_at = now()
WHERE id = v_guardian.id
AND (first_name IS DISTINCT FROM coalesce(v_first, first_name)
OR last_name IS DISTINCT FROM coalesce(v_last, last_name)
OR middle_name IS DISTINCT FROM coalesce(v_middle, middle_name)
OR email IS DISTINCT FROM coalesce(v_email, email)
OR workplace IS DISTINCT FROM coalesce(v_workplace, workplace)
OR status <> 'active')
RETURNING * INTO v_guardian;
IF v_guardian.id IS NULL THEN
SELECT * INTO v_guardian FROM public.guardians g
WHERE g.school_id = p_school AND app.phone_key(g.phone) = app.phone_key(v_phone)
ORDER BY (g.user_id IS NOT NULL) DESC, g.created_at
LIMIT 1;
END IF;
END IF;
v_user := v_guardian.user_id;
IF v_user IS NULL THEN
SELECT u.id, EXISTS (SELECT 1 FROM public.students s WHERE s.user_id = u.id)
INTO v_holder, v_holder_is_pupil
FROM public.users u
WHERE u.school_id = p_school AND app.phone_key(u.phone) = app.phone_key(v_phone)
LIMIT 1;
IF v_holder IS NOT NULL AND NOT v_holder_is_pupil
AND NOT EXISTS (SELECT 1 FROM public.guardians g WHERE g.user_id = v_holder) THEN
v_user := v_holder;
ELSE
v_password := app.random_parent_password();
v_user := app.create_login('p' || app.random_password(12) || '@parents.invalid', v_password);
UPDATE auth.users SET email_confirmed_at = now() WHERE id = v_user;
INSERT INTO public.users (id, school_id, email, first_name, last_name, middle_name, phone, status, is_active, credentials_issued_at)
SELECT v_user, p_school, au.email, v_first, v_last, v_middle,
CASE WHEN v_holder IS NULL THEN v_phone END, 'active', true, now()
FROM auth.users au WHERE au.id = v_user;
END IF;
UPDATE public.guardians SET user_id = v_user, updated_at = now() WHERE id = v_guardian.id;
END IF;
SELECT r.id INTO v_role FROM public.roles r
WHERE r.school_id = p_school AND r.is_active AND r.slug = 'parent'
ORDER BY r.level LIMIT 1;
IF v_role IS NOT NULL THEN
INSERT INTO public.user_roles (user_id, role_id, school_id)
VALUES (v_user, v_role, p_school)
ON CONFLICT DO NOTHING;
END IF;
INSERT INTO public.student_guardians (student_id, guardian_id, school_id, relationship, is_primary)
VALUES (p_student, v_guardian.id, p_school, v_rel,
NOT EXISTS (SELECT 1 FROM public.student_guardians x WHERE x.student_id = p_student AND x.is_primary))
ON CONFLICT (student_id, guardian_id) DO UPDATE SET relationship = EXCLUDED.relationship
WHERE public.student_guardians.relationship IS DISTINCT FROM EXCLUDED.relationship;
SELECT u.public_id INTO v_login FROM public.users u WHERE u.id = v_user;
RETURN jsonb_build_object('guardianId', v_guardian.id, 'login', v_login, 'password', v_password);
END;
$$;
REVOKE EXECUTE ON FUNCTION app.attach_parent(uuid, uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION app.parent_cell_errors(p_row jsonb, p_number int, p_prefix text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
v_errors jsonb := '[]'::jsonb;
v_name text := nullif(btrim(coalesce(p_row ->> (p_prefix || '_name'), '')), '');
v_phone text := nullif(btrim(coalesce(p_row ->> (p_prefix || '_phone'), '')), '');
v_email text := nullif(lower(btrim(coalesce(p_row ->> (p_prefix || '_email'), ''))), '');
BEGIN
IF v_phone IS NOT NULL AND (v_phone !~ '^[+0-9 ()-]{5,30}$' OR length(regexp_replace(v_phone, '\D', '', 'g')) < 5) THEN
v_errors := v_errors || jsonb_build_object('row', p_number, 'field', p_prefix || '_phone', 'code', 'invalid_phone');
END IF;
IF v_phone IS NOT NULL AND v_name IS NULL THEN
v_errors := v_errors || jsonb_build_object('row', p_number, 'field', p_prefix || '_name', 'code', 'required');
END IF;
IF v_name IS NOT NULL AND v_phone IS NULL THEN
v_errors := v_errors || jsonb_build_object('row', p_number, 'field', p_prefix || '_phone', 'code', 'required');
END IF;
IF v_name IS NOT NULL AND (array_length(regexp_split_to_array(btrim(v_name), '\s+'), 1) < 2 OR length(v_name) > 200) THEN
v_errors := v_errors || jsonb_build_object('row', p_number, 'field', p_prefix || '_name', 'code', 'guardian_name');
END IF;
IF v_email IS NOT NULL AND v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' THEN
v_errors := v_errors || jsonb_build_object('row', p_number, 'field', p_prefix || '_email', 'code', 'invalid_email');
END IF;
RETURN v_errors;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.import_people(text, jsonb, boolean, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_people(text, jsonb, boolean, int, int) TO authenticated;
CREATE OR REPLACE FUNCTION public.import_guardians(p_rows jsonb)
RETURNS int
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
SELECT 0
$$;
CREATE OR REPLACE FUNCTION public.save_my_guardian(
p_relationship text,
p_last_name text,
p_first_name text,
p_middle_name text DEFAULT NULL,
p_birth_year int DEFAULT NULL,
p_phone text DEFAULT NULL,
p_workplace text DEFAULT NULL,
p_guardian_id uuid DEFAULT NULL,
p_sibling_of uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END;
$$;
CREATE OR REPLACE FUNCTION public.remove_my_guardian(p_guardian_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.my_guardians() FROM authenticated;
CREATE OR REPLACE FUNCTION app.may_see_parents(p_student uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
SELECT EXISTS (
SELECT 1 FROM public.students s
WHERE s.id = p_student AND s.school_id = app.current_school_id()
AND (app.can(s.school_id, 'students.view')
OR app.can(s.school_id, 'guardians.view')
OR app.student_current_class(s.id) = ANY (app.my_homeroom_class_ids())
OR s.id = ANY (app.my_taught_student_ids()))
)
$$;
GRANT EXECUTE ON FUNCTION app.may_see_parents(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.student_parents(p_student uuid)
RETURNS TABLE (
guardian_id uuid, relationship text, last_name text, first_name text, middle_name text,
workplace text, phone text, email text, login text, telegram_confirmed_at timestamptz,
telegram_chats int, children int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
IF NOT app.may_see_parents(p_student) THEN
RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END IF;
RETURN QUERY
SELECT g.id, sg.relationship::text, g.last_name::text, g.first_name::text, g.middle_name::text,
g.workplace::text, g.phone::text, g.email::text, u.public_id::text, g.telegram_confirmed_at,
(SELECT count(*)::int FROM public.telegram_children tc WHERE tc.student_id = p_student),
(SELECT count(*)::int FROM public.student_guardians o WHERE o.guardian_id = g.id)
FROM public.student_guardians sg
JOIN public.guardians g ON g.id = sg.guardian_id
LEFT JOIN public.users u ON u.id = g.user_id
WHERE sg.student_id = p_student AND g.status = 'active'
ORDER BY CASE sg.relationship WHEN 'father' THEN 1 WHEN 'mother' THEN 2 ELSE 3 END, g.last_name;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.student_parents(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_parents(uuid) TO authenticated;
INSERT INTO supabase_migrations.live_update_2026_10 (part) VALUES (2);
COMMIT;
SELECT 'Қисми 2 аз 7 иҷро шуд' AS natija;
