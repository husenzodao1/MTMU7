-- The parents' bot.
--
-- A parent has no account on the portal and should not need one. They have a
-- phone, Telegram, the name their child answers to, and a code the school gave
-- them on a sheet of paper. That is the whole of what this schema assumes.
--
-- Four tables:
--
--   parent_codes      one code per pupil, stored as a hash, never readable;
--   telegram_chats    one row per Telegram chat, holding where a conversation
--                     has got to and nothing about the person;
--   telegram_children which chats are allowed to hear about which pupils;
--   telegram_outbox   what is waiting to be sent, and when.
--
-- Nothing here sends anything. The database decides *that* a parent should be
-- told and *when*; the wording is the application's, because that is where the
-- school's three languages live. A row in the outbox is a fact — "this chat is
-- owed the news about this mark" — not a sentence.
--
-- The delay is the point of the outbox. A teacher fills in a column and then
-- corrects two squares in it; a parent who is told instantly gets three
-- messages and one of them is wrong. Twelve minutes later they get one, right.

-- ---------------------------------------------------------------- the codes

CREATE TABLE IF NOT EXISTS public.parent_codes (
  student_id uuid PRIMARY KEY REFERENCES public.students(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  issued_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);
-- No policies, on purpose. A code is only ever written by the definer function
-- that issues it and only ever read by the definer function that checks it.
ALTER TABLE public.parent_codes ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS parent_codes_school_idx ON public.parent_codes(school_id);

-- ------------------------------------------------------------- the chats

CREATE TABLE IF NOT EXISTS public.telegram_chats (
  chat_id bigint PRIMARY KEY,
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  locale text NOT NULL DEFAULT 'tg' CHECK (locale IN ('tg', 'ru', 'en')),
  -- Where the conversation has got to. 'idle' is both the beginning and the
  -- resting state: a parent who has linked a child is idle until they ask for
  -- something.
  state text NOT NULL DEFAULT 'idle' CHECK (state IN ('idle', 'awaiting_child', 'awaiting_code')),
  pending_student uuid REFERENCES public.students(id) ON DELETE SET NULL,
  -- Guessing a code is the only thing here worth attacking, so it is counted.
  attempts smallint NOT NULL DEFAULT 0,
  blocked_until timestamptz,
  subscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.telegram_chats ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.telegram_children (
  chat_id bigint NOT NULL REFERENCES public.telegram_chats(chat_id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, student_id)
);
ALTER TABLE public.telegram_children ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS telegram_children_student_idx ON public.telegram_children(student_id);

-- ------------------------------------------------------------- the outbox

CREATE TABLE IF NOT EXISTS public.telegram_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id bigint NOT NULL REFERENCES public.telegram_chats(chat_id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('grade', 'absence', 'digest')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NOT NULL,
  send_after timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  attempts smallint NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.telegram_outbox ENABLE ROW LEVEL SECURITY;

-- One pending message per thing that happened. A mark corrected before the
-- delay is up rewrites the message that has not gone yet; a mark corrected
-- afterwards earns a second message, because the parent has already read the
-- first one and is owed the correction.
CREATE UNIQUE INDEX IF NOT EXISTS telegram_outbox_pending_key
  ON public.telegram_outbox(dedupe_key) WHERE sent_at IS NULL;
CREATE INDEX IF NOT EXISTS telegram_outbox_due_idx
  ON public.telegram_outbox(send_after) WHERE sent_at IS NULL;

-- --------------------------------------------------------------- the pieces

/** Eight characters a parent has to read off paper and type on a phone. */
CREATE OR REPLACE FUNCTION app.random_parent_code()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = ''
AS $$
  SELECT string_agg(substr('23456789abcdefghijkmnpqrstuvwxyz',
                           (floor(random() * 32) + 1)::int, 1), '')
  FROM generate_series(1, 8);
$$;
REVOKE EXECUTE ON FUNCTION app.random_parent_code() FROM PUBLIC, anon, authenticated;

/**
 * Who a chat is allowed to hear about. Used by every read the bot makes, so
 * that a chat_id arriving from Telegram can never reach a pupil it was not
 * given.
 */
CREATE OR REPLACE FUNCTION app.telegram_may_see(p_chat bigint, p_student uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.telegram_children c
    WHERE c.chat_id = p_chat AND c.student_id = p_student
  );
$$;
REVOKE EXECUTE ON FUNCTION app.telegram_may_see(bigint, uuid) FROM PUBLIC, anon, authenticated;

/** Queues one message for every chat that follows this pupil. */
CREATE OR REPLACE FUNCTION app.telegram_enqueue(
  p_student uuid,
  p_kind text,
  p_key text,
  p_payload jsonb,
  p_delay interval
)
RETURNS int
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_count int := 0;
BEGIN
  INSERT INTO public.telegram_outbox (chat_id, school_id, student_id, kind, payload, dedupe_key, send_after)
  SELECT c.chat_id, c.school_id, p_student, p_kind, p_payload,
         c.chat_id::text || '|' || p_key, now() + p_delay
  FROM public.telegram_children c
  WHERE c.student_id = p_student
  ON CONFLICT (dedupe_key) WHERE sent_at IS NULL
  DO UPDATE SET payload = excluded.payload, last_error = NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.telegram_enqueue(uuid, text, text, jsonb, interval) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------ what triggers

/**
 * A mark was written. The parent hears in twelve minutes — long enough for the
 * teacher to finish the column and fix what they mistyped, short enough that
 * the child is still on the way home.
 */
CREATE OR REPLACE FUNCTION app.telegram_on_grade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.score IS NOT DISTINCT FROM OLD.score THEN
    RETURN NEW;
  END IF;
  PERFORM app.telegram_enqueue(
    NEW.student_id,
    'grade',
    'g:' || NEW.student_id::text || ':' || NEW.class_subject_id::text || ':' ||
      NEW.grade_date::text || ':' || NEW.assessment_type_id::text,
    jsonb_build_object('grade', NEW.id, 'date', NEW.grade_date),
    interval '12 minutes'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS telegram_on_grade ON public.grades;
CREATE TRIGGER telegram_on_grade
AFTER INSERT OR UPDATE OF score ON public.grades
FOR EACH ROW EXECUTE FUNCTION app.telegram_on_grade();

/**
 * An absence was recorded. Same delay, for the same reason: a register is
 * corrected while it is being kept.
 */
CREATE OR REPLACE FUNCTION app.telegram_on_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'present' THEN
    RETURN NEW;
  END IF;
  PERFORM app.telegram_enqueue(
    NEW.student_id,
    'absence',
    'a:' || NEW.student_id::text || ':' || NEW.attendance_date::text || ':' ||
      coalesce(NEW.class_subject_id::text, '-'),
    jsonb_build_object('attendance', NEW.id, 'date', NEW.attendance_date),
    interval '12 minutes'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS telegram_on_attendance ON public.attendance_records;
CREATE TRIGGER telegram_on_attendance
AFTER INSERT OR UPDATE OF status ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION app.telegram_on_attendance();

-- ------------------------------------------------------- the day's summary

/**
 * One message per child at the end of the school day: every mark of every
 * lesson and whether they were there. Queued once per child per day; the hour
 * is the school's own, in the school's own time zone, and defaults to six in
 * the evening.
 */
CREATE OR REPLACE FUNCTION public.telegram_enqueue_digests()
RETURNS int
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school record;
  v_today date;
  v_hour int;
  v_total int := 0;
  v_student uuid;
BEGIN
  FOR v_school IN SELECT s.id, s.timezone FROM public.schools s WHERE s.status = 'active' LOOP
    v_today := app.school_today(v_school.id);
    v_hour := app.school_setting_int(v_school.id, 'telegram_digest_hour', 18);
    CONTINUE WHEN extract(hour FROM (now() AT TIME ZONE coalesce(v_school.timezone, 'UTC'))) < v_hour;

    FOR v_student IN
      SELECT DISTINCT c.student_id FROM public.telegram_children c WHERE c.school_id = v_school.id
    LOOP
      -- Nothing happened, nothing to say. A parent does not want a nightly
      -- message telling them their child had an ordinary day with no marks.
      CONTINUE WHEN NOT EXISTS (
        SELECT 1 FROM public.grades g WHERE g.student_id = v_student AND g.grade_date = v_today
      ) AND NOT EXISTS (
        SELECT 1 FROM public.attendance_records a
        WHERE a.student_id = v_student AND a.attendance_date = v_today AND a.status <> 'present'
      );
      v_total := v_total + app.telegram_enqueue(
        v_student, 'digest', 'd:' || v_student::text || ':' || v_today::text,
        jsonb_build_object('date', v_today), interval '0 minutes'
      );
    END LOOP;
  END LOOP;
  RETURN v_total;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.telegram_enqueue_digests() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_enqueue_digests() TO service_role;
