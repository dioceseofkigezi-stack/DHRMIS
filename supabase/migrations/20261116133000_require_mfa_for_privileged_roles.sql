-- Require AAL2 for privileged and sensitive-data roles even if a role row's
-- optional isMfaEnabled flag was incorrectly left false.
BEGIN;

UPDATE public.user_roles
SET "isMfaEnabled" = TRUE,
    "updatedAt" = clock_timestamp()
WHERE role_code IN (
  'SuperAdministrator', 'SystemAdministrator', 'CentralHR', 'BoardHR',
  'ArchdeaconryAdmin', 'ParishAdmin', 'InstitutionAdmin', 'FinanceOfficer',
  'RegistryOfficer', 'SafeguardingOfficer', 'ICTAdministrator', 'Auditor'
)
  AND "isMfaEnabled" IS DISTINCT FROM TRUE;

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
          AND (
            role_assignment."isMfaEnabled" IS TRUE
            OR role_assignment.role_code IN (
              'SuperAdministrator', 'SystemAdministrator', 'CentralHR', 'BoardHR',
              'ArchdeaconryAdmin', 'ParishAdmin', 'InstitutionAdmin', 'FinanceOfficer',
              'RegistryOfficer', 'SafeguardingOfficer', 'ICTAdministrator', 'Auditor'
            )
          )
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

REVOKE ALL ON FUNCTION public.current_user_mfa_satisfied() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_mfa_satisfied() TO authenticated;

COMMIT;
