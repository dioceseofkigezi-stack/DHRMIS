-- Protect employee lifecycle status from direct client writes and enforce
-- maker-checker death verification in database-owned RPCs.
BEGIN;

-- Only trusted backend/database processes may change these lifecycle fields.
REVOKE INSERT, UPDATE ON TABLE public.employees FROM authenticated;
GRANT INSERT (
  employee_id, employee_number, title, first_name, middle_name, last_name,
  gender, telephone, email, employee_category
) ON TABLE public.employees TO authenticated;
GRANT UPDATE (
  employee_id, employee_number, title, first_name, middle_name, last_name,
  gender, telephone, email, employee_category
) ON TABLE public.employees TO authenticated;

ALTER TABLE public.employee_death_records
  ALTER COLUMN first_verifier_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS first_verifier_user_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS second_verifier_user_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approval_date TIMESTAMPTZ;

-- Death workflow writes must use the checked transition functions below.
DROP POLICY IF EXISTS confidential_personnel_insert_central_hr ON public.employee_death_records;
DROP POLICY IF EXISTS confidential_personnel_update_central_hr ON public.employee_death_records;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.employee_death_records FROM authenticated;

CREATE OR REPLACE FUNCTION public.submit_employee_death_report(
  p_employee_id UUID,
  p_reported_death_date TIMESTAMPTZ,
  p_place_of_death TEXT,
  p_cause_of_death TEXT,
  p_death_certificate_reference TEXT,
  p_supporting_document_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
DECLARE
  new_record_id UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_active_role(
    ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR']::TEXT[]
  ) THEN
    RAISE EXCEPTION 'Not authorized to submit a death report' USING ERRCODE = '42501';
  END IF;
  IF p_employee_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.employees AS employee WHERE employee.id = p_employee_id
  ) THEN
    RAISE EXCEPTION 'Employee record not found' USING ERRCODE = '22023';
  END IF;
  IF p_reported_death_date > statement_timestamp() THEN
    RAISE EXCEPTION 'Reported death date cannot be in the future' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('employee-death:' || p_employee_id::TEXT, 0));
  IF EXISTS (
    SELECT 1 FROM public.employee_death_records AS existing_report
    WHERE existing_report.employee_id = p_employee_id
      AND existing_report.verification_status IN ('Pending', 'FirstVerification', 'SecondVerification')
  ) THEN
    RAISE EXCEPTION 'An active death report already exists for this employee' USING ERRCODE = '23505';
  END IF;
  IF public.current_user_employee_id() = p_employee_id THEN
    RAISE EXCEPTION 'An employee cannot report their own death' USING ERRCODE = '42501';
  END IF;
  IF length(COALESCE(p_place_of_death, '')) > 300
     OR length(COALESCE(p_cause_of_death, '')) > 4000
     OR length(COALESCE(p_death_certificate_reference, '')) > 200 THEN
    RAISE EXCEPTION 'Death report fields exceed their allowed length' USING ERRCODE = '22023';
  END IF;
  IF p_supporting_document_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.documents AS document
    WHERE document.id = p_supporting_document_id
      AND document.employee_id = p_employee_id
  ) THEN
    RAISE EXCEPTION 'Supporting document is not linked to this employee' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.employee_death_records (
    employee_id, reported_death_date, place_of_death, cause_of_death,
    death_certificate_reference, supporting_document_id, reporter_id,
    verification_status, reversal_status
  ) VALUES (
    p_employee_id, p_reported_death_date, NULLIF(btrim(p_place_of_death), ''),
    NULLIF(btrim(p_cause_of_death), ''),
    NULLIF(btrim(p_death_certificate_reference), ''), p_supporting_document_id,
    auth.uid(), 'Pending', 'None'
  )
  RETURNING id INTO new_record_id;

  RETURN new_record_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_employee_death_report(p_record_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
DECLARE
  report public.employee_death_records%ROWTYPE;
  actor_user_id UUID := auth.uid();
  actor_employee_id UUID := public.current_user_employee_id();
BEGIN
  IF actor_user_id IS NULL OR NOT public.has_active_role(
    ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR']::TEXT[]
  ) THEN
    RAISE EXCEPTION 'Not authorized to verify a death report' USING ERRCODE = '42501';
  END IF;
  IF actor_employee_id IS NULL THEN
    RAISE EXCEPTION 'A linked employee account is required to verify a death report' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO report
  FROM public.employee_death_records
  WHERE id = p_record_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Death report not found' USING ERRCODE = 'P0002';
  END IF;
  IF actor_user_id = report.reporter_id OR actor_employee_id = report.employee_id THEN
    RAISE EXCEPTION 'The reporter or subject cannot verify this report' USING ERRCODE = '42501';
  END IF;

  IF report.verification_status = 'Pending' THEN
    UPDATE public.employee_death_records
    SET verification_status = 'FirstVerification',
        first_verifier_id = actor_employee_id,
        first_verifier_user_id = actor_user_id,
        first_verification_date = clock_timestamp()
    WHERE id = p_record_id;
    RETURN 'FirstVerification';
  ELSIF report.verification_status = 'FirstVerification' THEN
    IF report.first_verifier_user_id = actor_user_id
       OR report.first_verifier_id = actor_employee_id THEN
      RAISE EXCEPTION 'A different person must perform the second verification' USING ERRCODE = '42501';
    END IF;
    UPDATE public.employee_death_records
    SET verification_status = 'SecondVerification',
        second_verifier_id = actor_employee_id,
        second_verifier_user_id = actor_user_id,
        second_verification_date = clock_timestamp()
    WHERE id = p_record_id;
    RETURN 'SecondVerification';
  END IF;

  RAISE EXCEPTION 'This death report is not awaiting verification' USING ERRCODE = '22023';
END;
$function$;

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
  IF actor_user_id IS NULL OR NOT public.has_active_role(
    ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR']::TEXT[]
  ) THEN
    RAISE EXCEPTION 'Not authorized to approve a death report' USING ERRCODE = '42501';
  END IF;
  IF p_confirmed_death_date IS NULL OR p_confirmed_death_date > statement_timestamp() THEN
    RAISE EXCEPTION 'Confirmed death date must be present and cannot be in the future' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO report
  FROM public.employee_death_records
  WHERE id = p_record_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Death report not found' USING ERRCODE = 'P0002';
  END IF;
  IF report.verification_status <> 'SecondVerification'
     OR report.reporter_id = actor_user_id
     OR report.first_verifier_user_id = actor_user_id
     OR report.second_verifier_user_id = actor_user_id THEN
    RAISE EXCEPTION 'Approval requires two independent verifications by other users' USING ERRCODE = '42501';
  END IF;

  UPDATE public.employee_death_records
  SET verification_status = 'Passed',
      confirmed_death_date = p_confirmed_death_date,
      approved_by = actor_user_id,
      approval_date = clock_timestamp(),
      approving_authority = actor_user_id::TEXT
  WHERE id = p_record_id;

  UPDATE public.employees
  SET life_status = 'Deceased',
      date_of_death = p_confirmed_death_date,
      employment_status = CASE
        WHEN employment_status IN ('Active', 'OnLeave', 'Suspended') THEN 'DeceasedActive'
        ELSE employment_status
      END,
      "updatedAt" = clock_timestamp()
  WHERE id = report.employee_id;

  RETURN report.employee_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_employee_death_report(UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_employee_death_report(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_employee_death_report(UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_employee_death_report(UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_employee_death_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_employee_death_report(UUID, TIMESTAMPTZ) TO authenticated;

COMMIT;
