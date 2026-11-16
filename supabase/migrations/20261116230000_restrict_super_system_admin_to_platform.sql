-- Keep SUPER_SYSTEM_ADMIN inside platform administration. Departmental users
-- retain their role and scope policies; this adds an explicit deny boundary
-- for the system role across every existing HR and organization table.
BEGIN;

CREATE OR REPLACE FUNCTION public.is_super_system_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles AS assignment
    WHERE assignment.user_id = auth.uid()
      AND assignment.role_code = 'SUPER_SYSTEM_ADMIN'
      AND assignment.isactive IS TRUE
      AND assignment.issuspended IS FALSE
      AND (assignment.accountexpiry IS NULL OR assignment.accountexpiry > statement_timestamp())
      AND (assignment.lockeduntil IS NULL OR assignment.lockeduntil <= statement_timestamp())
  );
$function$;

REVOKE ALL ON FUNCTION public.is_super_system_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_system_admin() TO authenticated;

-- The system role receives platform permissions only. Department roles retain
-- their existing permission assignments.
DELETE FROM public.role_permissions
WHERE role_code = 'SUPER_SYSTEM_ADMIN';

INSERT INTO public.role_permissions (role_code, permission_code) VALUES
  ('SUPER_SYSTEM_ADMIN', 'SYSTEM_OVERSIGHT'),
  ('SUPER_SYSTEM_ADMIN', 'SYSTEM_TECHNICAL_ADMIN'),
  ('SUPER_SYSTEM_ADMIN', 'USER_ACCESS_ADMIN'),
  ('SUPER_SYSTEM_ADMIN', 'SECURITY_MONITORING'),
  ('SUPER_SYSTEM_ADMIN', 'AUDIT_OVERSIGHT')
ON CONFLICT DO NOTHING;

-- A system administrator has no departmental scope, even if an account has a
-- second role or stale scope rows.
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
    AND NOT public.is_super_system_admin()
    AND requested_scope_id IS NOT NULL
    AND EXISTS (
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
  WHERE public.current_user_session_is_active()
    AND NOT public.is_super_system_admin()
    AND role_assignment.user_id = auth.uid()
    AND role_assignment.isactive IS TRUE
    AND role_assignment.issuspended IS FALSE
    AND (role_assignment.accountexpiry IS NULL OR role_assignment.accountexpiry > statement_timestamp())
    AND (role_assignment.lockeduntil IS NULL OR role_assignment.lockeduntil <= statement_timestamp())
    AND role_assignment.employee_id IS NOT NULL
  ORDER BY (role_assignment.role_code = 'Employee') DESC
  LIMIT 1;
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

CREATE OR REPLACE FUNCTION public.can_access_employee(target_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT NOT public.is_super_system_admin()
    AND public.user_has_employee_scope(target_employee_id);
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_employee(target_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT NOT public.is_super_system_admin()
    AND target_employee_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.assignments AS assignment
      WHERE assignment.employee_id = target_employee_id
        AND assignment.is_primary IS TRUE
        AND assignment.status IN ('Active', 'OnLeave', 'Suspended')
        AND assignment.start_date <= CURRENT_DATE
        AND (assignment.end_date IS NULL OR assignment.end_date >= CURRENT_DATE)
        AND public.can_manage_personnel_domain(assignment.personnel_domain_id)
    );
$function$;

CREATE OR REPLACE FUNCTION public.can_access_confidential_employee(target_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT NOT public.is_super_system_admin()
    AND public.can_manage_employee(target_employee_id);
$function$;

-- This helper previously granted all confidential personnel access to the
-- platform role. Confidential records remain unavailable to that role.
CREATE OR REPLACE FUNCTION public.can_access_confidential_personnel()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT FALSE;
$function$;

CREATE OR REPLACE FUNCTION public.can_access_finance_employee(target_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT NOT public.is_super_system_admin()
    AND public.has_active_role(ARRAY['LAND_FINANCE_BOARD_USER']::TEXT[])
    AND public.can_access_employee(target_employee_id);
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_finance_employee(target_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT NOT public.is_super_system_admin()
    AND public.has_active_role(ARRAY['LAND_FINANCE_BOARD_USER']::TEXT[])
    AND public.can_manage_employee(target_employee_id);
$function$;

CREATE OR REPLACE FUNCTION public.can_access_employee_placement(
  target_employee_id UUID, target_domain_id UUID, target_board_id UUID,
  target_archdeaconry_id UUID, target_parish_id UUID, target_institution_id UUID,
  target_department_id UUID
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT NOT public.is_super_system_admin() AND (
    public.user_has_active_scope('PersonnelDomain', target_domain_id)
    OR (target_domain_id IS NULL AND target_board_id IS NULL
      AND public.user_has_active_scope('Archdeaconry', target_archdeaconry_id))
    OR (target_domain_id IS NULL AND target_board_id IS NULL
      AND target_archdeaconry_id IS NULL
      AND public.user_has_active_scope('Parish', target_parish_id))
    OR (target_domain_id IS NULL AND target_board_id IS NULL
      AND target_archdeaconry_id IS NULL AND target_parish_id IS NULL
      AND public.user_has_active_scope('Department', target_department_id))
    OR (target_domain_id IS NULL AND target_board_id IS NULL
      AND public.user_has_active_scope('Institution', target_institution_id))
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
  SELECT NOT public.is_super_system_admin() AND EXISTS (
    SELECT 1 FROM public.documents AS document
    WHERE document.id = target_document_id
      AND (
        (document.employee_id IS NOT NULL AND public.can_access_employee(document.employee_id))
        OR (document.personnel_domain_id IS NOT NULL
          AND public.user_has_active_scope('PersonnelDomain', document.personnel_domain_id))
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_document(target_document_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT NOT public.is_super_system_admin() AND EXISTS (
    SELECT 1 FROM public.documents AS document
    WHERE document.id = target_document_id
      AND (
        (document.employee_id IS NOT NULL AND public.can_manage_employee(document.employee_id))
        OR (document.personnel_domain_id IS NOT NULL
          AND public.can_manage_personnel_domain(document.personnel_domain_id))
      )
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
  SELECT NOT public.is_super_system_admin() AND (
    public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR']::TEXT[])
    OR (public.has_active_role(ARRAY['ArchdeaconryAdmin']::TEXT[])
      AND public.user_has_active_scope('Archdeaconry', target_archdeaconry_id))
    OR (public.has_active_role(ARRAY['ParishAdmin']::TEXT[])
      AND public.user_has_active_scope('Parish', target_parish_id))
    OR (public.has_active_role(ARRAY['InstitutionAdmin']::TEXT[])
      AND (public.user_has_active_scope('Institution', target_institution_id)
        OR public.user_has_active_scope('Department', target_department_id)))
    OR (public.has_active_role(ARRAY['BoardHR']::TEXT[])
      AND public.user_has_active_scope('Department', target_department_id))
  );
$function$;

-- Stop privileged workflow RPCs before they look up departmental record IDs.
CREATE OR REPLACE FUNCTION public.approve_employee_death_report(
  p_record_id UUID,
  p_confirmed_death_date TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
DECLARE
  report public.employee_death_records%ROWTYPE;
  actor_user_id UUID := auth.uid();
BEGIN
  IF actor_user_id IS NULL OR public.is_super_system_admin() THEN
    RAISE EXCEPTION 'Not authorized to approve departmental personnel records.' USING ERRCODE = '42501';
  END IF;
  IF p_confirmed_death_date IS NULL OR p_confirmed_death_date > statement_timestamp() THEN
    RAISE EXCEPTION 'Confirmed death date must be present and cannot be in the future' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO report FROM public.employee_death_records WHERE id = p_record_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Death report not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.can_manage_employee(report.employee_id) THEN
    RAISE EXCEPTION 'The employee is outside your personnel scope.' USING ERRCODE = '42501';
  END IF;
  IF report.verification_status <> 'SecondVerification'
     OR report.reporter_id = actor_user_id
     OR report.first_verifier_user_id = actor_user_id
     OR report.second_verifier_user_id = actor_user_id THEN
    RAISE EXCEPTION 'Approval requires two independent verifications by other users' USING ERRCODE = '42501';
  END IF;

  UPDATE public.employee_death_records SET verification_status = 'Passed',
    confirmed_death_date = p_confirmed_death_date, approved_by = actor_user_id,
    approval_date = clock_timestamp(), approving_authority = actor_user_id::TEXT
  WHERE id = p_record_id;
  UPDATE public.employees SET life_status = 'Deceased', date_of_death = p_confirmed_death_date,
    employment_status = CASE WHEN employment_status IN ('Active', 'OnLeave', 'Suspended')
      THEN 'DeceasedActive' ELSE employment_status END,
    "updatedAt" = clock_timestamp()
  WHERE id = report.employee_id;
  RETURN report.employee_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_employee_transfer(target_transfer_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
DECLARE
  transfer_row public.employee_transfers%ROWTYPE;
  previous_assignment public.assignments%ROWTYPE;
  next_assignment public.assignments%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR public.is_super_system_admin() THEN
    RAISE EXCEPTION 'Not authorized to approve departmental transfers.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO transfer_row
  FROM public.employee_transfers
  WHERE id = target_transfer_id AND status = 'Pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The pending transfer was not found.' USING ERRCODE = 'P0002';
  END IF;
  IF transfer_row.created_by = auth.uid() THEN
    RAISE EXCEPTION 'A transfer must be approved by a different officer.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_manage_personnel_domain(transfer_row.new_domain_id) THEN
    RAISE EXCEPTION 'The receiving personnel domain must approve this transfer.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO previous_assignment FROM public.assignments
  WHERE id = transfer_row.previous_assignment_id
    AND employee_id = transfer_row.employee_id
    AND personnel_domain_id = transfer_row.previous_domain_id
  FOR UPDATE;
  SELECT * INTO next_assignment FROM public.assignments
  WHERE id = transfer_row.new_assignment_id
    AND employee_id = transfer_row.employee_id
    AND personnel_domain_id = transfer_row.new_domain_id
  FOR UPDATE;
  IF previous_assignment.id IS NULL OR next_assignment.id IS NULL
      OR previous_assignment.status NOT IN ('Active', 'OnLeave')
      OR next_assignment.start_date::DATE <> transfer_row.effective_date
      OR previous_assignment.start_date::DATE >= transfer_row.effective_date THEN
    RAISE EXCEPTION 'The transfer assignments or effective date are invalid.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.assignments
  SET end_date = transfer_row.effective_date - 1, updatedat = NOW()
  WHERE id = previous_assignment.id;
  UPDATE public.employee_transfers
  SET status = 'Approved', approved_by = auth.uid(), updated_at = NOW()
  WHERE id = transfer_row.id;
  RETURN transfer_row.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_employee_transfer(target_transfer_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
DECLARE
  transfer_row public.employee_transfers%ROWTYPE;
  changed_rows INTEGER;
BEGIN
  IF auth.uid() IS NULL OR public.is_super_system_admin() THEN
    RAISE EXCEPTION 'Not authorized to complete departmental transfers.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO transfer_row FROM public.employee_transfers
  WHERE id = target_transfer_id AND status = 'Approved'
  FOR UPDATE;
  IF NOT FOUND OR CURRENT_DATE < transfer_row.effective_date THEN
    RAISE EXCEPTION 'Only an approved transfer on or after its effective date can be completed.' USING ERRCODE = '22023';
  END IF;
  IF NOT (public.can_manage_personnel_domain(transfer_row.previous_domain_id)
      OR public.can_manage_personnel_domain(transfer_row.new_domain_id)) THEN
    RAISE EXCEPTION 'This transfer is outside your personnel scope.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.assignments
  SET status = 'Completed', updatedat = NOW()
  WHERE id = transfer_row.previous_assignment_id
    AND employee_id = transfer_row.employee_id
    AND personnel_domain_id = transfer_row.previous_domain_id
    AND end_date = transfer_row.effective_date - 1;
  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  IF changed_rows <> 1 THEN
    RAISE EXCEPTION 'The previous assignment no longer matches this transfer.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.employee_transfers
  SET status = 'Completed', updated_at = NOW()
  WHERE id = transfer_row.id;
  RETURN transfer_row.id;
END;
$function$;

-- Keep an employee-to-user link out of the system administrator's account
-- management API. Service-role provisioning can still create ordinary users.
REVOKE SELECT, INSERT, UPDATE ON TABLE public.user_roles FROM authenticated;
GRANT SELECT (
  id, user_id, role_code, permissions, scopes, isactive, issuspended,
  accountexpiry, loginattempts, lockeduntil, lastloginat, createdat, updatedat,
  retired_role_code
) ON TABLE public.user_roles TO authenticated;
GRANT INSERT (
  user_id, role_code, permissions, scopes, isactive, issuspended,
  accountexpiry, loginattempts, lockeduntil, lastloginat, updatedat,
  retired_role_code
) ON TABLE public.user_roles TO authenticated;
GRANT UPDATE (
  role_code, permissions, scopes, isactive, issuspended, accountexpiry,
  loginattempts, lockeduntil, lastloginat, updatedat, retired_role_code
) ON TABLE public.user_roles TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_system_admin_self_department_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
BEGIN
  IF public.is_super_system_admin()
     AND NEW.user_id = auth.uid()
     AND NEW.role_code <> 'SUPER_SYSTEM_ADMIN' THEN
    RAISE EXCEPTION 'A Super/System Administrator cannot assign a departmental role to their own account.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.prevent_system_admin_self_department_role() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS prevent_system_admin_self_department_role ON public.user_roles;
CREATE TRIGGER prevent_system_admin_self_department_role
  BEFORE INSERT OR UPDATE OF user_id, role_code ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_system_admin_self_department_role();

-- The super administrator can maintain identities and access policy, but may
-- not use an employee link to enter the departmental workforce.
DO $departmental_rls$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'archdeaconries', 'parishes', 'local_churches', 'boards', 'departments',
    'institutions', 'grades', 'positions', 'personnel_domains', 'employees',
    'personal_details', 'assignments', 'employee_roles', 'acting_appointments',
    'delegations', 'spouses', 'children', 'next_of_kin', 'qualifications',
    'training_records', 'professional_licences', 'leave_records',
    'performance_appraisals', 'appointments', 'payroll_records', 'benefits',
    'pension_schemes', 'pension_contributions', 'retirements',
    'early_retirement_applications', 'disciplinary_cases', 'safeguarding_cases',
    'employee_death_records', 'documents', 'stored_files', 'vacancies',
    'applicants', 'recruitment_applications', 'welfare_records',
    'property_assignments', 'succession_records', 'employee_transfers',
    'user_notifications'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('DROP POLICY IF EXISTS super_system_admin_departmental_block ON public.%I', table_name);
      EXECUTE format(
        'CREATE POLICY super_system_admin_departmental_block ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_super_system_admin()) WITH CHECK (NOT public.is_super_system_admin())',
        table_name
      );
    END IF;
  END LOOP;
END;
$departmental_rls$;

-- The employee document bucket is also departmental data; this restrictive
-- policy composes with its existing per-document scope checks.
DROP POLICY IF EXISTS super_system_admin_departmental_block ON storage.objects;
CREATE POLICY super_system_admin_departmental_block ON storage.objects
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (bucket_id <> 'hr-documents' OR NOT public.is_super_system_admin())
  WITH CHECK (bucket_id <> 'hr-documents' OR NOT public.is_super_system_admin());

COMMIT;
