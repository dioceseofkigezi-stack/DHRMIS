-- Consolidate both platform administrator assignments into the single
-- SUPER_SYSTEM_ADMIN role while retaining one active designated account.
BEGIN;

INSERT INTO public.roles (role_code, role_name, scope_type, scope_code, is_system_role, is_active)
VALUES ('SUPER_SYSTEM_ADMIN', 'Super/System Administrator', 'SYSTEM', NULL, TRUE, TRUE)
ON CONFLICT (role_code) DO UPDATE SET
  role_name = EXCLUDED.role_name,
  scope_type = EXCLUDED.scope_type,
  scope_code = EXCLUDED.scope_code,
  is_system_role = TRUE,
  is_active = TRUE;

ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS retired_role_code TEXT;
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_code_check;

-- The existing Super Administrator account takes precedence if both old roles
-- are active. Other administrator accounts remain in user_roles as suspended
-- history, with their former role recorded.
WITH ranked_administrators AS (
  SELECT id, ROW_NUMBER() OVER (
    ORDER BY CASE role_code
      WHEN 'SUPER_SYSTEM_ADMIN' THEN 0
      WHEN 'SUPER_ADMIN' THEN 1
      WHEN 'SYSTEM_ADMIN' THEN 2
      ELSE 3
    END,
    createdat NULLS LAST, user_id, id
  ) AS rank
  FROM public.user_roles
  WHERE role_code IN ('SUPER_SYSTEM_ADMIN', 'SUPER_ADMIN', 'SYSTEM_ADMIN')
    AND isactive IS TRUE AND issuspended IS FALSE
)
UPDATE public.user_roles AS assignment
SET isactive = FALSE,
    issuspended = TRUE,
    updatedat = clock_timestamp()
FROM ranked_administrators AS ranked
WHERE assignment.id = ranked.id AND ranked.rank > 1;

UPDATE public.user_roles
SET retired_role_code = CASE
      WHEN role_code IN ('SUPER_ADMIN', 'SYSTEM_ADMIN')
        THEN COALESCE(retired_role_code, role_code)
      ELSE retired_role_code
    END,
    role_code = 'SUPER_SYSTEM_ADMIN',
    updatedat = clock_timestamp()
WHERE role_code IN ('SUPER_ADMIN', 'SYSTEM_ADMIN');

INSERT INTO public.role_permissions (role_code, permission_code)
SELECT 'SUPER_SYSTEM_ADMIN', permission_code
FROM public.role_permissions
WHERE role_code IN ('SUPER_ADMIN', 'SYSTEM_ADMIN')
ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions (role_code, permission_code)
SELECT 'SUPER_SYSTEM_ADMIN', permission_code FROM public.permissions
ON CONFLICT DO NOTHING;
DELETE FROM public.role_permissions WHERE role_code IN ('SUPER_ADMIN', 'SYSTEM_ADMIN');
UPDATE public.roles SET is_active = FALSE
WHERE role_code IN ('SUPER_ADMIN', 'SYSTEM_ADMIN');

ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_code_check CHECK (role_code IN (
  'SUPER_SYSTEM_ADMIN', 'SECRETARIAT_USER', 'MISSION_BOARD_USER',
  'EDUCATION_BOARD_USER', 'HEALTH_BOARD_USER', 'LAND_FINANCE_BOARD_USER',
  'PLANNING_DEVELOPMENT_BOARD_USER', 'ICT_BOARD_USER'
));

-- Update stored row policies to use the canonical role code. The helper below
-- still recognizes legacy role names used by earlier migration policies.
DO $policies$
DECLARE
  policy_row RECORD;
  using_clause TEXT;
  check_clause TEXT;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (COALESCE(qual, '') ~ '''(SUPER_ADMIN|SYSTEM_ADMIN)'''
        OR COALESCE(with_check, '') ~ '''(SUPER_ADMIN|SYSTEM_ADMIN)''')
  LOOP
    using_clause := CASE WHEN policy_row.qual IS NULL THEN '' ELSE format(
      ' USING (%s)',
      replace(replace(policy_row.qual, '''SUPER_ADMIN''', '''SUPER_SYSTEM_ADMIN'''),
        '''SYSTEM_ADMIN''', '''SUPER_SYSTEM_ADMIN''')
    ) END;
    check_clause := CASE WHEN policy_row.with_check IS NULL THEN '' ELSE format(
      ' WITH CHECK (%s)',
      replace(replace(policy_row.with_check, '''SUPER_ADMIN''', '''SUPER_SYSTEM_ADMIN'''),
        '''SYSTEM_ADMIN''', '''SUPER_SYSTEM_ADMIN''')
    ) END;
    EXECUTE format('ALTER POLICY %I ON %I.%I%s%s',
      policy_row.policyname, policy_row.schemaname, policy_row.tablename,
      using_clause, check_clause);
  END LOOP;
END;
$policies$;

CREATE OR REPLACE FUNCTION public.has_active_role(allowed_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND public.current_user_session_is_active()
    AND EXISTS (
      SELECT 1 FROM public.user_roles AS assignment
      WHERE assignment.user_id = auth.uid()
        AND assignment.isactive IS TRUE
        AND assignment.issuspended IS FALSE
        AND (assignment.accountexpiry IS NULL OR assignment.accountexpiry > statement_timestamp())
        AND (assignment.lockeduntil IS NULL OR assignment.lockeduntil <= statement_timestamp())
        AND (
          assignment.role_code = ANY (allowed_roles)
          OR (assignment.role_code = 'SUPER_SYSTEM_ADMIN'
            AND allowed_roles && ARRAY[
              'SUPER_ADMIN', 'SYSTEM_ADMIN', 'SuperAdministrator', 'SystemAdministrator'
            ]::TEXT[])
          OR (assignment.role_code = 'SECRETARIAT_USER'
            AND allowed_roles && ARRAY['CentralHR', 'ArchdeaconryAdmin', 'ParishAdmin']::TEXT[])
          OR (assignment.role_code IN ('MISSION_BOARD_USER', 'EDUCATION_BOARD_USER',
              'HEALTH_BOARD_USER', 'PLANNING_DEVELOPMENT_BOARD_USER', 'ICT_BOARD_USER')
            AND allowed_roles && ARRAY['BoardHR', 'InstitutionAdmin']::TEXT[])
          OR (assignment.role_code = 'LAND_FINANCE_BOARD_USER'
            AND allowed_roles && ARRAY['BoardHR', 'InstitutionAdmin', 'FinanceOfficer']::TEXT[])
        )
    );
$function$;

DROP POLICY IF EXISTS audit_log_read_system_technical ON public.audit_log;
DROP POLICY IF EXISTS audit_log_read_super_admin ON public.audit_log;
DROP POLICY IF EXISTS audit_log_read_platform_admin ON public.audit_log;
CREATE POLICY audit_log_read_platform_admin ON public.audit_log FOR SELECT TO authenticated
  USING (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[]));

REVOKE ALL ON FUNCTION public.has_active_role(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_role(TEXT[]) TO authenticated;

COMMIT;
