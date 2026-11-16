-- Remove AAL2 as an application access requirement while keeping access
-- checks tied to an authenticated Supabase user.
BEGIN;

UPDATE public.user_roles
SET ismfaenabled = FALSE,
    updatedat = clock_timestamp()
WHERE ismfaenabled IS DISTINCT FROM FALSE;

CREATE OR REPLACE FUNCTION public.current_user_mfa_satisfied()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT auth.uid() IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.current_user_mfa_satisfied() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_mfa_satisfied() TO authenticated;

COMMIT;
