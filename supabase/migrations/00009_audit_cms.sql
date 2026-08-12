-- Audit logs (immutable)
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  user_id UUID,
  user_public_id VARCHAR(32),
  action VARCHAR(30) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT audit_logs_action_check CHECK (action IN (
    'create', 'update', 'delete', 'login', 'logout',
    'enable', 'disable', 'assign', 'revoke'
  ))
);

CREATE INDEX idx_audit_school_created ON public.audit_logs(school_id, created_at DESC);
CREATE INDEX idx_audit_school_user ON public.audit_logs(school_id, user_id);
CREATE INDEX idx_audit_entity ON public.audit_logs(entity_type, entity_id);

-- CMS Pages
CREATE TABLE public.pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  slug VARCHAR(100) NOT NULL,
  title_tg VARCHAR(300) NOT NULL,
  title_ru VARCHAR(300),
  is_published BOOLEAN NOT NULL DEFAULT false,
  unpublished_at TIMESTAMPTZ,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT pages_school_slug_unique UNIQUE (school_id, slug)
);

CREATE INDEX idx_pages_school_published ON public.pages(school_id, is_published);

-- CMS Content blocks
CREATE TABLE public.content_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  page_id UUID REFERENCES public.pages(id) ON DELETE CASCADE,
  section VARCHAR(50) NOT NULL,
  type VARCHAR(20) NOT NULL,
  title_tg TEXT,
  title_ru TEXT,
  body_tg TEXT,
  body_ru TEXT,
  image_url VARCHAR(500),
  link_url VARCHAR(500),
  is_visible BOOLEAN NOT NULL DEFAULT true,
  hidden_at TIMESTAMPTZ,
  sort_order INT NOT NULL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT content_blocks_type_check CHECK (type IN ('text', 'image', 'html', 'banner', 'gallery'))
);

CREATE INDEX idx_content_blocks_school_page ON public.content_blocks(school_id, page_id);
CREATE INDEX idx_content_blocks_section ON public.content_blocks(school_id, section);
