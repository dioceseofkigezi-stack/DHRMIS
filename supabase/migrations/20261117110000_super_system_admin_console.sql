-- Platform administration read models and log actor names. These APIs expose
-- account/access metadata only; departmental HR records remain blocked by RLS.
BEGIN;

ALTER TABLE public.security_event ADD COLUMN IF NOT EXISTS user_name TEXT;
ALTER TABLE public.sensitive_read_log ADD COLUMN IF NOT EXISTS user_name TEXT;

UPDATE public.security_event AS event_row
SET user_name = COALESCE(
  NULLIF(BTRIM(auth_user.raw_user_meta_data ->> 'full_name'), ''),
  NULLIF(BTRIM(auth_user.raw_user_meta_data ->> 'name'), ''),
  auth_user.email
)
FROM auth.users AS auth_user
WHERE event_row.user_id = auth_user.id AND event_row.user_name IS NULL;

UPDATE public.sensitive_read_log AS read_row
SET user_name = COALESCE(
  NULLIF(BTRIM(auth_user.raw_user_meta_data ->> 'full_name'), ''),
  NULLIF(BTRIM(auth_user.raw_user_meta_data ->> 'name'), ''),
  auth_user.email
)
FROM auth.users AS auth_user
WHERE read_row.user_id = auth_user.id AND read_row.user_name IS NULL;

CREATE OR REPLACE FUNCTION public.set_platform_log_user_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.user_id = auth.uid() THEN
    NEW.user_name := COALESCE(
      NULLIF(BTRIM(auth.jwt() -> 'user_metadata' ->> 'full_name'), ''),
      NULLIF(BTRIM(auth.jwt() -> 'user_metadata' ->> 'name'), ''),
      NULLIF(auth.jwt() ->> 'email', ''),
      NEW.user_name
    );
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_platform_log_user_name() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS security_event_set_user_name ON public.security_event;
CREATE TRIGGER security_event_set_user_name
  BEFORE INSERT ON public.security_event
  FOR EACH ROW EXECUTE FUNCTION public.set_platform_log_user_name();
DROP TRIGGER IF EXISTS sensitive_read_log_set_user_name ON public.sensitive_read_log;
CREATE TRIGGER sensitive_read_log_set_user_name
  BEFORE INSERT ON public.sensitive_read_log
  FOR EACH ROW EXECUTE FUNCTION public.set_platform_log_user_name();

CREATE OR REPLACE FUNCTION public.stamp_system_config_modifier()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.last_modified_by := auth.uid();
  END IF;
  NEW.last_modified_at := clock_timestamp();
  NEW.updatedat := clock_timestamp();
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.stamp_system_config_modifier() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS system_config_stamp_modifier ON public.system_config;
CREATE TRIGGER system_config_stamp_modifier
  BEFORE INSERT OR UPDATE ON public.system_config
  FOR EACH ROW EXECUTE FUNCTION public.stamp_system_config_modifier();

CREATE OR REPLACE FUNCTION public.admin_list_user_access(
  search_text TEXT DEFAULT NULL,
  role_filter TEXT DEFAULT NULL,
  status_filter TEXT DEFAULT NULL,
  page_size INTEGER DEFAULT 25,
  page_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  assignment_id UUID,
  user_id UUID,
  email TEXT,
  full_name TEXT,
  role_code TEXT,
  isactive BOOLEAN,
  issuspended BOOLEAN,
  accountexpiry TIMESTAMPTZ,
  lockeduntil TIMESTAMPTZ,
  lastloginat TIMESTAMPTZ,
  createdat TIMESTAMPTZ,
  email_confirmed_at TIMESTAMPTZ,
  account_status TEXT,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
BEGIN
  IF NOT public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[]) THEN
    RAISE EXCEPTION 'Only an active Super/System Administrator can list account access.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH account_rows AS (
    SELECT assignment.id AS assignment_id,
      auth_user.id AS user_id,
      auth_user.email::TEXT AS email,
      COALESCE(
        NULLIF(BTRIM(auth_user.raw_user_meta_data ->> 'full_name'), ''),
        NULLIF(BTRIM(auth_user.raw_user_meta_data ->> 'name'), ''),
        auth_user.email
      )::TEXT AS full_name,
      assignment.role_code,
      assignment.isactive,
      assignment.issuspended,
      assignment.accountexpiry,
      assignment.lockeduntil,
      assignment.lastloginat,
      auth_user.created_at AS createdat,
      auth_user.email_confirmed_at,
      CASE
        WHEN assignment.id IS NULL THEN 'Unassigned'
        WHEN assignment.lockeduntil > statement_timestamp() THEN 'Locked'
        WHEN assignment.accountexpiry IS NOT NULL AND assignment.accountexpiry <= statement_timestamp() THEN 'Expired'
        WHEN assignment.issuspended IS TRUE THEN 'Suspended'
        WHEN assignment.isactive IS NOT TRUE THEN 'Inactive'
        WHEN auth_user.email_confirmed_at IS NULL THEN 'Pending'
        ELSE 'Active'
      END::TEXT AS account_status
    FROM auth.users AS auth_user
    LEFT JOIN LATERAL (
      SELECT role_row.*
      FROM public.user_roles AS role_row
      WHERE role_row.user_id = auth_user.id
      ORDER BY (role_row.isactive IS TRUE AND role_row.issuspended IS FALSE) DESC,
        role_row.updatedat DESC NULLS LAST,
        role_row.createdat DESC NULLS LAST
      LIMIT 1
    ) AS assignment ON TRUE
  ), filtered_accounts AS (
    SELECT account_rows.* FROM account_rows
    WHERE (
      NULLIF(BTRIM(search_text), '') IS NULL
      OR account_rows.email ILIKE '%' || BTRIM(search_text) || '%'
      OR account_rows.full_name ILIKE '%' || BTRIM(search_text) || '%'
      OR account_rows.user_id::TEXT ILIKE '%' || BTRIM(search_text) || '%'
    )
    AND (NULLIF(role_filter, '') IS NULL OR account_rows.role_code = role_filter
      OR (role_filter = 'UNASSIGNED' AND account_rows.role_code IS NULL))
    AND (NULLIF(status_filter, '') IS NULL OR account_rows.account_status = status_filter)
  )
  SELECT filtered_accounts.assignment_id,
    filtered_accounts.user_id,
    filtered_accounts.email,
    filtered_accounts.full_name,
    filtered_accounts.role_code,
    filtered_accounts.isactive,
    filtered_accounts.issuspended,
    filtered_accounts.accountexpiry,
    filtered_accounts.lockeduntil,
    filtered_accounts.lastloginat,
    filtered_accounts.createdat,
    filtered_accounts.email_confirmed_at,
    filtered_accounts.account_status,
    COUNT(*) OVER ()
  FROM filtered_accounts
  ORDER BY filtered_accounts.createdat DESC NULLS LAST, filtered_accounts.email
  LIMIT LEAST(GREATEST(COALESCE(page_size, 25), 1), 100)
  OFFSET GREATEST(COALESCE(page_offset, 0), 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_scope_access(
  search_text TEXT DEFAULT NULL,
  type_filter TEXT DEFAULT NULL,
  active_filter BOOLEAN DEFAULT NULL,
  page_size INTEGER DEFAULT 25,
  page_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  email TEXT,
  full_name TEXT,
  scope_type TEXT,
  scope_id UUID,
  scope_name TEXT,
  purpose TEXT,
  isactive BOOLEAN,
  istemporary BOOLEAN,
  expiresat TIMESTAMPTZ,
  assignmentdate TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
BEGIN
  IF NOT public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[]) THEN
    RAISE EXCEPTION 'Only an active Super/System Administrator can list account scopes.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH scope_rows AS (
    SELECT assigned_scope.id,
      assigned_scope.user_id,
      auth_user.email::TEXT AS email,
      COALESCE(
        NULLIF(BTRIM(auth_user.raw_user_meta_data ->> 'full_name'), ''),
        NULLIF(BTRIM(auth_user.raw_user_meta_data ->> 'name'), ''),
        auth_user.email
      )::TEXT AS full_name,
      assigned_scope.scope_type,
      assigned_scope.scope_id,
      assigned_scope.scope_name,
      assigned_scope.purpose,
      assigned_scope.isactive,
      assigned_scope.istemporary,
      assigned_scope.expiresat,
      assigned_scope.assignmentdate
    FROM public.user_scopes AS assigned_scope
    LEFT JOIN auth.users AS auth_user ON auth_user.id = assigned_scope.user_id
  ), filtered_scopes AS (
    SELECT scope_rows.* FROM scope_rows
    WHERE (
      NULLIF(BTRIM(search_text), '') IS NULL
      OR scope_rows.email ILIKE '%' || BTRIM(search_text) || '%'
      OR scope_rows.full_name ILIKE '%' || BTRIM(search_text) || '%'
      OR scope_rows.scope_name ILIKE '%' || BTRIM(search_text) || '%'
      OR scope_rows.scope_type ILIKE '%' || BTRIM(search_text) || '%'
    )
    AND (NULLIF(type_filter, '') IS NULL OR scope_rows.scope_type = type_filter)
    AND (active_filter IS NULL OR scope_rows.isactive = active_filter)
  )
  SELECT filtered_scopes.id,
    filtered_scopes.user_id,
    filtered_scopes.email,
    filtered_scopes.full_name,
    filtered_scopes.scope_type,
    filtered_scopes.scope_id,
    filtered_scopes.scope_name,
    filtered_scopes.purpose,
    filtered_scopes.isactive,
    filtered_scopes.istemporary,
    filtered_scopes.expiresat,
    filtered_scopes.assignmentdate,
    COUNT(*) OVER ()
  FROM filtered_scopes
  ORDER BY filtered_scopes.isactive DESC, filtered_scopes.assignmentdate DESC NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(page_size, 25), 1), 100)
  OFFSET GREATEST(COALESCE(page_offset, 0), 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_session_access(
  search_text TEXT DEFAULT NULL,
  active_filter BOOLEAN DEFAULT NULL,
  page_size INTEGER DEFAULT 25,
  page_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  email TEXT,
  full_name TEXT,
  auth_session_id TEXT,
  device_info TEXT,
  ip_address TEXT,
  user_agent TEXT,
  isactive BOOLEAN,
  expiresat TIMESTAMPTZ,
  createdat TIMESTAMPTZ,
  lastactivityat TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
BEGIN
  IF NOT public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[]) THEN
    RAISE EXCEPTION 'Only an active Super/System Administrator can list sign-in sessions.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH session_rows AS (
    SELECT tracked_session.id,
      tracked_session.user_id,
      auth_user.email::TEXT AS email,
      COALESCE(
        NULLIF(BTRIM(auth_user.raw_user_meta_data ->> 'full_name'), ''),
        NULLIF(BTRIM(auth_user.raw_user_meta_data ->> 'name'), ''),
        auth_user.email
      )::TEXT AS full_name,
      tracked_session.auth_session_id,
      tracked_session.device_info,
      tracked_session.ip_address,
      tracked_session.user_agent,
      tracked_session.isactive,
      tracked_session.expiresat,
      tracked_session.createdat,
      tracked_session.lastactivityat
    FROM public.user_sessions AS tracked_session
    LEFT JOIN auth.users AS auth_user ON auth_user.id = tracked_session.user_id
  ), filtered_sessions AS (
    SELECT session_rows.* FROM session_rows
    WHERE (
      NULLIF(BTRIM(search_text), '') IS NULL
      OR session_rows.email ILIKE '%' || BTRIM(search_text) || '%'
      OR session_rows.full_name ILIKE '%' || BTRIM(search_text) || '%'
      OR session_rows.device_info ILIKE '%' || BTRIM(search_text) || '%'
      OR session_rows.ip_address ILIKE '%' || BTRIM(search_text) || '%'
    )
    AND (active_filter IS NULL OR (session_rows.isactive IS TRUE AND session_rows.expiresat > statement_timestamp()) = active_filter)
  )
  SELECT filtered_sessions.id,
    filtered_sessions.user_id,
    filtered_sessions.email,
    filtered_sessions.full_name,
    filtered_sessions.auth_session_id,
    filtered_sessions.device_info,
    filtered_sessions.ip_address,
    filtered_sessions.user_agent,
    filtered_sessions.isactive,
    filtered_sessions.expiresat,
    filtered_sessions.createdat,
    filtered_sessions.lastactivityat,
    COUNT(*) OVER ()
  FROM filtered_sessions
  ORDER BY filtered_sessions.createdat DESC NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(page_size, 25), 1), 100)
  OFFSET GREATEST(COALESCE(page_offset, 0), 0);
END;
$function$;

-- Prevent the sole platform administrator from accidentally locking out their
-- own account through a direct API update.
CREATE OR REPLACE FUNCTION public.prevent_platform_admin_self_lockout()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL
    AND OLD.user_id = auth.uid()
    AND OLD.role_code = 'SUPER_SYSTEM_ADMIN'
    AND (
      NEW.role_code IS DISTINCT FROM OLD.role_code
      OR NEW.isactive IS NOT TRUE
      OR NEW.issuspended IS TRUE
      OR (NEW.accountexpiry IS NOT NULL AND NEW.accountexpiry <= statement_timestamp())
      OR (NEW.lockeduntil IS NOT NULL AND NEW.lockeduntil > statement_timestamp())
    ) THEN
    RAISE EXCEPTION 'You cannot deactivate, suspend, expire, or lock your own Super/System Administrator account.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.prevent_platform_admin_self_lockout() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS user_roles_prevent_platform_admin_self_lockout ON public.user_roles;
CREATE TRIGGER user_roles_prevent_platform_admin_self_lockout
  BEFORE UPDATE OF role_code, isactive, issuspended, accountexpiry, lockeduntil
  ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.prevent_platform_admin_self_lockout();

REVOKE ALL ON FUNCTION public.admin_list_user_access(TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_scope_access(TEXT, TEXT, BOOLEAN, INTEGER, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_session_access(TEXT, BOOLEAN, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_user_access(TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_scope_access(TEXT, TEXT, BOOLEAN, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_session_access(TEXT, BOOLEAN, INTEGER, INTEGER) TO authenticated;

COMMIT;
