-- Store administrator-managed usernames outside Supabase's protected auth schema.
BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_usernames (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT admin_usernames_format_check CHECK (
    username IS NULL OR username ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,39}$'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_usernames_username_unique_idx
  ON public.admin_usernames (LOWER(BTRIM(username)))
  WHERE username IS NOT NULL;

ALTER TABLE public.admin_usernames ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_usernames FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_usernames TO service_role;

CREATE OR REPLACE FUNCTION public.admin_set_user_username(
  p_user_id UUID,
  p_username TEXT,
  p_expected_version BIGINT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $function$
DECLARE
  changed_version BIGINT;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'A user account is required.' USING ERRCODE = '22023';
  END IF;
  IF p_username IS NOT NULL AND p_username !~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,39}$' THEN
    RAISE EXCEPTION 'Username format is invalid.' USING ERRCODE = '22023';
  END IF;

  IF p_expected_version IS NULL THEN
    IF p_username IS NULL THEN
      UPDATE public.admin_usernames AS username_row
      SET username = NULL,
          version = username_row.version + 1
      WHERE username_row.user_id = p_user_id
      RETURNING username_row.version INTO changed_version;
      RETURN COALESCE(changed_version, 0);
    END IF;

    INSERT INTO public.admin_usernames AS existing_username (user_id, username)
    VALUES (p_user_id, p_username)
    ON CONFLICT (user_id) DO UPDATE
      SET username = EXCLUDED.username,
          version = existing_username.version + 1
    RETURNING version INTO changed_version;
    RETURN changed_version;
  END IF;

  UPDATE public.admin_usernames AS username_row
  SET username = p_username,
      version = username_row.version + 1
  WHERE username_row.user_id = p_user_id
    AND username_row.version = p_expected_version
  RETURNING username_row.version INTO changed_version;
  RETURN COALESCE(changed_version, 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_user_username(UUID, TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_username(UUID, TEXT, BIGINT) TO service_role;

COMMENT ON TABLE public.admin_usernames IS
  'Unique usernames managed by the protected Super/System Administrator account editor.';

COMMIT;
