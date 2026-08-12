-- Users table (linked to auth.users)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  public_id VARCHAR(32) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  middle_name VARCHAR(100),
  avatar_url VARCHAR(500),
  phone VARCHAR(50),
  date_of_birth DATE,
  gender VARCHAR(10),
  is_active BOOLEAN NOT NULL DEFAULT true,
  deactivated_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT users_gender_check CHECK (gender IS NULL OR gender IN ('male', 'female'))
);

CREATE INDEX idx_users_school_id ON public.users(school_id);
CREATE INDEX idx_users_school_active ON public.users(school_id, is_active);

-- Function to generate public_id atomically
CREATE OR REPLACE FUNCTION public.generate_public_id()
RETURNS TRIGGER AS $$
DECLARE
  v_prefix VARCHAR(5);
  v_sequence BIGINT;
BEGIN
  UPDATE public.schools
  SET id_sequence = id_sequence + 1
  WHERE id = NEW.school_id
  RETURNING id_prefix, id_sequence INTO v_prefix, v_sequence;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'School not found: %', NEW.school_id;
  END IF;

  NEW.public_id := v_prefix || v_sequence::TEXT;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_generate_public_id
  BEFORE INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_public_id();
