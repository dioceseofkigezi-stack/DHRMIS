-- Remove MFA database state and retain only authenticated, tracked-session
-- checks for role and scope authorization.
BEGIN;

CREATE OR REPLACE FUNCTION public.current_user_session_is_active()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_sessions AS tracked_session
    WHERE tracked_session.user_id = auth.uid()
      AND tracked_session.auth_session_id = auth.jwt() ->> 'session_id'
      AND tracked_session.isactive IS TRUE
      AND tracked_session.expiresat > statement_timestamp()
  );
$function$;

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
          OR (assignment.role_code IN ('MISSION_BOARD_USER', 'EDUCATION_BOARD_USER', 'HEALTH_BOARD_USER',
              'PLANNING_DEVELOPMENT_BOARD_USER', 'ICT_BOARD_USER')
            AND allowed_roles && ARRAY['BoardHR', 'InstitutionAdmin']::TEXT[])
          OR (assignment.role_code = 'LAND_FINANCE_BOARD_USER'
            AND allowed_roles && ARRAY['BoardHR', 'InstitutionAdmin', 'FinanceOfficer']::TEXT[])
        )
    );
$function$;

CREATE OR REPLACE FUNCTION public.user_has_active_scope(requested_scope_type TEXT, requested_scope_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND public.current_user_session_is_active()
    AND requested_scope_id IS NOT NULL
    AND (
      public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
      OR EXISTS (
        SELECT 1
        FROM public.user_scopes AS assigned_scope
        JOIN public.personnel_domains AS domain ON domain.id = assigned_scope.scope_id
        LEFT JOIN public.departments AS department
          ON requested_scope_type = 'Department' AND department.id = requested_scope_id
        LEFT JOIN public.institutions AS institution
          ON requested_scope_type = 'Institution' AND institution.id = requested_scope_id
        WHERE assigned_scope.user_id = auth.uid()
          AND assigned_scope.scope_type = 'PersonnelDomain'
          AND assigned_scope.isactive IS TRUE
          AND (assigned_scope.expiresat IS NULL OR assigned_scope.expiresat > statement_timestamp())
          AND domain.is_active IS TRUE
          AND (
            (requested_scope_type = 'PersonnelDomain' AND domain.id = requested_scope_id)
            OR (requested_scope_type = 'Board' AND domain.board_id = requested_scope_id)
            OR (requested_scope_type = 'Department' AND (
              (department.board_id IS NOT NULL AND department.board_id = domain.board_id)
              OR (department.board_id IS NULL AND domain.is_secretariat IS TRUE)
            ))
            OR (requested_scope_type = 'Institution' AND (
              (COALESCE(institution.board_id, (SELECT owner_department.board_id
                FROM public.departments AS owner_department WHERE owner_department.id = institution.department_id)) IS NOT NULL
                AND COALESCE(institution.board_id, (SELECT owner_department.board_id
                  FROM public.departments AS owner_department WHERE owner_department.id = institution.department_id)) = domain.board_id)
              OR (COALESCE(institution.board_id, (SELECT owner_department.board_id
                FROM public.departments AS owner_department WHERE owner_department.id = institution.department_id)) IS NULL
                AND (institution.archdeaconry_id IS NOT NULL OR institution.parish_id IS NOT NULL)
                AND domain.is_secretariat IS TRUE)
            ))
            OR (requested_scope_type IN ('Archdeaconry', 'Parish', 'LocalChurch') AND domain.is_secretariat IS TRUE)
          )
          AND public.has_active_role(ARRAY[
            CASE domain.code
              WHEN 'SECRETARIAT' THEN 'SECRETARIAT_USER'
              WHEN 'MISSION' THEN 'MISSION_BOARD_USER'
              WHEN 'EDUCATION' THEN 'EDUCATION_BOARD_USER'
              WHEN 'HEALTH' THEN 'HEALTH_BOARD_USER'
              WHEN 'LAND_FINANCE' THEN 'LAND_FINANCE_BOARD_USER'
              WHEN 'PLANNING_DEVELOPMENT' THEN 'PLANNING_DEVELOPMENT_BOARD_USER'
              WHEN 'ICT' THEN 'ICT_BOARD_USER'
            END
          ]::TEXT[])
      )
    );
$function$;

DROP POLICY IF EXISTS roles_read_active ON public.roles;
CREATE POLICY roles_read_active ON public.roles FOR SELECT TO authenticated
  USING (is_active IS TRUE AND auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS permissions_read_authenticated ON public.permissions;
CREATE POLICY permissions_read_authenticated ON public.permissions FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS role_permissions_read_authenticated ON public.role_permissions;
CREATE POLICY role_permissions_read_authenticated ON public.role_permissions FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS user_notifications_read_own ON public.user_notifications;
DROP POLICY IF EXISTS user_notifications_mark_read_own ON public.user_notifications;
CREATE POLICY user_notifications_read_own ON public.user_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.current_user_session_is_active()
    AND public.has_active_role(ARRAY[
      'SUPER_SYSTEM_ADMIN', 'SECRETARIAT_USER', 'MISSION_BOARD_USER',
      'EDUCATION_BOARD_USER', 'HEALTH_BOARD_USER', 'LAND_FINANCE_BOARD_USER',
      'PLANNING_DEVELOPMENT_BOARD_USER', 'ICT_BOARD_USER'
    ]::TEXT[]));
CREATE POLICY user_notifications_mark_read_own ON public.user_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.current_user_session_is_active()
    AND public.has_active_role(ARRAY[
      'SUPER_SYSTEM_ADMIN', 'SECRETARIAT_USER', 'MISSION_BOARD_USER',
      'EDUCATION_BOARD_USER', 'HEALTH_BOARD_USER', 'LAND_FINANCE_BOARD_USER',
      'PLANNING_DEVELOPMENT_BOARD_USER', 'ICT_BOARD_USER'
    ]::TEXT[]))
  WITH CHECK (user_id = auth.uid() AND public.current_user_session_is_active()
    AND public.has_active_role(ARRAY[
      'SUPER_SYSTEM_ADMIN', 'SECRETARIAT_USER', 'MISSION_BOARD_USER',
      'EDUCATION_BOARD_USER', 'HEALTH_BOARD_USER', 'LAND_FINANCE_BOARD_USER',
      'PLANNING_DEVELOPMENT_BOARD_USER', 'ICT_BOARD_USER'
    ]::TEXT[]));

REVOKE ALL ON FUNCTION public.current_user_session_is_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_session_is_active() TO authenticated;
REVOKE ALL ON FUNCTION public.has_active_role(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_role(TEXT[]) TO authenticated;
REVOKE ALL ON FUNCTION public.user_has_active_scope(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_active_scope(TEXT, UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.current_user_mfa_satisfied();
ALTER TABLE public.user_roles DROP COLUMN IF EXISTS ismfaenabled;
ALTER TABLE public.roles DROP COLUMN IF EXISTS requires_mfa;

COMMIT;
