-- Notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  type VARCHAR(30) NOT NULL,
  module VARCHAR(50) NOT NULL,
  title VARCHAR(300) NOT NULL,
  body TEXT,
  data JSONB,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT notifications_type_check CHECK (type IN (
    'message', 'grade', 'homework', 'schedule', 'attendance',
    'announcement', 'document', 'library', 'system'
  ))
);

CREATE INDEX idx_notifications_user_read ON public.notifications(user_id, is_read);
CREATE INDEX idx_notifications_school_user ON public.notifications(school_id, user_id);
CREATE INDEX idx_notifications_created ON public.notifications(school_id, created_at DESC);

-- Notification settings per school
CREATE TABLE public.notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  type VARCHAR(30) NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,

  CONSTRAINT notification_settings_school_type_unique UNIQUE (school_id, type),
  CONSTRAINT notification_settings_type_check CHECK (type IN (
    'message', 'grade', 'homework', 'schedule', 'attendance',
    'announcement', 'document', 'library', 'system'
  ))
);
