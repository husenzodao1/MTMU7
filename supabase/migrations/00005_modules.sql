-- Module catalog (global)
CREATE TABLE public.modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(50) UNIQUE NOT NULL,
  name_tg VARCHAR(100) NOT NULL,
  name_ru VARCHAR(100),
  description_tg TEXT,
  description_ru TEXT,
  icon VARCHAR(50),
  route VARCHAR(100),
  is_system BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- School-specific module enablement
CREATE TABLE public.school_modules (
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  module_id UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  enabled_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,

  PRIMARY KEY (school_id, module_id)
);

-- Module visibility per role per school
CREATE TABLE public.module_role_access (
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  module_id UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  is_visible BOOLEAN NOT NULL DEFAULT true,

  PRIMARY KEY (school_id, module_id, role_id)
);
