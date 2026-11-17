-- Resolve the signed-in account to its one active workspace on the server.
-- Department data access remains protected by the existing row-level policies.
BEGIN;

CREATE OR REPLACE FUNCTION public.user_has_personnel_domain_scope(target_domain_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.personnel_domains AS domain
    JOIN public.roles AS role_definition
      ON role_definition.scope_type = 'PERSONNEL_DOMAIN'
      AND role_definition.scope_code = domain.code
      AND role_definition.is_active IS TRUE
    WHERE domain.id = target_domain_id
      AND domain.is_active IS TRUE
      AND public.has_active_role(ARRAY[role_definition.role_code]::TEXT[])
      AND public.user_has_active_scope('PersonnelDomain', domain.id)
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_personnel_domain(target_domain_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT NOT public.is_super_system_admin()
    AND public.user_has_personnel_domain_scope(target_domain_id);
$function$;

DROP POLICY IF EXISTS personnel_domains_read_authorized ON public.personnel_domains;
CREATE POLICY personnel_domains_read_authorized ON public.personnel_domains
  FOR SELECT TO authenticated
  USING (public.user_has_personnel_domain_scope(id));

DROP POLICY IF EXISTS personnel_domains_assigned_workspace_only ON public.personnel_domains;
CREATE POLICY personnel_domains_assigned_workspace_only ON public.personnel_domains
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (is_active IS TRUE AND public.user_has_personnel_domain_scope(id));

CREATE OR REPLACE FUNCTION public.get_current_workspace()
RETURNS TABLE (
  role_code TEXT,
  domain_id UUID,
  domain_code TEXT,
  domain_name TEXT,
  board_id UUID,
  is_secretariat BOOLEAN
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT assignment.role_code,
    domain.id,
    domain.code,
    domain.name,
    domain.board_id,
    domain.is_secretariat
  FROM public.user_roles AS assignment
  JOIN public.roles AS role_definition
    ON role_definition.role_code = assignment.role_code
    AND role_definition.is_active IS TRUE
  LEFT JOIN public.personnel_domains AS domain
    ON role_definition.scope_type = 'PERSONNEL_DOMAIN'
    AND domain.code = role_definition.scope_code
    AND domain.is_active IS TRUE
  WHERE assignment.user_id = auth.uid()
    AND assignment.isactive IS TRUE
    AND assignment.issuspended IS FALSE
    AND (assignment.accountexpiry IS NULL OR assignment.accountexpiry > statement_timestamp())
    AND (assignment.lockeduntil IS NULL OR assignment.lockeduntil <= statement_timestamp())
    AND public.current_user_session_is_active()
    AND (
      (assignment.role_code = 'SUPER_SYSTEM_ADMIN' AND role_definition.scope_type = 'SYSTEM')
      OR (
        assignment.role_code <> 'SUPER_SYSTEM_ADMIN'
        AND role_definition.scope_type = 'PERSONNEL_DOMAIN'
        AND domain.id IS NOT NULL
        AND public.can_manage_personnel_domain(domain.id)
      )
    )
$function$;

REVOKE ALL ON FUNCTION public.user_has_personnel_domain_scope(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_personnel_domain_scope(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.can_manage_personnel_domain(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_personnel_domain(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.get_current_workspace() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_workspace() TO authenticated;

COMMIT;
