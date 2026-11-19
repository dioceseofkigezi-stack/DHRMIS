-- Let each signed-in user read and update only their own protected username.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_username()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $function$
  SELECT username
  FROM public.admin_usernames
  WHERE user_id = auth.uid();
$function$;

REVOKE ALL ON FUNCTION public.get_my_username() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_username() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_my_username(p_username TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $function$
DECLARE
  actor_id UUID := auth.uid();
  next_username TEXT := NULLIF(BTRIM(p_username), '');
  previous_username TEXT;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Sign in to update your username.' USING ERRCODE = '42501';
  END IF;
  IF next_username IS NOT NULL AND next_username !~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,39}$' THEN
    RAISE EXCEPTION 'Use 3 to 40 characters for the username: letters, numbers, periods, underscores, or hyphens.' USING ERRCODE = '22023';
  END IF;

  SELECT username INTO previous_username
  FROM public.admin_usernames
  WHERE user_id = actor_id
  FOR UPDATE;

  IF previous_username IS NOT DISTINCT FROM next_username THEN
    RETURN COALESCE(next_username, '');
  END IF;

  INSERT INTO public.admin_usernames AS existing_username (user_id, username)
  VALUES (actor_id, next_username)
  ON CONFLICT (user_id) DO UPDATE
    SET username = EXCLUDED.username,
        version = existing_username.version + 1;

  INSERT INTO public.audit_log (
    user_id, action, module, record_id, record_type, result,
    before_values, after_values, purpose, context
  ) VALUES (
    actor_id, 'USER_PROFILE_UPDATED', 'user_accounts', actor_id, 'auth.users', 'Success',
    jsonb_build_object('username', previous_username),
    jsonb_build_object('username', next_username),
    'User updated their own account username.',
    'Updated: username.'
  );

  RETURN COALESCE(next_username, '');
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'That username is already in use.' USING ERRCODE = '23505';
END;
$function$;

REVOKE ALL ON FUNCTION public.set_my_username(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_username(TEXT) TO authenticated;

COMMENT ON FUNCTION public.get_my_username() IS
  'Returns the authenticated user''s own optional account username.';
COMMENT ON FUNCTION public.set_my_username(TEXT) IS
  'Changes the authenticated user''s own optional unique account username and records the update.';

COMMIT;
