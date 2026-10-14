-- ============================================================================
-- 00085 · Report cards.
--
-- A report card is one page a pupil takes home: every subject, the mark for
-- each quarter and for the year, and the lessons missed. These two functions
-- give the portal the numbers for a whole class in one call each, already
-- added up, so the page (a PDF) is quick for thirty pupils as for one.
--
-- They run as the caller (SECURITY INVOKER): a pupil gets only their own
-- marks, a parent their children's, a class teacher their class's — the same
-- rows the grades page would show them, never more.
-- ============================================================================

/**
 * Per pupil, subject and term: the term and year marks set by the teacher
 * (kind = the assessment code, 'term_final' or 'year_final'), and the average
 * of the everyday marks on the five-point scale (kind = 'average').
 */
CREATE OR REPLACE FUNCTION public.report_card_marks(p_class_id uuid)
RETURNS TABLE (
  student_id uuid, class_subject_id uuid, academic_term_id uuid,
  kind text, mark numeric, approved boolean, marks_count int
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT g.student_id, g.class_subject_id, g.academic_term_id,
         at.code::text, round(g.score / g.max_score * 5, 1), g.status = 'approved', 1
  FROM public.grades g
  JOIN public.class_subjects cs ON cs.id = g.class_subject_id AND cs.class_id = p_class_id
  JOIN public.assessment_types at ON at.id = g.assessment_type_id
  WHERE at.is_final
  UNION ALL
  SELECT g.student_id, g.class_subject_id, g.academic_term_id,
         'average', round(sum(g.score / g.max_score * 5 * at.weight) / nullif(sum(at.weight), 0), 1), true, count(*)::int
  FROM public.grades g
  JOIN public.class_subjects cs ON cs.id = g.class_subject_id AND cs.class_id = p_class_id
  JOIN public.assessment_types at ON at.id = g.assessment_type_id
  WHERE NOT at.is_final AND g.academic_term_id IS NOT NULL
  GROUP BY g.student_id, g.class_subject_id, g.academic_term_id
$$;
REVOKE EXECUTE ON FUNCTION public.report_card_marks(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_card_marks(uuid) TO authenticated;

/** Per pupil and term of the class's year: the lessons missed and the times late. */
CREATE OR REPLACE FUNCTION public.report_card_attendance(p_class_id uuid)
RETURNS TABLE (student_id uuid, academic_term_id uuid, absent int, late int)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT a.student_id, t.id,
         (count(*) FILTER (WHERE a.status = 'absent'))::int,
         (count(*) FILTER (WHERE a.status = 'late'))::int
  FROM public.attendance_records a
  JOIN public.classes c ON c.id = a.class_id
  JOIN public.academic_terms t
    ON t.academic_year_id = c.academic_year_id
   AND t.kind IN ('quarter', 'semester', 'trimester', 'term')
   AND a.attendance_date BETWEEN t.start_date AND t.end_date
  WHERE a.class_id = p_class_id
  GROUP BY a.student_id, t.id
$$;
REVOKE EXECUTE ON FUNCTION public.report_card_attendance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_card_attendance(uuid) TO authenticated;
