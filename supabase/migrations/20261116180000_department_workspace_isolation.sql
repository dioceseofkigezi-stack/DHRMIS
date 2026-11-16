-- Keep department scopes inside their assigned department. Board-wide access
-- requires an explicit Board or PersonnelDomain scope.
BEGIN;

-- These identifiers were created without quotes in the schema, so PostgreSQL
-- stores them in lowercase. Keep the access helpers aligned with that schema.
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
  WHERE role_assignment.user_id = auth.uid()
    AND role_assignment.isactive IS TRUE
    AND role_assignment.issuspended IS FALSE
    AND (role_assignment.accountexpiry IS NULL OR role_assignment.accountexpiry > statement_timestamp())
    AND (role_assignment.lockeduntil IS NULL OR role_assignment.lockeduntil <= statement_timestamp())
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
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.user_roles AS role_assignment
    WHERE role_assignment.user_id = auth.uid()
      AND role_assignment.role_code = ANY (allowed_roles)
      AND role_assignment.isactive IS TRUE
      AND role_assignment.issuspended IS FALSE
      AND (role_assignment.accountexpiry IS NULL OR role_assignment.accountexpiry > statement_timestamp())
      AND (role_assignment.lockeduntil IS NULL OR role_assignment.lockeduntil <= statement_timestamp())
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
    AND requested_scope_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_scopes AS assigned_scope
      WHERE assigned_scope.user_id = auth.uid()
        AND assigned_scope.scope_type = requested_scope_type
        AND assigned_scope.scope_id = requested_scope_id
        AND assigned_scope.isactive IS TRUE
        AND (assigned_scope.expiresat IS NULL OR assigned_scope.expiresat > statement_timestamp())
    );
$function$;

CREATE OR REPLACE FUNCTION public.user_has_personnel_domain_scope(target_domain_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.personnel_domains AS domain
      WHERE domain.id = target_domain_id
        AND domain.is_active IS TRUE
        AND (
          public.user_has_active_scope('PersonnelDomain', domain.id)
          OR (domain.board_id IS NOT NULL AND (
            public.user_has_active_scope('Board', domain.board_id)
            OR EXISTS (
              SELECT 1 FROM public.departments AS department
              WHERE department.board_id = domain.board_id
                AND public.user_has_active_scope('Department', department.id)
            )
            OR EXISTS (
              SELECT 1 FROM public.institutions AS institution
              WHERE institution.board_id = domain.board_id
                AND (
                  public.user_has_active_scope('Institution', institution.id)
                  OR public.user_has_active_scope('Department', institution.department_id)
                )
            )
          ))
          OR (domain.is_secretariat IS TRUE AND (
            EXISTS (
              SELECT 1 FROM public.user_scopes AS scope
              WHERE scope.user_id = auth.uid()
                AND scope.scope_type IN ('Archdeaconry', 'Parish')
                AND scope.isactive IS TRUE
                AND (scope.expiresat IS NULL OR scope.expiresat > statement_timestamp())
            )
          ))
        )
    );
$function$;

REVOKE ALL ON FUNCTION public.user_has_personnel_domain_scope(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_personnel_domain_scope(UUID) TO authenticated;

DROP POLICY IF EXISTS personnel_domains_read_authorized ON public.personnel_domains;
CREATE POLICY personnel_domains_read_authorized ON public.personnel_domains
  FOR SELECT TO authenticated
  USING (
    public.has_active_role(ARRAY['SuperAdministrator']::TEXT[])
    OR (
      public.user_has_personnel_domain_scope(id)
      AND (
        (is_secretariat IS TRUE AND public.has_active_role(ARRAY[
          'CentralHR', 'ArchdeaconryAdmin', 'ParishAdmin'
        ]::TEXT[]))
        OR (board_id IS NOT NULL AND (
          public.has_active_role(ARRAY['CentralHR', 'BoardHR', 'InstitutionAdmin']::TEXT[])
          OR (code = 'ICT' AND public.has_active_role(ARRAY['ICTAdministrator']::TEXT[]))
          OR (code = 'LAND_FINANCE' AND public.has_active_role(ARRAY['FinanceOfficer']::TEXT[]))
        ))
      )
    )
  );

CREATE OR REPLACE FUNCTION public.can_manage_personnel_domain(target_domain_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT public.has_active_role(ARRAY['SuperAdministrator']::TEXT[])
    OR EXISTS (
      SELECT 1
      FROM public.personnel_domains AS domain
      WHERE domain.id = target_domain_id
        AND domain.is_active IS TRUE
        AND (
          (domain.is_secretariat IS TRUE
            AND public.has_active_role(ARRAY['CentralHR']::TEXT[])
            AND public.user_has_active_scope('PersonnelDomain', domain.id))
          OR (domain.board_id IS NOT NULL
            AND public.has_active_role(ARRAY['BoardHR']::TEXT[])
            AND (
              public.user_has_active_scope('PersonnelDomain', domain.id)
              OR public.user_has_active_scope('Board', domain.board_id)
            ))
        )
    );
$function$;

CREATE OR REPLACE FUNCTION public.can_access_vacancy(target_vacancy_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.vacancies AS vacancy
    WHERE vacancy.id = target_vacancy_id
      AND (
        public.can_manage_personnel_domain(vacancy.personnel_domain_id)
        OR (public.has_active_role(ARRAY['BoardHR']::TEXT[])
          AND public.user_has_active_scope('Department', vacancy.department_id))
      )
  );
$function$;

DROP POLICY IF EXISTS vacancies_read_authorized ON public.vacancies;
DROP POLICY IF EXISTS vacancies_insert_authorized ON public.vacancies;
DROP POLICY IF EXISTS vacancies_update_authorized ON public.vacancies;
CREATE POLICY vacancies_read_authorized ON public.vacancies
  FOR SELECT TO authenticated USING (
    public.can_manage_personnel_domain(personnel_domain_id)
    OR (public.has_active_role(ARRAY['BoardHR']::TEXT[])
      AND public.user_has_active_scope('Department', department_id))
  );
CREATE POLICY vacancies_insert_authorized ON public.vacancies
  FOR INSERT TO authenticated WITH CHECK (
    public.can_manage_personnel_domain(personnel_domain_id)
    OR (public.has_active_role(ARRAY['BoardHR']::TEXT[])
      AND public.user_has_active_scope('Department', department_id))
  );
CREATE POLICY vacancies_update_authorized ON public.vacancies
  FOR UPDATE TO authenticated
  USING (
    public.can_manage_personnel_domain(personnel_domain_id)
    OR (public.has_active_role(ARRAY['BoardHR']::TEXT[])
      AND public.user_has_active_scope('Department', department_id))
  )
  WITH CHECK (
    public.can_manage_personnel_domain(personnel_domain_id)
    OR (public.has_active_role(ARRAY['BoardHR']::TEXT[])
      AND public.user_has_active_scope('Department', department_id))
  );

COMMIT;
