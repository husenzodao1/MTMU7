-- Academic years
CREATE TABLE public.academic_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  name VARCHAR(20) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT academic_years_school_name_unique UNIQUE (school_id, name),
  CONSTRAINT academic_years_dates_check CHECK (end_date > start_date)
);

CREATE UNIQUE INDEX idx_academic_years_one_current
  ON public.academic_years(school_id) WHERE is_current = true;

-- Classes
CREATE TABLE public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  name VARCHAR(20) NOT NULL,
  grade_level INT NOT NULL,
  homeroom_teacher_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT classes_school_year_name_unique UNIQUE (school_id, academic_year_id, name),
  CONSTRAINT classes_grade_level_check CHECK (grade_level >= 1 AND grade_level <= 11)
);

CREATE INDEX idx_classes_school_year ON public.classes(school_id, academic_year_id);
CREATE INDEX idx_classes_school_active ON public.classes(school_id, is_active);

-- Subjects
CREATE TABLE public.subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  name_tg VARCHAR(200) NOT NULL,
  name_ru VARCHAR(200),
  code VARCHAR(20),
  is_active BOOLEAN NOT NULL DEFAULT true,
  deactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_subjects_school_code
  ON public.subjects(school_id, code) WHERE code IS NOT NULL;
CREATE INDEX idx_subjects_school ON public.subjects(school_id);

-- Class-Student assignments
CREATE TABLE public.class_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT class_students_unique UNIQUE (class_id, student_id)
);

CREATE INDEX idx_class_students_school ON public.class_students(school_id);
CREATE INDEX idx_class_students_student ON public.class_students(student_id);

-- Teacher-Subject-Class assignments
CREATE TABLE public.teacher_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,

  CONSTRAINT teacher_subjects_unique UNIQUE (teacher_id, subject_id, class_id, academic_year_id)
);

CREATE INDEX idx_teacher_subjects_school ON public.teacher_subjects(school_id);
CREATE INDEX idx_teacher_subjects_teacher ON public.teacher_subjects(teacher_id);
