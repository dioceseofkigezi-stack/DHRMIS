-- Email confirmation is disabled for this application's managed accounts.
-- Keep the account directory independent of Auth's email confirmation timestamp.
BEGIN;

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
      auth_user.last_sign_in_at AS lastloginat,
      auth_user.created_at AS createdat,
      auth_user.email_confirmed_at,
      CASE
        WHEN assignment.id IS NULL THEN 'Unassigned'
        WHEN assignment.lockeduntil > statement_timestamp() THEN 'Locked'
        WHEN assignment.accountexpiry IS NOT NULL AND assignment.accountexpiry <= statement_timestamp() THEN 'Expired'
        WHEN assignment.issuspended IS TRUE THEN 'Suspended'
        WHEN assignment.isactive IS NOT TRUE THEN 'Inactive'
        WHEN auth_user.raw_app_meta_data ->> 'must_change_password' = 'true' THEN 'First login required'
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

COMMIT;
