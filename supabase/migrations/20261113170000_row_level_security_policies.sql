-- DHRMIS Migration 20: Role- and organization-scoped row-level security
--
-- Roles and scopes are provisioned by a trusted administrator. There is no
-- first-user or self-service administrator bootstrap.

BEGIN;

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;

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
  SELECT auth.uid() IS NOT NULL AND EXISTS (
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

CREATE OR REPLACE FUNCTION public.user_has_employee_scope(target_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND target_employee_id IS NOT NULL
    AND (
      public.current_user_employee_id() = target_employee_id
      OR
      EXISTS (
        SELECT 1
        FROM public.assignments AS assignment
        WHERE assignment.employee_id = target_employee_id
          AND assignment.status = 'Active'
          AND (assignment.end_date IS NULL OR assignment.end_date >= CURRENT_DATE)
          AND (
            public.user_has_active_scope('Archdeaconry', assignment.archdeaconry_id)
            OR public.user_has_active_scope('Parish', assignment.parish_id)
            OR public.user_has_active_scope('Institution', assignment.institution_id)
            OR public.user_has_active_scope('Department', assignment.department_id)
          )
      )
      OR EXISTS (
        SELECT 1
        FROM public.employee_roles AS employee_role
        WHERE employee_role.employee_id = target_employee_id
          AND employee_role.status = 'Active'
          AND (employee_role.end_date IS NULL OR employee_role.end_date >= CURRENT_DATE)
          AND (
            public.user_has_active_scope('Archdeaconry', employee_role.archdeaconry_id)
            OR public.user_has_active_scope('Parish', employee_role.parish_id)
            OR public.user_has_active_scope('Institution', employee_role.institution_id)
            OR public.user_has_active_scope('Department', employee_role.department_id)
          )
      )
      OR EXISTS (
        SELECT 1
        FROM public.assignments AS assignment
        JOIN public.archdeaconries AS archdeaconry
          ON archdeaconry.id = assignment.archdeaconry_id
        WHERE assignment.employee_id = target_employee_id
          AND assignment.status = 'Active'
          AND (assignment.end_date IS NULL OR assignment.end_date >= CURRENT_DATE)
          AND public.user_has_active_scope('Diocese', archdeaconry.diocese_id)
      )
      OR EXISTS (
        SELECT 1
        FROM public.assignments AS assignment
        JOIN public.parishes AS parish ON parish.id = assignment.parish_id
        JOIN public.archdeaconries AS archdeaconry ON archdeaconry.id = parish.archdeaconry_id
        WHERE assignment.employee_id = target_employee_id
          AND assignment.status = 'Active'
          AND (assignment.end_date IS NULL OR assignment.end_date >= CURRENT_DATE)
          AND public.user_has_active_scope('Diocese', archdeaconry.diocese_id)
      )
      OR EXISTS (
        SELECT 1
        FROM public.employee_roles AS employee_role
        JOIN public.archdeaconries AS archdeaconry
          ON archdeaconry.id = employee_role.archdeaconry_id
        WHERE employee_role.employee_id = target_employee_id
          AND employee_role.status = 'Active'
          AND (employee_role.end_date IS NULL OR employee_role.end_date >= CURRENT_DATE)
          AND public.user_has_active_scope('Diocese', archdeaconry.diocese_id)
      )
      OR EXISTS (
        SELECT 1
        FROM public.employee_roles AS employee_role
        JOIN public.parishes AS parish ON parish.id = employee_role.parish_id
        JOIN public.archdeaconries AS archdeaconry ON archdeaconry.id = parish.archdeaconry_id
        WHERE employee_role.employee_id = target_employee_id
          AND employee_role.status = 'Active'
          AND (employee_role.end_date IS NULL OR employee_role.end_date >= CURRENT_DATE)
          AND public.user_has_active_scope('Diocese', archdeaconry.diocese_id)
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_finance_employee(target_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT public.has_active_role(
      ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR']::TEXT[]
    )
    OR (
      public.has_active_role(ARRAY['FinanceOfficer']::TEXT[])
      AND target_employee_id IS DISTINCT FROM public.current_user_employee_id()
      AND public.user_has_employee_scope(target_employee_id)
    );
$function$;

CREATE OR REPLACE FUNCTION public.can_access_employee(target_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT public.has_active_role(
      ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR']::TEXT[]
    )
    OR public.current_user_employee_id() = target_employee_id
    OR (
      public.user_has_employee_scope(target_employee_id)
      AND (
        (
          public.has_active_role(ARRAY['ArchdeaconryAdmin']::TEXT[])
          AND (
            EXISTS (
              SELECT 1 FROM public.assignments AS assignment
              WHERE assignment.employee_id = target_employee_id
                AND assignment.status = 'Active'
                AND (assignment.end_date IS NULL OR assignment.end_date >= CURRENT_DATE)
                AND public.user_has_active_scope('Archdeaconry', assignment.archdeaconry_id)
            )
            OR EXISTS (
              SELECT 1 FROM public.employee_roles AS employee_role
              WHERE employee_role.employee_id = target_employee_id
                AND employee_role.status = 'Active'
                AND (employee_role.end_date IS NULL OR employee_role.end_date >= CURRENT_DATE)
                AND public.user_has_active_scope('Archdeaconry', employee_role.archdeaconry_id)
            )
          )
        )
        OR (
          public.has_active_role(ARRAY['ParishAdmin']::TEXT[])
          AND (
            EXISTS (
              SELECT 1 FROM public.assignments AS assignment
              WHERE assignment.employee_id = target_employee_id
                AND assignment.status = 'Active'
                AND (assignment.end_date IS NULL OR assignment.end_date >= CURRENT_DATE)
                AND public.user_has_active_scope('Parish', assignment.parish_id)
            )
            OR EXISTS (
              SELECT 1 FROM public.employee_roles AS employee_role
              WHERE employee_role.employee_id = target_employee_id
                AND employee_role.status = 'Active'
                AND (employee_role.end_date IS NULL OR employee_role.end_date >= CURRENT_DATE)
                AND public.user_has_active_scope('Parish', employee_role.parish_id)
            )
          )
        )
        OR (
          public.has_active_role(ARRAY['InstitutionAdmin']::TEXT[])
          AND (
            EXISTS (
              SELECT 1 FROM public.assignments AS assignment
              WHERE assignment.employee_id = target_employee_id
                AND assignment.status = 'Active'
                AND (assignment.end_date IS NULL OR assignment.end_date >= CURRENT_DATE)
                AND (
                  public.user_has_active_scope('Institution', assignment.institution_id)
                  OR public.user_has_active_scope('Department', assignment.department_id)
                )
            )
            OR EXISTS (
              SELECT 1 FROM public.employee_roles AS employee_role
              WHERE employee_role.employee_id = target_employee_id
                AND employee_role.status = 'Active'
                AND (employee_role.end_date IS NULL OR employee_role.end_date >= CURRENT_DATE)
                AND (
                  public.user_has_active_scope('Institution', employee_role.institution_id)
                  OR public.user_has_active_scope('Department', employee_role.department_id)
                )
              )
          )
        )
        OR (
          public.has_active_role(ARRAY['BoardHR']::TEXT[])
          AND (
            EXISTS (
              SELECT 1 FROM public.assignments AS assignment
              WHERE assignment.employee_id = target_employee_id
                AND assignment.status = 'Active'
                AND (assignment.end_date IS NULL OR assignment.end_date >= CURRENT_DATE)
                AND public.user_has_active_scope('Department', assignment.department_id)
            )
            OR EXISTS (
              SELECT 1 FROM public.employee_roles AS employee_role
              WHERE employee_role.employee_id = target_employee_id
                AND employee_role.status = 'Active'
                AND (employee_role.end_date IS NULL OR employee_role.end_date >= CURRENT_DATE)
                AND public.user_has_active_scope('Department', employee_role.department_id)
            )
          )
        )
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.can_access_confidential_personnel()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT public.has_active_role(
    ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR']::TEXT[]
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_employee(target_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT public.can_access_employee(target_employee_id)
    AND public.has_active_role(
      ARRAY[
        'SuperAdministrator', 'SystemAdministrator', 'CentralHR', 'BoardHR',
        'ArchdeaconryAdmin', 'ParishAdmin', 'InstitutionAdmin'
      ]::TEXT[]
    );
$function$;

CREATE OR REPLACE FUNCTION public.can_access_finance_employee(target_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT public.has_active_role(
      ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR']::TEXT[]
    )
    OR public.current_user_employee_id() = target_employee_id
    OR (
      public.has_active_role(ARRAY['FinanceOfficer']::TEXT[])
      AND public.user_has_employee_scope(target_employee_id)
    );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_organizational_scope(
  target_archdeaconry_id UUID,
  target_parish_id UUID,
  target_institution_id UUID,
  target_department_id UUID
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR']::TEXT[])
    OR (
      public.has_active_role(ARRAY['ArchdeaconryAdmin']::TEXT[])
      AND public.user_has_active_scope('Archdeaconry', target_archdeaconry_id)
    )
    OR (
      public.has_active_role(ARRAY['ParishAdmin']::TEXT[])
      AND public.user_has_active_scope('Parish', target_parish_id)
    )
    OR (
      public.has_active_role(ARRAY['InstitutionAdmin']::TEXT[])
      AND (
        public.user_has_active_scope('Institution', target_institution_id)
        OR public.user_has_active_scope('Department', target_department_id)
      )
    )
    OR (
      public.has_active_role(ARRAY['BoardHR']::TEXT[])
      AND public.user_has_active_scope('Department', target_department_id)
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
  SELECT public.has_active_role(
      ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR']::TEXT[]
    )
    OR (
      public.has_active_role(ARRAY['BoardHR']::TEXT[])
      AND EXISTS (
        SELECT 1
        FROM public.vacancies AS vacancy
        WHERE vacancy.id = target_vacancy_id
          AND public.user_has_active_scope('Department', vacancy.department_id)
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.can_access_document(target_document_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.documents AS document
    WHERE document.id = target_document_id
      AND (
        public.has_active_role(
          ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR', 'RegistryOfficer']::TEXT[]
        )
        OR (
          document.employee_id IS NOT NULL
          AND public.can_access_employee(document.employee_id)
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_employee_directory()
RETURNS TABLE (
  id UUID,
  employee_number TEXT,
  first_name TEXT,
  last_name TEXT,
  employee_category TEXT,
  employment_status TEXT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT employee.id,
         employee.employee_number,
         employee.first_name,
         employee.last_name,
         employee.employee_category,
         employee.employment_status
  FROM public.employees AS employee
  WHERE public.can_access_employee(employee.id)
     OR public.can_access_finance_employee(employee.id);
$function$;

REVOKE ALL ON FUNCTION public.has_active_role(TEXT[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_has_active_scope(TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_employee_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_has_employee_scope(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_employee(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_confidential_personnel() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_employee(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_finance_employee(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_finance_employee(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_organizational_scope(UUID, UUID, UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_vacancy(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_document(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_employee_directory() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_active_role(TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_active_scope(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_employee_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_employee_scope(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_employee(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_confidential_personnel() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_employee(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_finance_employee(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_finance_employee(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_organizational_scope(UUID, UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_vacancy(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_document(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_employee_directory() TO authenticated;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

DO $block$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'security_event', 'audit_log', 'sensitive_read_log',
    'user_roles', 'user_scopes', 'user_sessions',
    'dioceses', 'archdeaconries', 'parishes', 'local_churches',
    'boards', 'departments', 'institutions', 'grades', 'positions',
    'employees', 'personal_details', 'assignments', 'employee_roles',
    'acting_appointments', 'delegations', 'spouses', 'children', 'next_of_kin',
    'qualifications', 'training_records', 'professional_licences', 'leave_records',
    'performance_appraisals', 'appointments', 'payroll_records', 'benefits',
    'pension_schemes', 'pension_contributions', 'retirements',
    'early_retirement_applications', 'disciplinary_cases', 'safeguarding_cases',
    'employee_death_records', 'documents', 'stored_files', 'vacancies',
    'applicants', 'recruitment_applications', 'welfare_records',
    'property_assignments', 'succession_records', 'system_config'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO authenticated', table_name);
  END LOOP;
END;
$block$;

DO $block$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'personal_details', 'spouses', 'children', 'next_of_kin'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY confidential_personnel_read_self ON public.%I FOR SELECT TO authenticated USING (employee_id = public.current_user_employee_id())',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY confidential_personnel_insert_self ON public.%I FOR INSERT TO authenticated WITH CHECK (employee_id = public.current_user_employee_id())',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY confidential_personnel_update_self ON public.%I FOR UPDATE TO authenticated USING (employee_id = public.current_user_employee_id()) WITH CHECK (employee_id = public.current_user_employee_id())',
      table_name
    );
  END LOOP;
END;
$block$;

CREATE POLICY leave_records_read_self
  ON public.leave_records FOR SELECT TO authenticated
  USING (employee_id = public.current_user_employee_id());
CREATE POLICY leave_records_insert_self_request
  ON public.leave_records FOR INSERT TO authenticated
  WITH CHECK (
    employee_id = public.current_user_employee_id()
    AND status IN ('Requested', 'Pending')
    AND approved_by IS NULL
    AND approval_date IS NULL
    AND COALESCE(entitlement_days, 0) = 0
    AND COALESCE(taken_days, 0) = 0
    AND COALESCE(balance_days, 0) = 0
    AND COALESCE(documents, '[]'::JSONB) = '[]'::JSONB
  );

CREATE POLICY early_retirement_insert_self_request
  ON public.early_retirement_applications FOR INSERT TO authenticated
  WITH CHECK (
    employee_id = public.current_user_employee_id()
    AND status = 'Submitted'
    AND reviewer IS NULL
    AND final_decision_date IS NULL
  );
CREATE POLICY early_retirement_read_self_request
  ON public.early_retirement_applications FOR SELECT TO authenticated
  USING (employee_id = public.current_user_employee_id());

REVOKE SELECT ON TABLE public.employees FROM authenticated;
GRANT SELECT (
  id, employee_id, employee_number, title, first_name, middle_name,
  last_name, gender, telephone, email, employee_category, life_status,
  employment_status, archived_at, "createdAt", "updatedAt"
) ON TABLE public.employees TO authenticated;
REVOKE INSERT, UPDATE ON TABLE public.employees FROM authenticated;
GRANT INSERT (
  employee_id, employee_number, title, first_name, middle_name,
  last_name, gender, telephone, email, employee_category,
  life_status, employment_status, archived_at
) ON TABLE public.employees TO authenticated;
GRANT UPDATE (
  employee_id, employee_number, title, first_name, middle_name,
  last_name, gender, telephone, email, employee_category,
  life_status, employment_status, archived_at
) ON TABLE public.employees TO authenticated;

CREATE POLICY user_roles_read_own_or_admin
  ON public.user_roles FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator']::TEXT[])
  );
CREATE POLICY user_roles_manage_admin
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator']::TEXT[]))
  WITH CHECK (public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator']::TEXT[]));

CREATE POLICY user_scopes_read_own_or_admin
  ON public.user_scopes FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator']::TEXT[])
  );
CREATE POLICY user_scopes_manage_admin
  ON public.user_scopes FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator']::TEXT[]))
  WITH CHECK (public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator']::TEXT[]));

CREATE POLICY user_sessions_read_own_or_admin
  ON public.user_sessions FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator']::TEXT[])
  );
CREATE POLICY user_sessions_manage_admin
  ON public.user_sessions FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator']::TEXT[]))
  WITH CHECK (public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator']::TEXT[]));

CREATE POLICY organizational_directory_read
  ON public.dioceses FOR SELECT TO authenticated
  USING (public.has_active_role(ARRAY[
    'SuperAdministrator', 'SystemAdministrator', 'CentralHR', 'BoardHR',
    'ArchdeaconryAdmin', 'ParishAdmin', 'InstitutionAdmin', 'FinanceOfficer',
    'RegistryOfficer', 'SafeguardingOfficer', 'ICTAdministrator', 'Auditor',
    'Employee', 'ReadOnly'
  ]::TEXT[]);
CREATE POLICY organizational_directory_manage
  ON public.dioceses FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR']::TEXT[]))
  WITH CHECK (public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR']::TEXT[]));

DO $block$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'archdeaconries', 'parishes', 'local_churches', 'boards',
    'departments', 'institutions', 'grades', 'positions'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY organizational_directory_read ON public.%I FOR SELECT TO authenticated USING (public.has_active_role(ARRAY[''SuperAdministrator'', ''SystemAdministrator'', ''CentralHR'', ''BoardHR'', ''ArchdeaconryAdmin'', ''ParishAdmin'', ''InstitutionAdmin'', ''FinanceOfficer'', ''RegistryOfficer'', ''SafeguardingOfficer'', ''ICTAdministrator'', ''Auditor'', ''Employee'', ''ReadOnly'']::TEXT[]))',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY organizational_directory_manage ON public.%I FOR ALL TO authenticated USING (public.has_active_role(ARRAY[''SuperAdministrator'', ''SystemAdministrator'', ''CentralHR'']::TEXT[])) WITH CHECK (public.has_active_role(ARRAY[''SuperAdministrator'', ''SystemAdministrator'', ''CentralHR'']::TEXT[]))',
      table_name
    );
  END LOOP;
END;
$block$;

CREATE POLICY employees_read_scoped
  ON public.employees FOR SELECT TO authenticated
  USING (
    public.can_access_employee(id)
    OR public.can_access_finance_employee(id)
  );
CREATE POLICY employees_insert_central_hr
  ON public.employees FOR INSERT TO authenticated
  WITH CHECK (public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR']::TEXT[]));
CREATE POLICY employees_update_scoped
  ON public.employees FOR UPDATE TO authenticated
  USING (public.can_manage_employee(id))
  WITH CHECK (public.can_manage_employee(id));

DO $block$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'personal_details', 'acting_appointments',
    'qualifications', 'training_records',
    'professional_licences', 'leave_records', 'performance_appraisals',
    'appointments',
    'welfare_records', 'property_assignments', 'succession_records',
    'delegations'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY hr_records_read_scoped ON public.%I FOR SELECT TO authenticated USING (public.can_access_employee(employee_id))',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY hr_records_insert_scoped ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_manage_employee(employee_id))',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY hr_records_update_scoped ON public.%I FOR UPDATE TO authenticated USING (public.can_manage_employee(employee_id)) WITH CHECK (public.can_manage_employee(employee_id))',
      table_name
    );
  END LOOP;
END;
$block$;

CREATE POLICY delegations_read_scoped
  ON public.delegations FOR SELECT TO authenticated
  USING (
    public.can_access_employee(delegator_id)
    OR public.can_access_employee(delegate_id)
  );
CREATE POLICY delegations_insert_scoped
  ON public.delegations FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_employee(delegator_id)
    AND public.can_manage_employee(delegate_id)
  );
CREATE POLICY delegations_update_scoped
  ON public.delegations FOR UPDATE TO authenticated
  USING (
    public.can_manage_employee(delegator_id)
    AND public.can_manage_employee(delegate_id)
  )
  WITH CHECK (
    public.can_manage_employee(delegator_id)
    AND public.can_manage_employee(delegate_id)
  );

DO $block$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'personal_details', 'spouses', 'children', 'next_of_kin',
    'disciplinary_cases', 'employee_death_records'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY confidential_personnel_read_central_hr ON public.%I FOR SELECT TO authenticated USING (public.can_access_confidential_personnel())',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY confidential_personnel_insert_central_hr ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_access_confidential_personnel())',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY confidential_personnel_update_central_hr ON public.%I FOR UPDATE TO authenticated USING (public.can_access_confidential_personnel()) WITH CHECK (public.can_access_confidential_personnel())',
      table_name
    );
  END LOOP;
END;
$block$;

CREATE POLICY assignments_read_scoped
  ON public.assignments FOR SELECT TO authenticated
  USING (public.can_access_employee(employee_id));
CREATE POLICY assignments_insert_scoped
  ON public.assignments FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_organizational_scope(
    archdeaconry_id, parish_id, institution_id, department_id
  ));
CREATE POLICY assignments_update_scoped
  ON public.assignments FOR UPDATE TO authenticated
  USING (public.can_access_employee(employee_id))
  WITH CHECK (public.can_manage_organizational_scope(
    archdeaconry_id, parish_id, institution_id, department_id
  ));

CREATE POLICY employee_roles_read_scoped
  ON public.employee_roles FOR SELECT TO authenticated
  USING (public.can_access_employee(employee_id));
CREATE POLICY employee_roles_insert_scoped
  ON public.employee_roles FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_organizational_scope(
    archdeaconry_id, parish_id, institution_id, department_id
  ));
CREATE POLICY employee_roles_update_scoped
  ON public.employee_roles FOR UPDATE TO authenticated
  USING (public.can_access_employee(employee_id))
  WITH CHECK (public.can_manage_organizational_scope(
    archdeaconry_id, parish_id, institution_id, department_id
  ));

CREATE POLICY applicants_delete_central_hr
  ON public.applicants FOR DELETE TO authenticated
  USING (public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR']::TEXT[]));

CREATE POLICY recruitment_applications_delete_central_hr
  ON public.recruitment_applications FOR DELETE TO authenticated
  USING (public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR']::TEXT[]));

GRANT DELETE ON TABLE public.applicants, public.recruitment_applications TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.audit_log FROM authenticated;
REVOKE UPDATE, DELETE ON TABLE public.sensitive_read_log FROM authenticated;
REVOKE UPDATE, DELETE ON TABLE public.security_event FROM authenticated;
GRANT UPDATE (acknowledged, acknowledged_by, resolved, resolved_at)
  ON TABLE public.security_event TO authenticated;

DO $block$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'payroll_records', 'benefits', 'pension_schemes', 'pension_contributions',
    'retirements'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY finance_records_read_scoped ON public.%I FOR SELECT TO authenticated USING (public.can_access_finance_employee(employee_id))',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY finance_records_insert_scoped ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_manage_finance_employee(employee_id))',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY finance_records_update_scoped ON public.%I FOR UPDATE TO authenticated USING (public.can_manage_finance_employee(employee_id)) WITH CHECK (public.can_manage_finance_employee(employee_id))',
      table_name
    );
  END LOOP;
END;
$block$;

CREATE POLICY early_retirement_finance_read_scoped
  ON public.early_retirement_applications FOR SELECT TO authenticated
  USING (
    public.can_access_employee(employee_id)
    OR public.can_access_finance_employee(employee_id)
  );
CREATE POLICY early_retirement_finance_insert_scoped
  ON public.early_retirement_applications FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_employee(employee_id)
    OR public.can_manage_finance_employee(employee_id)
  );
CREATE POLICY early_retirement_finance_update_scoped
  ON public.early_retirement_applications FOR UPDATE TO authenticated
  USING (
    public.can_manage_employee(employee_id)
    OR public.can_manage_finance_employee(employee_id)
  )
  WITH CHECK (
    public.can_manage_employee(employee_id)
    OR public.can_manage_finance_employee(employee_id)
  );

CREATE POLICY safeguarding_cases_read_authorized
  ON public.safeguarding_cases FOR SELECT TO authenticated
  USING (public.has_active_role(ARRAY['SuperAdministrator', 'SafeguardingOfficer']::TEXT[]));
CREATE POLICY safeguarding_cases_insert_authorized
  ON public.safeguarding_cases FOR INSERT TO authenticated
  WITH CHECK (public.has_active_role(ARRAY['SuperAdministrator', 'SafeguardingOfficer']::TEXT[]));
CREATE POLICY safeguarding_cases_update_authorized
  ON public.safeguarding_cases FOR UPDATE TO authenticated
  USING (public.has_active_role(ARRAY['SuperAdministrator', 'SafeguardingOfficer']::TEXT[]))
  WITH CHECK (public.has_active_role(ARRAY['SuperAdministrator', 'SafeguardingOfficer']::TEXT[]));

CREATE POLICY audit_log_read_auditors
  ON public.audit_log FOR SELECT TO authenticated
  USING (public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'Auditor']::TEXT[]));
CREATE POLICY sensitive_read_log_read_auditors
  ON public.sensitive_read_log FOR SELECT TO authenticated
  USING (public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'Auditor']::TEXT[]));
CREATE POLICY sensitive_read_log_insert_own
  ON public.sensitive_read_log FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND public.has_active_role(ARRAY[
    'SuperAdministrator', 'SystemAdministrator', 'CentralHR', 'BoardHR',
    'ArchdeaconryAdmin', 'ParishAdmin', 'InstitutionAdmin', 'FinanceOfficer',
    'RegistryOfficer', 'SafeguardingOfficer', 'ICTAdministrator', 'Auditor',
    'Employee', 'ReadOnly'
  ]::TEXT[]));

CREATE POLICY security_event_read_authorized
  ON public.security_event FOR SELECT TO authenticated
  USING (public.has_active_role(ARRAY[
    'SuperAdministrator', 'SystemAdministrator', 'ICTAdministrator',
    'SafeguardingOfficer', 'Auditor'
  ]::TEXT[]));
CREATE POLICY security_event_insert_own
  ON public.security_event FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.has_active_role(ARRAY[
      'SuperAdministrator', 'SystemAdministrator', 'CentralHR', 'BoardHR',
      'ArchdeaconryAdmin', 'ParishAdmin', 'InstitutionAdmin', 'FinanceOfficer',
      'RegistryOfficer', 'SafeguardingOfficer', 'ICTAdministrator', 'Auditor',
      'Employee', 'ReadOnly'
    ]::TEXT[])
  );
CREATE POLICY security_event_update_admin
  ON public.security_event FOR UPDATE TO authenticated
  USING (public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'ICTAdministrator']::TEXT[]))
  WITH CHECK (public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'ICTAdministrator']::TEXT[]));

CREATE POLICY documents_read_scoped
  ON public.documents FOR SELECT TO authenticated
  USING (
    public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR', 'RegistryOfficer']::TEXT[])
    OR (employee_id IS NOT NULL AND public.can_access_employee(employee_id))
  );
CREATE POLICY documents_insert_authorized
  ON public.documents FOR INSERT TO authenticated
  WITH CHECK (
    public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR', 'RegistryOfficer']::TEXT[])
    OR (employee_id IS NOT NULL AND public.can_manage_employee(employee_id))
  );
CREATE POLICY documents_update_authorized
  ON public.documents FOR UPDATE TO authenticated
  USING (
    public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR', 'RegistryOfficer']::TEXT[])
    OR (employee_id IS NOT NULL AND public.can_manage_employee(employee_id))
  )
  WITH CHECK (
    public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR', 'RegistryOfficer']::TEXT[])
    OR (employee_id IS NOT NULL AND public.can_manage_employee(employee_id))
  );

CREATE POLICY stored_files_read_authorized
  ON public.stored_files FOR SELECT TO authenticated
  USING (
    public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR', 'RegistryOfficer']::TEXT[])
    OR public.can_access_document(document_id)
  );
CREATE POLICY stored_files_insert_authorized
  ON public.stored_files FOR INSERT TO authenticated
  WITH CHECK (
    public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR', 'RegistryOfficer']::TEXT[])
    OR public.can_access_document(document_id)
  );
CREATE POLICY stored_files_update_authorized
  ON public.stored_files FOR UPDATE TO authenticated
  USING (
    public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR', 'RegistryOfficer']::TEXT[])
    OR public.can_access_document(document_id)
  )
  WITH CHECK (
    public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR', 'RegistryOfficer']::TEXT[])
    OR public.can_access_document(document_id)
  );

CREATE POLICY vacancies_read_authorized
  ON public.vacancies FOR SELECT TO authenticated
  USING (public.has_active_role(ARRAY[
    'SuperAdministrator', 'SystemAdministrator', 'CentralHR', 'BoardHR',
    'ArchdeaconryAdmin', 'ParishAdmin', 'InstitutionAdmin', 'ReadOnly',
    'Auditor', 'ICTAdministrator'
  ]::TEXT[]));
CREATE POLICY vacancies_insert_authorized
  ON public.vacancies FOR INSERT TO authenticated
  WITH CHECK (
    public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR']::TEXT[])
    OR (
      public.has_active_role(ARRAY['BoardHR']::TEXT[])
      AND public.user_has_active_scope('Department', department_id)
    )
  );
CREATE POLICY vacancies_update_authorized
  ON public.vacancies FOR UPDATE TO authenticated
  USING (
    public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR']::TEXT[])
    OR (
      public.has_active_role(ARRAY['BoardHR']::TEXT[])
      AND public.user_has_active_scope('Department', department_id)
    )
  )
  WITH CHECK (
    public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR']::TEXT[])
    OR (
      public.has_active_role(ARRAY['BoardHR']::TEXT[])
      AND public.user_has_active_scope('Department', department_id)
    )
  );

CREATE POLICY applicants_read_authorized
  ON public.applicants FOR SELECT TO authenticated
  USING (
    public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR']::TEXT[])
    OR (vacancy_id IS NOT NULL AND public.can_access_vacancy(vacancy_id))
  );
CREATE POLICY applicants_insert_authorized
  ON public.applicants FOR INSERT TO authenticated
  WITH CHECK (
    public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR']::TEXT[])
    OR (vacancy_id IS NOT NULL AND public.can_access_vacancy(vacancy_id))
  );
CREATE POLICY applicants_update_authorized
  ON public.applicants FOR UPDATE TO authenticated
  USING (
    public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR']::TEXT[])
    OR (vacancy_id IS NOT NULL AND public.can_access_vacancy(vacancy_id))
  )
  WITH CHECK (
    public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR']::TEXT[])
    OR (vacancy_id IS NOT NULL AND public.can_access_vacancy(vacancy_id))
  );

CREATE POLICY recruitment_applications_read_authorized
  ON public.recruitment_applications FOR SELECT TO authenticated
  USING (
    public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR']::TEXT[])
    OR public.can_access_vacancy(vacancy_id)
  );
CREATE POLICY recruitment_applications_insert_authorized
  ON public.recruitment_applications FOR INSERT TO authenticated
  WITH CHECK (
    public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR']::TEXT[])
    OR public.can_access_vacancy(vacancy_id)
  );
CREATE POLICY recruitment_applications_update_authorized
  ON public.recruitment_applications FOR UPDATE TO authenticated
  USING (
    public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR']::TEXT[])
    OR public.can_access_vacancy(vacancy_id)
  )
  WITH CHECK (
    public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR']::TEXT[])
    OR public.can_access_vacancy(vacancy_id)
  );

CREATE POLICY system_config_read_authorized
  ON public.system_config FOR SELECT TO authenticated
  USING (
    (is_sensitive IS FALSE AND public.has_active_role(ARRAY[
      'SuperAdministrator', 'SystemAdministrator', 'CentralHR', 'BoardHR',
      'ArchdeaconryAdmin', 'ParishAdmin', 'InstitutionAdmin', 'FinanceOfficer',
      'RegistryOfficer', 'SafeguardingOfficer', 'ICTAdministrator', 'Auditor',
      'Employee', 'ReadOnly'
    ]::TEXT[]))
    OR public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator']::TEXT[])
  );
CREATE POLICY system_config_manage_admin
  ON public.system_config FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator']::TEXT[]))
  WITH CHECK (public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator']::TEXT[]));

CREATE OR REPLACE FUNCTION public.log_row_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
DECLARE
  old_data JSONB;
  new_data JSONB;
  changed_fields JSONB;
  row_id UUID;
  related_employee_id UUID;
  field_name TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    new_data := to_jsonb(NEW);
    row_id := NULLIF(new_data ->> 'id', '')::UUID;
    changed_fields := COALESCE(
      (SELECT jsonb_agg(keys.key ORDER BY keys.key)
       FROM jsonb_object_keys(new_data) AS keys(key)),
      '[]'::JSONB
    );
  ELSIF TG_OP = 'UPDATE' THEN
    old_data := to_jsonb(OLD);
    new_data := to_jsonb(NEW);
    IF old_data = new_data THEN
      RETURN NEW;
    END IF;
    row_id := NULLIF(new_data ->> 'id', '')::UUID;
    SELECT COALESCE(jsonb_agg(keys.key ORDER BY keys.key), '[]'::JSONB)
      INTO changed_fields
      FROM (
        SELECT keys.key
        FROM (
          SELECT jsonb_object_keys(old_data) AS key
          UNION
          SELECT jsonb_object_keys(new_data) AS key
        ) AS keys
        WHERE old_data -> keys.key IS DISTINCT FROM new_data -> keys.key
      ) AS keys;
  ELSE
    old_data := to_jsonb(OLD);
    row_id := NULLIF(old_data ->> 'id', '')::UUID;
    changed_fields := COALESCE(
      (SELECT jsonb_agg(keys.key ORDER BY keys.key)
       FROM jsonb_object_keys(old_data) AS keys(key)),
      '[]'::JSONB
    );
  END IF;

  related_employee_id := CASE
    WHEN COALESCE(new_data ->> 'employee_id', old_data ->> 'employee_id') ~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    THEN COALESCE(new_data ->> 'employee_id', old_data ->> 'employee_id')::UUID
    ELSE NULL
  END;

  INSERT INTO public.audit_log (
    user_id, action, module, record_id, record_type, employee_id,
    result, before_values, after_values, context
  ) VALUES (
    auth.uid(),
    CASE TG_OP
      WHEN 'INSERT' THEN 'CREATED'
      WHEN 'UPDATE' THEN 'UPDATE'
      ELSE 'DELETE_REQUEST'
    END,
    TG_TABLE_NAME,
    row_id,
    TG_TABLE_NAME,
    related_employee_id,
    'Success',
    CASE WHEN TG_OP = 'INSERT' THEN NULL
      ELSE jsonb_build_object('changed_fields', changed_fields) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL
      ELSE jsonb_build_object('changed_fields', changed_fields) END,
    'Database change trigger; field values intentionally omitted.'
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.log_row_change() FROM PUBLIC, anon, authenticated;

DO $block$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'security_event', 'user_roles', 'user_scopes', 'user_sessions',
    'dioceses', 'archdeaconries', 'parishes', 'local_churches',
    'boards', 'departments', 'institutions', 'grades', 'positions',
    'employees', 'personal_details', 'assignments', 'employee_roles',
    'acting_appointments', 'delegations', 'spouses', 'children', 'next_of_kin',
    'qualifications', 'training_records', 'professional_licences', 'leave_records',
    'performance_appraisals', 'appointments', 'payroll_records', 'benefits',
    'pension_schemes', 'pension_contributions', 'retirements',
    'early_retirement_applications', 'disciplinary_cases', 'safeguarding_cases',
    'employee_death_records', 'documents', 'stored_files', 'vacancies',
    'applicants', 'recruitment_applications', 'welfare_records',
    'property_assignments', 'succession_records', 'system_config'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_row_change()',
      table_name
    );
  END LOOP;
END;
$block$;

DO $block$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_log_employee_id_fkey') THEN
    ALTER TABLE public.audit_log
      ADD CONSTRAINT audit_log_employee_id_fkey
      FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_log_session_id_fkey') THEN
    ALTER TABLE public.audit_log
      ADD CONSTRAINT audit_log_session_id_fkey
      FOREIGN KEY (session_id) REFERENCES public.user_sessions(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sensitive_read_log_employee_id_fkey') THEN
    ALTER TABLE public.sensitive_read_log
      ADD CONSTRAINT sensitive_read_log_employee_id_fkey
      FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sensitive_read_log_session_id_fkey') THEN
    ALTER TABLE public.sensitive_read_log
      ADD CONSTRAINT sensitive_read_log_session_id_fkey
      FOREIGN KEY (session_id) REFERENCES public.user_sessions(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_photo_id_fkey') THEN
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_photo_id_fkey
      FOREIGN KEY (photo_id) REFERENCES public.documents(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignments_supporting_document_id_fkey') THEN
    ALTER TABLE public.assignments
      ADD CONSTRAINT assignments_supporting_document_id_fkey
      FOREIGN KEY (supporting_document_id) REFERENCES public.documents(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acting_appointments_supporting_document_id_fkey') THEN
    ALTER TABLE public.acting_appointments
      ADD CONSTRAINT acting_appointments_supporting_document_id_fkey
      FOREIGN KEY (supporting_document_id) REFERENCES public.documents(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'spouses_marriage_document_id_fkey') THEN
    ALTER TABLE public.spouses
      ADD CONSTRAINT spouses_marriage_document_id_fkey
      FOREIGN KEY (marriage_document_id) REFERENCES public.documents(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_appointment_letter_id_fkey') THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_appointment_letter_id_fkey
      FOREIGN KEY (appointment_letter_id) REFERENCES public.documents(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_supporting_document_id_fkey') THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_supporting_document_id_fkey
      FOREIGN KEY (supporting_document_id) REFERENCES public.documents(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_death_records_supporting_document_id_fkey') THEN
    ALTER TABLE public.employee_death_records
      ADD CONSTRAINT employee_death_records_supporting_document_id_fkey
      FOREIGN KEY (supporting_document_id) REFERENCES public.documents(id) ON DELETE SET NULL NOT VALID;
  END IF;
END;
$block$;

COMMIT;
