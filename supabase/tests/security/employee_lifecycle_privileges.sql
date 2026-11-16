-- Regression assertions for the lifecycle/death workflow migration.
DO $test$
BEGIN
  IF has_column_privilege('authenticated', 'public.employees', 'life_status', 'INSERT')
     OR has_column_privilege('authenticated', 'public.employees', 'life_status', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.employees', 'employment_status', 'INSERT')
     OR has_column_privilege('authenticated', 'public.employees', 'employment_status', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.employees', 'date_of_death', 'INSERT')
     OR has_column_privilege('authenticated', 'public.employees', 'date_of_death', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.employees', 'archived_at', 'INSERT')
     OR has_column_privilege('authenticated', 'public.employees', 'archived_at', 'UPDATE') THEN
    RAISE EXCEPTION 'Authenticated clients can directly modify protected employee lifecycle fields';
  END IF;

  IF has_table_privilege('authenticated', 'public.employee_death_records', 'INSERT')
     OR has_table_privilege('authenticated', 'public.employee_death_records', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.employee_death_records', 'DELETE') THEN
    RAISE EXCEPTION 'Authenticated clients can directly modify death verification records';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.submit_employee_death_report(uuid,timestamp with time zone,text,text,text,uuid)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'authenticated',
    'public.verify_employee_death_report(uuid)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'authenticated',
    'public.approve_employee_death_report(uuid,timestamp with time zone)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Authenticated users cannot execute the controlled death workflow functions';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.submit_employee_death_report(uuid,timestamp with time zone,text,text,text,uuid)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.verify_employee_death_report(uuid)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.approve_employee_death_report(uuid,timestamp with time zone)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Anonymous users can execute death workflow functions';
  END IF;
END;
$test$;
