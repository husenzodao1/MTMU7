-- ============================================================================
-- 00076 · One evening report a day, not one a minute.
--
-- The outbox refused a second copy of a message only while the first was still
-- waiting (telegram_outbox_pending_key covers sent_at IS NULL). Marks and
-- absences are queued once, by a trigger, so that was enough for them. The
-- evening report is queued by telegram_enqueue_digests, which runs every
-- minute from the school's evening hour to midnight: the moment one report
-- went out, the next minute found nothing waiting under its key and queued it
-- again. From 18:00 a parent got the same report every minute until the day
-- changed.
--
-- A report is now queued for a chat only if that chat has never had it, sent
-- or not, and the table itself holds at most one report per chat and day.
-- ============================================================================

-- The copies already sent: keep the first of each.
DELETE FROM public.telegram_outbox o
USING public.telegram_outbox kept
WHERE o.kind = 'digest'
  AND kept.kind = 'digest'
  AND kept.dedupe_key = o.dedupe_key
  AND (kept.created_at, kept.id) < (o.created_at, o.id);

CREATE UNIQUE INDEX IF NOT EXISTS telegram_outbox_digest_once
  ON public.telegram_outbox (dedupe_key) WHERE kind = 'digest';

DROP FUNCTION IF EXISTS app.telegram_enqueue(uuid, text, text, jsonb, interval);

/**
 * Queues one message for every chat that follows this pupil. With p_once, a
 * chat that has ever had a message under this key — sent or waiting — gets
 * nothing: for the evening report, which is asked for every minute.
 */
CREATE OR REPLACE FUNCTION app.telegram_enqueue(
  p_student uuid,
  p_kind text,
  p_key text,
  p_payload jsonb,
  p_delay interval,
  p_once boolean DEFAULT false
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
    AND NOT (
      p_once AND EXISTS (
        SELECT 1 FROM public.telegram_outbox o WHERE o.dedupe_key = c.chat_id::text || '|' || p_key
      )
    )
  ON CONFLICT (dedupe_key) WHERE sent_at IS NULL
  DO UPDATE SET payload = excluded.payload, last_error = NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.telegram_enqueue(uuid, text, text, jsonb, interval, boolean) FROM PUBLIC, anon, authenticated;

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
        jsonb_build_object('date', v_today), interval '0 minutes', true
      );
    END LOOP;
  END LOOP;
  RETURN v_total;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.telegram_enqueue_digests() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_enqueue_digests() TO service_role;
