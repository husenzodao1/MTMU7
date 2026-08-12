-- Schools table
CREATE TABLE public.schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  short_name VARCHAR(100) NOT NULL,
  full_name VARCHAR(500) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  logo_url VARCHAR(500),
  description_tg TEXT,
  description_ru TEXT,
  address VARCHAR(500),
  phone VARCHAR(50),
  email VARCHAR(255),
  website VARCHAR(255),
  id_prefix VARCHAR(5) NOT NULL DEFAULT 'MT',
  id_sequence BIGINT NOT NULL DEFAULT 10000,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT schools_id_prefix_length CHECK (char_length(id_prefix) >= 1 AND char_length(id_prefix) <= 5),
  CONSTRAINT schools_id_sequence_positive CHECK (id_sequence >= 0)
);
