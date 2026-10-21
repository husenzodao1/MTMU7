-- ============================================================================
-- Supabase compatibility bootstrap for in-process PostgreSQL (PGlite).
--
-- Mirrors the parts of a Supabase project that the migrations and RLS policies
-- depend on: API roles, default grants, auth schema + auth.uid(), the storage
-- schema and the realtime publication. It is used ONLY by the test harness and
-- the type generator; it is never applied to a real Supabase project.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- API roles ------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public, extensions TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

-- auth schema ------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- GoTrue's own table, with the full column set of a Supabase project.
--
-- The column list is the point. An account this platform creates for itself
-- must be indistinguishable from one GoTrue created, and 00044 exists because
-- four of these columns are read into non-nullable Go strings while carrying no
-- default of their own. They are left without one here for exactly that reason:
-- a shim that quietly defaulted them to '' would let a test pass on a row that
-- production could not read.
CREATE TABLE IF NOT EXISTS auth.users (
  instance_id uuid,
  id uuid PRIMARY KEY,
  aud varchar(255),
  role varchar(255),
  email varchar(255),
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  invited_at timestamptz,
  confirmation_token varchar(255),
  confirmation_sent_at timestamptz,
  recovery_token varchar(255),
  recovery_sent_at timestamptz,
  email_change_token_new varchar(255),
  email_change varchar(255),
  email_change_sent_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  is_super_admin boolean,
  created_at timestamptz,
  updated_at timestamptz,
  phone text DEFAULT NULL,
  phone_confirmed_at timestamptz,
  phone_change text DEFAULT '',
  phone_change_token varchar(255) DEFAULT '',
  phone_change_sent_at timestamptz,
  confirmed_at timestamptz GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
  email_change_token_current varchar(255) DEFAULT '',
  email_change_confirm_status smallint DEFAULT 0,
  banned_until timestamptz,
  reauthentication_token varchar(255) DEFAULT '',
  reauthentication_sent_at timestamptz,
  is_sso_user boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  is_anonymous boolean NOT NULL DEFAULT false,
  CONSTRAINT users_email_change_confirm_status_check
    CHECK (email_change_confirm_status >= 0 AND email_change_confirm_status <= 2)
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_partial_key ON auth.users (email) WHERE is_sso_user = false;
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_key ON auth.users (phone) WHERE phone IS NOT NULL;

CREATE TABLE IF NOT EXISTS auth.identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  identity_data jsonb NOT NULL,
  provider text NOT NULL,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  CONSTRAINT identities_provider_id_provider_unique UNIQUE (provider_id, provider)
);

-- The part of Supabase's MFA schema the migrations read: which users have a
-- verified second factor. The real table keys status as an enum; text compares
-- the same way against the literal 'verified'.
CREATE TABLE IF NOT EXISTS auth.mfa_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friendly_name text,
  factor_type text NOT NULL DEFAULT 'totp',
  status text NOT NULL DEFAULT 'unverified',
  secret text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mfa_factors_user_id_idx ON auth.mfa_factors (user_id);

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT nullif(auth.jwt() ->> 'role', '')
$$;

CREATE OR REPLACE FUNCTION auth.email() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT nullif(auth.jwt() ->> 'email', '')
$$;

GRANT EXECUTE ON FUNCTION auth.jwt(), auth.uid(), auth.role(), auth.email()
  TO anon, authenticated, service_role;

-- storage schema -----------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS storage;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  owner uuid,
  public boolean DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text,
  owner uuid,
  owner_id text,
  metadata jsonb,
  path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/')) STORED,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_accessed_at timestamptz DEFAULT now(),
  CONSTRAINT bucketid_objname UNIQUE (bucket_id, name)
);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
GRANT ALL ON storage.objects, storage.buckets TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[]
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE _parts text[];
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  RETURN _parts[1 : array_length(_parts, 1) - 1];
END $$;

CREATE OR REPLACE FUNCTION storage.filename(name text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE _parts text[];
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  RETURN _parts[array_length(_parts, 1)];
END $$;

CREATE OR REPLACE FUNCTION storage.extension(name text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE _parts text[]; _filename text;
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  SELECT _parts[array_length(_parts, 1)] INTO _filename;
  RETURN reverse(split_part(reverse(_filename), '.', 1));
END $$;

GRANT EXECUTE ON FUNCTION storage.foldername(text), storage.filename(text), storage.extension(text)
  TO anon, authenticated, service_role;

-- realtime publication ------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;
