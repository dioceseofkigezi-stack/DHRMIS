-- Regression checks for decentralized personnel ownership and role isolation.
DO $test$
DECLARE
  policy_check TEXT;
  access_function TEXT;
  management_function TEXT;
  placement_policy TEXT;
BEGIN
  IF (SELECT COUNT(*) FROM public.personnel_domains) <> 7 THEN
    RAISE EXCEPTION 'Expected a Secretariat domain and six Board personnel domains';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.personnel_domains
    WHERE code = 'SECRETARIAT' AND is_secretariat IS TRUE AND board_id IS NULL
  ) THEN
    RAISE EXCEPTION 'The Secretariat personnel domain is missing or attached to a Board';
  END IF;

  IF (SELECT COUNT(*) FROM public.personnel_domains AS domain
      JOIN public.boards AS board ON board.id = domain.board_id
      WHERE domain.is_secretariat IS FALSE
        AND board.code IN ('MISSION', 'EDUCATION', 'HEALTH', 'LAND_FINANCE', 'PLANNING_DEVELOPMENT', 'ICT')) <> 6 THEN
    RAISE EXCEPTION 'Each required Board must have an independent personnel domain';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.employees'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.assignments'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.vacancies'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.employee_transfers'::regclass) THEN
    RAISE EXCEPTION 'A personnel table is missing row-level security';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assignments'
      AND column_name = 'personnel_domain_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vacancies'
      AND column_name = 'personnel_domain_id'
  ) THEN
    RAISE EXCEPTION 'Assignments and vacancies must identify their managing personnel domain';
  END IF;

  SELECT with_check INTO policy_check FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'employees' AND policyname = 'employees_insert_scoped';
  IF policy_check IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'Direct employee insertion must remain disabled in favor of the scoped creation workflow';
  END IF;

  SELECT pg_get_functiondef('public.can_access_employee(uuid)'::regprocedure) INTO access_function;
  IF access_function ILIKE '%SystemAdministrator%'
     OR access_function ILIKE '%ICTAdministrator%' THEN
    RAISE EXCEPTION 'System or ICT administration has inherited employee-data access';
  END IF;

  SELECT pg_get_functiondef('public.can_manage_personnel_domain(uuid)'::regprocedure) INTO management_function;
  IF management_function ILIKE '%SystemAdministrator%'
     OR management_function ILIKE '%ICTAdministrator%' THEN
    RAISE EXCEPTION 'System or ICT administration can manage personnel domains';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.assignments'::regclass
      AND tgname = 'assignments_enforce_personnel_domain'
      AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.employee_transfers'::regclass
      AND tgname = 'audit_employee_transfers_change'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Domain consistency or transfer audit triggers are missing';
  END IF;

  SELECT qual INTO placement_policy FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'assignments' AND policyname = 'assignments_read_scoped';
  IF placement_policy NOT LIKE '%can_access_employee_placement%' THEN
    RAISE EXCEPTION 'Assignment reads must be checked against the row placement scope';
  END IF;

  SELECT qual INTO placement_policy FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'employee_roles' AND policyname = 'employee_roles_read_scoped';
  IF placement_policy NOT LIKE '%can_access_employee_placement%' THEN
    RAISE EXCEPTION 'Employee-role reads must be checked against the row placement scope';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.create_employee_in_personnel_domain(jsonb,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.request_employee_transfer(uuid,uuid,date,text,jsonb,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.approve_employee_transfer(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.can_access_employee_placement(uuid,uuid,uuid,uuid,uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Scoped employee creation or transfer workflows are not executable';
  END IF;

  IF has_function_privilege('anon', 'public.create_employee_in_personnel_domain(jsonb,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.request_employee_transfer(uuid,uuid,date,text,jsonb,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.approve_employee_transfer(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.can_access_employee_placement(uuid,uuid,uuid,uuid,uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous clients can execute a personnel workflow';
  END IF;
END;
$test$;
