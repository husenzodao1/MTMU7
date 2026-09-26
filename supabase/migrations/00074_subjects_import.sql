-- ============================================================================
-- 00074 · The school's subjects from a workbook.
--
-- One row per subject: the Tajik name, and when the office has them the
-- Russian and English names, a short code and the usual hours a week. A row
-- whose name the school already has updates that subject and brings it back
-- from the archive; any other row adds one. A code that already belongs to a
-- different subject is an error rather than a rename: a slip of the finger in
-- the code column must not quietly turn Mathematics into something else.
--
-- The timetable import already creates the subjects it meets, by their Tajik
-- name alone. This is how the list is set up before the timetable, or given
-- its other names and codes afterwards, in one go instead of one form each.
--
-- Nothing is written unless every row is right: the preview and the import
-- are the same function, with one flag.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.import_subjects(p_rows jsonb, p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school uuid := app.current_school_id();
  v_total int;
  v_errors jsonb := '[]'::jsonb;
  v_row jsonb;
  v_index int;
  v_number int;
  v_name text;
  v_ru text;
  v_en text;
  v_code text;
  v_hours_text text;
  v_hours numeric;
  v_seen_names text[] := ARRAY[]::text[];
  v_seen_codes text[] := ARRAY[]::text[];
  v_by_name uuid;
  v_by_code uuid;
  v_created int := 0;
  v_updated int := 0;
  v_new text[] := ARRAY[]::text[];
  v_pass int;
BEGIN
  IF v_school IS NULL OR NOT app.can(v_school, 'subjects.manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'invalid_import_size' USING ERRCODE = '22023';
  END IF;
  v_total := jsonb_array_length(p_rows);
  IF v_total = 0 THEN
    RAISE EXCEPTION 'empty_import' USING ERRCODE = '22023';
  END IF;
  IF v_total > 300 THEN
    RAISE EXCEPTION 'import_too_large' USING ERRCODE = '22023';
  END IF;

  -- Pass 1 checks every row and counts what would happen; pass 2, only when
  -- nothing is wrong and this is not a preview, writes it.
  FOR v_pass IN 1 .. 2 LOOP
    EXIT WHEN v_pass = 2 AND (p_dry_run OR jsonb_array_length(v_errors) > 0);

    FOR v_index IN 0 .. v_total - 1 LOOP
      v_number := v_index + 1;
      v_row := p_rows -> v_index;
      v_name := nullif(regexp_replace(btrim(coalesce(v_row ->> 'name_tg', '')), '\s+', ' ', 'g'), '');
      v_ru := nullif(regexp_replace(btrim(coalesce(v_row ->> 'name_ru', '')), '\s+', ' ', 'g'), '');
      v_en := nullif(regexp_replace(btrim(coalesce(v_row ->> 'name_en', '')), '\s+', ' ', 'g'), '');
      v_code := nullif(upper(btrim(coalesce(v_row ->> 'code', ''))), '');
      v_hours_text := nullif(replace(btrim(coalesce(v_row ->> 'weekly_hours', '')), ',', '.'), '');
      v_hours := NULL;

      IF v_pass = 1 THEN
        IF v_name IS NULL THEN
          v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'name_tg', 'code', 'required');
        ELSIF length(v_name) > 200 THEN
          v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'name_tg', 'code', 'too_long');
        ELSIF lower(v_name) = ANY (v_seen_names) THEN
          v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'name_tg', 'code', 'duplicate_in_file');
        ELSE
          v_seen_names := v_seen_names || lower(v_name);
        END IF;
        IF length(coalesce(v_ru, '')) > 200 THEN
          v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'name_ru', 'code', 'too_long');
        END IF;
        IF length(coalesce(v_en, '')) > 200 THEN
          v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'name_en', 'code', 'too_long');
        END IF;
        IF v_code IS NOT NULL THEN
          IF v_code !~ '^[A-Z0-9_-]{1,20}$' THEN
            v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'code', 'code', 'invalid_code');
          ELSIF v_code = ANY (v_seen_codes) THEN
            v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'code', 'code', 'duplicate_in_file');
          ELSE
            v_seen_codes := v_seen_codes || v_code;
          END IF;
        END IF;
        -- Two steps, because SQL does not promise to test the shape before
        -- it tries the cast.
        IF v_hours_text IS NOT NULL AND v_hours_text !~ '^\d{1,2}(\.\d)?$' THEN
          v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'weekly_hours', 'code', 'invalid_hours');
        ELSIF v_hours_text IS NOT NULL AND (v_hours_text::numeric <= 0 OR v_hours_text::numeric > 20) THEN
          v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'weekly_hours', 'code', 'invalid_hours');
        END IF;
      END IF;
      CONTINUE WHEN v_name IS NULL;
      IF v_hours_text ~ '^\d{1,2}(\.\d)?$' THEN
        v_hours := v_hours_text::numeric;
      END IF;

      -- The name decides which subject a row is (it is unique per school).
      SELECT s.id INTO v_by_name FROM public.subjects s
      WHERE s.school_id = v_school AND lower(btrim(s.name_tg)) = lower(v_name);
      v_by_code := NULL;
      IF v_code IS NOT NULL THEN
        SELECT s.id INTO v_by_code FROM public.subjects s WHERE s.school_id = v_school AND s.code = v_code;
      END IF;

      IF v_pass = 1 THEN
        IF v_by_code IS NOT NULL AND v_by_code IS DISTINCT FROM v_by_name THEN
          v_errors := v_errors || jsonb_build_object('row', v_number, 'field', 'code', 'code', 'code_taken', 'detail', v_code);
        ELSIF v_by_name IS NULL THEN
          v_created := v_created + 1;
          v_new := v_new || v_name;
        ELSE
          v_updated := v_updated + 1;
        END IF;
        CONTINUE;
      END IF;

      IF v_by_name IS NULL THEN
        INSERT INTO public.subjects (school_id, name_tg, name_ru, name_en, code, default_weekly_hours)
        VALUES (v_school, v_name, v_ru, v_en, v_code, v_hours);
      ELSE
        -- An empty cell leaves what the subject already has.
        UPDATE public.subjects s
        SET name_tg = v_name,
            name_ru = coalesce(v_ru, s.name_ru),
            name_en = coalesce(v_en, s.name_en),
            code = coalesce(v_code, s.code),
            default_weekly_hours = coalesce(v_hours, s.default_weekly_hours),
            is_active = true,
            updated_at = now()
        WHERE s.id = v_by_name;
      END IF;
    END LOOP;
  END LOOP;

  IF NOT p_dry_run AND jsonb_array_length(v_errors) = 0 THEN
    PERFORM app.write_audit(v_school, 'import', 'subjects', NULL, NULL, NULL,
      jsonb_build_object('rows', v_total, 'created', v_created, 'updated', v_updated));
  END IF;

  RETURN jsonb_build_object(
    'valid', jsonb_array_length(v_errors) = 0,
    'total', v_total,
    'errors', v_errors,
    'created', v_created,
    'updated', v_updated,
    'newSubjects', to_jsonb(v_new)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.import_subjects(jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_subjects(jsonb, boolean) TO authenticated;
