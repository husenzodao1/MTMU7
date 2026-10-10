-- What the bot is allowed to ask the database.
--
-- Everything here takes a Telegram chat id, which is not a credential: anybody
-- who knows a number could claim it. So no function trusts the chat id for
-- anything except "which conversation is this"; what a chat may *see* comes
-- from telegram_children, and a row only lands there when somebody typed a
-- child's name and the code the school printed for that child.
--
-- Every function is SECURITY DEFINER and granted to service_role alone. The
-- webhook is the only caller, it runs on the server, and it has already checked
-- Telegram's own secret header before it gets here.

-- --------------------------------------------------------------- the chat

CREATE OR REPLACE FUNCTION public.telegram_touch(p_chat bigint, p_locale text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.telegram_chats%ROWTYPE;
BEGIN
  INSERT INTO public.telegram_chats (chat_id, locale)
  VALUES (p_chat, coalesce(nullif(p_locale, ''), 'tg'))
  ON CONFLICT (chat_id) DO UPDATE SET updated_at = now()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'locale', v_row.locale,
    'state', v_row.state,
    'subscribed', v_row.subscribed_at IS NOT NULL,
    'blocked', v_row.blocked_until IS NOT NULL AND v_row.blocked_until > now(),
    'children', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', st.id,
        'name', st.last_name || ' ' || st.first_name,
        'class', c.name
      ) ORDER BY st.last_name), '[]'::jsonb)
      FROM public.telegram_children tc
      JOIN public.students st ON st.id = tc.student_id
      LEFT JOIN public.enrollments e ON e.student_id = st.id AND e.status = 'active'
      LEFT JOIN public.classes c ON c.id = e.class_id
      WHERE tc.chat_id = p_chat
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.telegram_set_locale(p_chat bigint, p_locale text)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.telegram_chats
  SET locale = p_locale, updated_at = now()
  WHERE chat_id = p_chat AND p_locale IN ('tg', 'ru', 'en');
$$;

CREATE OR REPLACE FUNCTION public.telegram_set_subscribed(p_chat bigint, p_ok boolean)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.telegram_chats
  SET subscribed_at = CASE WHEN p_ok THEN coalesce(subscribed_at, now()) ELSE NULL END,
      updated_at = now()
  WHERE chat_id = p_chat;
$$;

-- ------------------------------------------------------------ linking a child

/**
 * Step one: the parent types the name their child answers to, or the login the
 * school issued.
 *
 * What comes back says whether such a child exists and nothing else — not their
 * class, not their surname. Somebody trying nicknames at random learns only
 * that a nickname is in use, which they could already guess. The name is shown
 * after the code is right, not before.
 */
CREATE OR REPLACE FUNCTION public.telegram_find_child(p_chat bigint, p_needle text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_needle text := btrim(coalesce(p_needle, ''));
  v_student uuid;
  v_school uuid;
  v_matches int;
BEGIN
  IF v_needle = '' OR length(v_needle) > 64 THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT count(*) INTO v_matches
  FROM public.students st
  JOIN public.users u ON u.id = st.user_id
  WHERE st.status = 'active'
    AND (lower(u.nickname) = lower(v_needle) OR upper(u.public_id) = upper(v_needle));

  -- A nickname two children share cannot identify either of them. The school
  -- has to make it unique, or the parent uses the login instead.
  IF v_matches <> 1 THEN
    RETURN jsonb_build_object('found', false, 'ambiguous', v_matches > 1);
  END IF;

  SELECT st.id, st.school_id INTO v_student, v_school
  FROM public.students st
  JOIN public.users u ON u.id = st.user_id
  WHERE st.status = 'active'
    AND (lower(u.nickname) = lower(v_needle) OR upper(u.public_id) = upper(v_needle));

  IF NOT EXISTS (SELECT 1 FROM public.parent_codes pc WHERE pc.student_id = v_student) THEN
    -- The school has not printed this child's sheet yet. Saying so is better
    -- than asking for a code that does not exist.
    RETURN jsonb_build_object('found', true, 'noCode', true);
  END IF;

  UPDATE public.telegram_chats
  SET state = 'awaiting_code', pending_student = v_student, school_id = coalesce(school_id, v_school),
      updated_at = now()
  WHERE chat_id = p_chat;

  RETURN jsonb_build_object('found', true, 'noCode', false);
END;
$$;

/**
 * Step two: the code off the sheet.
 *
 * Five wrong answers and the chat waits a quarter of an hour. Eight characters
 * out of thirty-two is over a thousand billion guesses; the counter is there so
 * that a stolen sheet of one class cannot be walked through the whole school.
 */
CREATE OR REPLACE FUNCTION public.telegram_confirm_child(p_chat bigint, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_chat public.telegram_chats%ROWTYPE;
  v_hash text;
  v_student uuid;
BEGIN
  SELECT * INTO v_chat FROM public.telegram_chats WHERE chat_id = p_chat;
  IF v_chat.chat_id IS NULL OR v_chat.pending_student IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_pending');
  END IF;
  IF v_chat.blocked_until IS NOT NULL AND v_chat.blocked_until > now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'blocked');
  END IF;

  v_student := v_chat.pending_student;
  SELECT pc.code_hash INTO v_hash FROM public.parent_codes pc WHERE pc.student_id = v_student;

  IF v_hash IS NULL OR extensions.crypt(btrim(coalesce(p_code, '')), v_hash) <> v_hash THEN
    UPDATE public.telegram_chats
    SET attempts = attempts + 1,
        blocked_until = CASE WHEN attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE blocked_until END,
        updated_at = now()
    WHERE chat_id = p_chat;
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong');
  END IF;

  INSERT INTO public.telegram_children (chat_id, student_id, school_id)
  SELECT p_chat, v_student, st.school_id FROM public.students st WHERE st.id = v_student
  ON CONFLICT DO NOTHING;

  UPDATE public.telegram_chats
  SET state = 'idle', pending_student = NULL, attempts = 0, blocked_until = NULL, updated_at = now()
  WHERE chat_id = p_chat;

  RETURN jsonb_build_object('ok', true, 'child', (
    SELECT jsonb_build_object('id', st.id, 'name', st.last_name || ' ' || st.first_name, 'class', c.name)
    FROM public.students st
    LEFT JOIN public.enrollments e ON e.student_id = st.id AND e.status = 'active'
    LEFT JOIN public.classes c ON c.id = e.class_id
    WHERE st.id = v_student
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.telegram_set_state(p_chat bigint, p_state text)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.telegram_chats
  SET state = p_state, pending_student = CASE WHEN p_state = 'idle' THEN NULL ELSE pending_student END,
      updated_at = now()
  WHERE chat_id = p_chat AND p_state IN ('idle', 'awaiting_child', 'awaiting_code');
$$;

CREATE OR REPLACE FUNCTION public.telegram_unlink(p_chat bigint, p_student uuid)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM public.telegram_children WHERE chat_id = p_chat AND student_id = p_student;
$$;

-- ------------------------------------------------------------- what it reads

/**
 * Everything the bot ever shows about one child, in one shape.
 *
 * Names come back in all three languages because the choice of language belongs
 * to the chat, not to the query, and a parent who switches language should not
 * have to ask again.
 */
CREATE OR REPLACE FUNCTION public.telegram_report(
  p_chat bigint,
  p_student uuid,
  p_kind text,
  p_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid;
  v_day date;
  v_from date;
BEGIN
  IF NOT app.telegram_may_see(p_chat, p_student) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT st.school_id INTO v_school FROM public.students st WHERE st.id = p_student;
  v_day := coalesce(p_date, app.school_today(v_school));
  v_from := CASE WHEN p_kind = 'week' THEN v_day - 6 ELSE v_day END;

  RETURN jsonb_build_object(
    'child', (
      SELECT jsonb_build_object('name', st.last_name || ' ' || st.first_name, 'class', c.name)
      FROM public.students st
      LEFT JOIN public.enrollments e ON e.student_id = st.id AND e.status = 'active'
      LEFT JOIN public.classes c ON c.id = e.class_id
      WHERE st.id = p_student
    ),
    'from', v_from,
    'to', v_day,
    'grades', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'date', g.grade_date,
        'score', g.score,
        'max', g.max_score,
        'subject', jsonb_build_object('tg', s.name_tg, 'ru', s.name_ru, 'en', s.name_en),
        'work', jsonb_build_object('tg', at.name_tg, 'ru', at.name_ru, 'en', at.name_en),
        'final', at.is_final
      ) ORDER BY g.grade_date, s.name_tg), '[]'::jsonb)
      FROM public.grades g
      JOIN public.class_subjects cs ON cs.id = g.class_subject_id
      JOIN public.subjects s ON s.id = cs.subject_id
      JOIN public.assessment_types at ON at.id = g.assessment_type_id
      WHERE g.student_id = p_student AND g.grade_date BETWEEN v_from AND v_day
    ),
    'attendance', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'date', a.attendance_date,
        'status', a.status,
        'period', a.period_number,
        'subject', jsonb_build_object('tg', s.name_tg, 'ru', s.name_ru, 'en', s.name_en)
      ) ORDER BY a.attendance_date, a.period_number), '[]'::jsonb)
      FROM public.attendance_records a
      LEFT JOIN public.class_subjects cs ON cs.id = a.class_subject_id
      LEFT JOIN public.subjects s ON s.id = cs.subject_id
      WHERE a.student_id = p_student AND a.attendance_date BETWEEN v_from AND v_day
        AND a.status <> 'present'
    ),
    -- Sunday is not a school day here, so a request made on one shows Monday's
    -- lessons rather than an empty page.
    'timetable', CASE WHEN p_kind <> 'timetable' THEN '[]'::jsonb ELSE (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'period', te.period_number,
        'subject', jsonb_build_object('tg', s.name_tg, 'ru', s.name_ru, 'en', s.name_en),
        'room', r.name,
        'teacher', nullif(btrim(coalesce(t.last_name, '') || ' ' || coalesce(t.first_name, '')), '')
      ) ORDER BY te.period_number), '[]'::jsonb)
      FROM public.timetable_entries te
      JOIN public.class_subjects cs ON cs.id = te.class_subject_id
      JOIN public.subjects s ON s.id = cs.subject_id
      JOIN public.enrollments e ON e.class_id = te.class_id AND e.student_id = p_student AND e.status = 'active'
      LEFT JOIN public.rooms r ON r.id = te.room_id
      LEFT JOIN public.staff t ON t.id = te.teacher_id
      WHERE te.day_of_week = least(extract(isodow FROM v_day)::int, 6)
    ) END
  );
END;
$$;

-- ---------------------------------------------------------------- the outbox

/**
 * Claims what is due and hands it over ready to word.
 *
 * Claiming and sending cannot be one step — Telegram might accept a message and
 * the process die before the row is marked — so a claimed row is stamped with
 * an attempt, and a row that has been attempted three times without success is
 * left alone for somebody to look at. Better a message that never arrives than
 * a parent woken every minute by the same one.
 *
 * A claim also pushes the row ninety seconds into the future. The sender runs
 * every minute, and two runs that overlap — a slow one and the next — would
 * otherwise both pick up the same message and send it twice. Ninety seconds is
 * longer than the run and shorter than anybody's patience: a batch whose
 * process died is tried again on the run after next.
 */
CREATE OR REPLACE FUNCTION public.telegram_due(p_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_ids FROM (
    SELECT o.id FROM public.telegram_outbox o
    WHERE o.sent_at IS NULL AND o.send_after <= now() AND o.attempts < 3
    ORDER BY o.send_after
    LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
    FOR UPDATE SKIP LOCKED
  ) due;
  IF v_ids IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  UPDATE public.telegram_outbox
  SET attempts = attempts + 1, send_after = now() + interval '90 seconds'
  WHERE id = ANY (v_ids);

  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id,
      'chat', o.chat_id,
      'locale', ch.locale,
      'kind', o.kind,
      'date', o.payload ->> 'date',
      'school', jsonb_build_object('name', sc.short_name, 'slug', sc.slug),
      'child', jsonb_build_object(
        'name', st.last_name || ' ' || st.first_name,
        'class', (SELECT c.name FROM public.enrollments e JOIN public.classes c ON c.id = e.class_id
                   WHERE e.student_id = st.id AND e.status = 'active' LIMIT 1)
      ),
      'grade', CASE WHEN o.kind <> 'grade' THEN NULL ELSE (
        SELECT jsonb_build_object(
          'score', g.score, 'max', g.max_score, 'date', g.grade_date, 'final', at.is_final,
          'subject', jsonb_build_object('tg', s.name_tg, 'ru', s.name_ru, 'en', s.name_en),
          'work', jsonb_build_object('tg', at.name_tg, 'ru', at.name_ru, 'en', at.name_en))
        FROM public.grades g
        JOIN public.class_subjects cs ON cs.id = g.class_subject_id
        JOIN public.subjects s ON s.id = cs.subject_id
        JOIN public.assessment_types at ON at.id = g.assessment_type_id
        WHERE g.id = (o.payload ->> 'grade')::uuid) END,
      'absence', CASE WHEN o.kind <> 'absence' THEN NULL ELSE (
        SELECT jsonb_build_object(
          'status', a.status, 'date', a.attendance_date, 'period', a.period_number,
          'subject', jsonb_build_object('tg', s.name_tg, 'ru', s.name_ru, 'en', s.name_en))
        FROM public.attendance_records a
        LEFT JOIN public.class_subjects cs ON cs.id = a.class_subject_id
        LEFT JOIN public.subjects s ON s.id = cs.subject_id
        WHERE a.id = (o.payload ->> 'attendance')::uuid) END,
      'digest', CASE WHEN o.kind <> 'digest' THEN NULL
        ELSE public.telegram_report(o.chat_id, o.student_id, 'day', (o.payload ->> 'date')::date) END
    ) ORDER BY o.send_after), '[]'::jsonb)
    FROM public.telegram_outbox o
    JOIN public.telegram_chats ch ON ch.chat_id = o.chat_id
    JOIN public.students st ON st.id = o.student_id
    JOIN public.schools sc ON sc.id = o.school_id
    WHERE o.id = ANY (v_ids)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.telegram_delivered(p_ids uuid[])
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.telegram_outbox SET sent_at = now(), last_error = NULL WHERE id = ANY (p_ids);
$$;

CREATE OR REPLACE FUNCTION public.telegram_failed(p_id uuid, p_error text)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.telegram_outbox SET last_error = left(coalesce(p_error, ''), 300) WHERE id = p_id;
$$;

/** A chat that blocked the bot stops being written to. */
CREATE OR REPLACE FUNCTION public.telegram_forget(p_chat bigint)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM public.telegram_chats WHERE chat_id = p_chat;
$$;

-- ------------------------------------------------------- codes for the school

/**
 * The sheet the school hands out: one code per pupil in a class, shown once.
 *
 * Only the hash is kept, so re-issuing is the only way to recover a lost code —
 * which is right. Re-issuing invalidates the old one, and any parent already
 * linked stays linked: the code is a door, not a licence.
 */
CREATE OR REPLACE FUNCTION public.issue_parent_codes(p_class uuid)
RETURNS TABLE (student_id uuid, class_name text, full_name text, nickname text, login text, code text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
-- The returned columns are also variables in here, and one of them is called
-- student_id, which is the name of a real column in two of the tables below.
-- Columns win.
#variable_conflict use_column
DECLARE
  v_school uuid;
  v_actor uuid := (SELECT auth.uid());
BEGIN
  SELECT c.school_id INTO v_school FROM public.classes c WHERE c.id = p_class;
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = '22023';
  END IF;
  IF NOT app.can(v_school, 'students.update') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH roster AS (
    SELECT st.id, st.last_name, st.first_name, u.nickname, u.public_id, c.name AS class_name,
           app.random_parent_code() AS fresh
    FROM public.enrollments e
    JOIN public.students st ON st.id = e.student_id
    JOIN public.classes c ON c.id = e.class_id
    LEFT JOIN public.users u ON u.id = st.user_id
    WHERE e.class_id = p_class AND e.status = 'active' AND st.status = 'active'
  ), written AS (
    INSERT INTO public.parent_codes (student_id, school_id, code_hash, issued_at, issued_by)
    SELECT r.id, v_school, extensions.crypt(r.fresh, extensions.gen_salt('bf', 10)), now(), v_actor
    FROM roster r
    ON CONFLICT (student_id) DO UPDATE
      SET code_hash = excluded.code_hash, issued_at = now(), issued_by = excluded.issued_by
    RETURNING parent_codes.student_id
  )
  SELECT r.id, r.class_name::text, (r.last_name || ' ' || r.first_name)::text,
         r.nickname::text, r.public_id::text, r.fresh
  FROM roster r
  WHERE r.id IN (SELECT w.student_id FROM written w)
  ORDER BY r.last_name, r.first_name;

  PERFORM app.write_audit(v_school, 'issue_parent_codes', 'classes', p_class,
                          NULL::jsonb, NULL::jsonb, NULL::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.issue_parent_codes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_parent_codes(uuid) TO authenticated;

-- The bot's own functions answer to the webhook and to nobody else.
DO $$
DECLARE v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.telegram_touch(bigint, text)',
    'public.telegram_set_locale(bigint, text)',
    'public.telegram_set_subscribed(bigint, boolean)',
    'public.telegram_find_child(bigint, text)',
    'public.telegram_confirm_child(bigint, text)',
    'public.telegram_set_state(bigint, text)',
    'public.telegram_unlink(bigint, uuid)',
    'public.telegram_report(bigint, uuid, text, date)',
    'public.telegram_due(int)',
    'public.telegram_delivered(uuid[])',
    'public.telegram_failed(uuid, text)',
    'public.telegram_forget(bigint)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn);
  END LOOP;
END $$;
