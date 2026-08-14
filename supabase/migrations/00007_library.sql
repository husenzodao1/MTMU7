-- Library categories
CREATE TABLE public.library_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  parent_id UUID REFERENCES public.library_categories(id) ON DELETE RESTRICT,
  name_tg VARCHAR(200) NOT NULL,
  name_ru VARCHAR(200),
  slug VARCHAR(100) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT lib_categories_school_slug_unique UNIQUE (school_id, slug),
  CONSTRAINT lib_categories_school_parent_name_unique UNIQUE (school_id, parent_id, name_tg)
);

CREATE INDEX idx_lib_categories_school ON public.library_categories(school_id);
CREATE INDEX idx_lib_categories_parent ON public.library_categories(parent_id) WHERE parent_id IS NOT NULL;

-- Library items
CREATE TABLE public.library_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  title VARCHAR(500) NOT NULL,
  author VARCHAR(300),
  description TEXT,
  cover_url VARCHAR(500),
  file_url VARCHAR(500) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT NOT NULL,
  file_type VARCHAR(20) NOT NULL,
  category_id UUID NOT NULL REFERENCES public.library_categories(id) ON DELETE RESTRICT,
  language VARCHAR(10) NOT NULL DEFAULT 'tg',
  publication_year INT,
  publisher VARCHAR(300),
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  grade_level INT,
  visibility VARCHAR(20) NOT NULL DEFAULT 'all',
  is_published BOOLEAN NOT NULL DEFAULT true,
  unpublished_at TIMESTAMPTZ,
  uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  metadata JSONB,
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(author, '') || ' ' || coalesce(description, ''))
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT lib_items_file_type_check CHECK (file_type IN ('pdf', 'epub', 'audio', 'image', 'document')),
  CONSTRAINT lib_items_file_size_check CHECK (file_size > 0),
  CONSTRAINT lib_items_grade_level_check CHECK (grade_level IS NULL OR (grade_level >= 1 AND grade_level <= 11)),
  CONSTRAINT lib_items_visibility_check CHECK (visibility IN ('all', 'teachers', 'admin', 'specific'))
);

CREATE INDEX idx_lib_items_school ON public.library_items(school_id);
CREATE INDEX idx_lib_items_school_category ON public.library_items(school_id, category_id);
CREATE INDEX idx_lib_items_school_subject ON public.library_items(school_id, subject_id) WHERE subject_id IS NOT NULL;
CREATE INDEX idx_lib_items_school_published ON public.library_items(school_id, is_published);
CREATE INDEX idx_lib_items_search ON public.library_items USING gin(search_vector);

-- Library item access rules (for visibility='specific')
CREATE TABLE public.library_item_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.library_items(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  role_id UUID REFERENCES public.roles(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,

  CONSTRAINT lib_item_access_has_target CHECK (role_id IS NOT NULL OR class_id IS NOT NULL),
  CONSTRAINT lib_item_access_unique UNIQUE (item_id, role_id, class_id)
);

-- Library favorites
CREATE TABLE public.library_favorites (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.library_items(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, item_id)
);

-- Library reading history
CREATE TABLE public.library_reading_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.library_items(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  last_page INT,
  last_position VARCHAR(100),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT lib_reading_history_unique UNIQUE (user_id, item_id),
  CONSTRAINT lib_reading_history_page_check CHECK (last_page IS NULL OR last_page >= 0)
);

CREATE INDEX idx_lib_history_user ON public.library_reading_history(user_id);
