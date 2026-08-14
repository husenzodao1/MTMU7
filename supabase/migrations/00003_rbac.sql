-- Roles
CREATE TABLE public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  slug VARCHAR(50) NOT NULL,
  name_tg VARCHAR(100) NOT NULL,
  name_ru VARCHAR(100),
  level INT NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT roles_level_range CHECK (level >= 1 AND level <= 100),
  CONSTRAINT roles_school_slug_unique UNIQUE (school_id, slug)
);

CREATE INDEX idx_roles_school ON public.roles(school_id);

-- Permissions (global catalog)
CREATE TABLE public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) UNIQUE NOT NULL,
  module VARCHAR(50) NOT NULL,
  action VARCHAR(20) NOT NULL,
  name_tg VARCHAR(200) NOT NULL,
  name_ru VARCHAR(200),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT permissions_action_check CHECK (action IN ('read', 'create', 'update', 'delete', 'manage'))
);

CREATE INDEX idx_permissions_module ON public.permissions(module);
CREATE INDEX idx_permissions_module_action ON public.permissions(module, action);

-- User-Role assignments
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,

  CONSTRAINT user_roles_unique UNIQUE (user_id, role_id, school_id)
);

CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_school_user ON public.user_roles(school_id, user_id);

-- Role-Permission assignments
CREATE TABLE public.role_permissions (
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,

  PRIMARY KEY (role_id, permission_id)
);
