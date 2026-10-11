-- ============================================================================
-- 00087 · A subject is its Tajik name; the rest the platform works out.
--
-- The office writes one thing about a subject: its name, in Tajik. The
-- Russian and English names are needed by whoever reads the portal in those
-- languages, and a short code by the reports — neither is the office's job
-- any more. Both are filled in here, whenever a subject is added, by any
-- route: the subjects workbook, the timetable workbook, the form.
--
--   * The translation comes from the names Tajik schools actually use
--     (Математика, Забони англисӣ, Таърихи халқи тоҷик, …), and from the
--     shapes most of them follow: «Забони X» is «X язык», «Адабиёти X» is
--     «X литература». A name it does not know stays untranslated and the
--     Tajik name is shown instead, which is what the portal already did.
--   * The code is the subject's English (or transliterated Tajik) name
--     shortened — MAT, PHY, TAJL — with a number added when two subjects
--     would share one.
--
-- Hours a week are no longer asked for anywhere; the columns stay so old
-- rows keep what they had, but nothing reads or writes them.
-- ============================================================================

/** A subject name reduced to what tells two names apart: no case, no Tajik diacritics, single spaces. */
CREATE OR REPLACE FUNCTION app.subject_key(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT btrim(regexp_replace(
    translate(lower(coalesce(p_name, '')), 'ӢӮҶҲҚҒӣӯҷҳқғ', 'иучхкгиучхкг'),
    '[[:space:][:punct:]«»“”„–—]+', ' ', 'g'))
$$;
GRANT EXECUTE ON FUNCTION app.subject_key(text) TO authenticated;

/** The Russian or English name of a Tajik subject name, or NULL when it is not one we know. */
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

  -- «Забони X» and «Адабиёти X» follow one pattern each.
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

/** Tajik Cyrillic in Latin letters, for codes. */
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

/** A short code for a subject, unique in its school: MAT, PHY, TAJL, MAT2. */
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

/** Fills what the office no longer writes: the Russian and English names, and the code. */
CREATE OR REPLACE FUNCTION app.complete_subject()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.name_tg := regexp_replace(btrim(NEW.name_tg), '\s+', ' ', 'g');
  IF TG_OP = 'UPDATE' AND NEW.name_tg IS DISTINCT FROM OLD.name_tg THEN
    -- A name the platform translated follows the new name; one somebody
    -- wrote by hand stays.
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

-- The subjects already there get the same, one at a time so their codes do
-- not collide with each other.
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
