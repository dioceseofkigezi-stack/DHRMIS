-- Enforce account-level MFA requirements at the database policy boundary.
BEGIN;

CREATE OR REPLACE FUNCTION public.current_user_mfa_satisfied()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND (
      NOT EXISTS (
        SELECT 1
        FROM public.user_roles AS role_assignment
        WHERE role_assignment.user_id = auth.uid()
          AND role_assignment."isActive" IS TRUE
          AND role_assignment."isSuspended" IS FALSE
          AND role_assignment."isMfaEnabled" IS TRUE
          AND (
            role_assignment."accountExpiry" IS NULL
            OR role_assignment."accountExpiry" > statement_timestamp()
          )
          AND (
            role_assignment."lockedUntil" IS NULL
            OR role_assignment."lockedUntil" <= statement_timestamp()
          )
      )
      OR COALESCE(auth.jwt() ->> 'aal' = 'aal2', FALSE)
    );
$function$;

CREATE OR REPLACE FUNCTION public.current_user_employee_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT role_assignment.employee_id
  FROM public.user_roles AS role_assignment
  WHERE auth.uid() IS NOT NULL
    AND public.current_user_mfa_satisfied()
    AND role_assignment.user_id = auth.uid()
    AND role_assignment."isActive" IS TRUE
    AND role_assignment."isSuspended" IS FALSE
    AND (
      role_assignment."accountExpiry" IS NULL
      OR role_assignment."accountExpiry" > statement_timestamp()
    )
    AND (
      role_assignment."lockedUntil" IS NULL
      OR role_assignment."lockedUntil" <= statement_timestamp()
    )
    AND role_assignment.employee_id IS NOT NULL
  ORDER BY (role_assignment.role_code = 'Employee') DESC
  LIMIT 1;
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
    AND public.current_user_mfa_satisfied()
    AND EXISTS (
      SELECT 1
      FROM public.user_roles AS role_assignment
      WHERE role_assignment.user_id = auth.uid()
        AND role_assignment.role_code = ANY (allowed_roles)
        AND role_assignment."isActive" IS TRUE
        AND role_assignment."isSuspended" IS FALSE
        AND (
          role_assignment."accountExpiry" IS NULL
          OR role_assignment."accountExpiry" > statement_timestamp()
        )
        AND (
          role_assignment."lockedUntil" IS NULL
          OR role_assignment."lockedUntil" <= statement_timestamp()
        )
    );
$function$;

CREATE OR REPLACE FUNCTION public.user_has_active_scope(
  requested_scope_type TEXT,
  requested_scope_id UUID
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND public.current_user_mfa_satisfied()
    AND requested_scope_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_scopes AS assigned_scope
      WHERE assigned_scope.user_id = auth.uid()
        AND assigned_scope.scope_type = requested_scope_type
        AND assigned_scope.scope_id = requested_scope_id
        AND assigned_scope."isActive" IS TRUE
        AND (
          assigned_scope."expiresAt" IS NULL
          OR assigned_scope."expiresAt" > statement_timestamp()
        )
    );
$function$;

REVOKE ALL ON FUNCTION public.current_user_mfa_satisfied() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_mfa_satisfied() TO authenticated;
REVOKE ALL ON FUNCTION public.current_user_employee_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_employee_id() TO authenticated;
REVOKE ALL ON FUNCTION public.has_active_role(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_role(TEXT[]) TO authenticated;
REVOKE ALL ON FUNCTION public.user_has_active_scope(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_active_scope(TEXT, UUID) TO authenticated;

COMMIT;
