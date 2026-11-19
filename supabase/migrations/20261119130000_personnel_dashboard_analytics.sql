-- Return aggregated workforce activity and status data for an authorized
-- personnel workspace dashboard. No employee-level rows leave the database.
BEGIN;

CREATE OR REPLACE FUNCTION public.personnel_dashboard_analytics(
  target_domain_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  series_key TEXT,
  bucket_start TIMESTAMPTZ,
  value BIGINT,
  label TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
DECLARE
  report_days INTEGER := LEAST(GREATEST(COALESCE(p_days, 30), 1), 30);
BEGIN
  IF NOT public.can_manage_personnel_domain(target_domain_id) THEN
    RAISE EXCEPTION 'The requested personnel domain is outside your authorization.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.personnel_domains AS domain
    WHERE domain.id = target_domain_id AND domain.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'The personnel domain is not active.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH bounds AS (
    SELECT date_trunc('hour', statement_timestamp()) - make_interval(days => report_days) AS start_at,
      date_trunc('hour', statement_timestamp()) AS end_at
  ), hour_buckets AS (
    SELECT generated.bucket_start
    FROM bounds
    CROSS JOIN LATERAL generate_series(bounds.start_at, bounds.end_at, INTERVAL '1 hour') AS generated(bucket_start)
  ), hourly_assignments AS (
    SELECT date_trunc('hour', assignment.createdat) AS hour_start, COUNT(*) AS assignment_total
    FROM public.assignments AS assignment
    CROSS JOIN bounds
    WHERE assignment.personnel_domain_id = target_domain_id
      AND assignment.createdat >= bounds.start_at
      AND assignment.createdat <= statement_timestamp()
    GROUP BY date_trunc('hour', assignment.createdat)
  ), current_employees AS (
    SELECT DISTINCT ON (employee.id) employee.id, employee.employment_status
    FROM public.employees AS employee
    JOIN public.assignments AS assignment ON assignment.employee_id = employee.id
    WHERE assignment.personnel_domain_id = target_domain_id
      AND assignment.is_primary IS TRUE
      AND assignment.status IN ('Active', 'OnLeave', 'Suspended')
      AND assignment.start_date <= CURRENT_DATE
      AND (assignment.end_date IS NULL OR assignment.end_date >= CURRENT_DATE)
    ORDER BY employee.id, assignment.start_date DESC
  ), dashboard_rows AS (
    SELECT 'assignment_activity'::TEXT AS series_key, hour_buckets.bucket_start,
      COALESCE(hourly_assignments.assignment_total, 0)::BIGINT AS value, NULL::TEXT AS label
    FROM hour_buckets
    LEFT JOIN hourly_assignments ON hourly_assignments.hour_start = hour_buckets.bucket_start

    UNION ALL

    SELECT 'employment_status'::TEXT, NULL::TIMESTAMPTZ,
      COUNT(*)::BIGINT, current_employees.employment_status::TEXT
    FROM current_employees
    GROUP BY current_employees.employment_status
  )
  SELECT dashboard_rows.series_key, dashboard_rows.bucket_start, dashboard_rows.value, dashboard_rows.label
  FROM dashboard_rows
  ORDER BY dashboard_rows.series_key, dashboard_rows.bucket_start NULLS LAST, dashboard_rows.label;
END;
$function$;

REVOKE ALL ON FUNCTION public.personnel_dashboard_analytics(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.personnel_dashboard_analytics(UUID, INTEGER) TO authenticated, service_role;

COMMENT ON FUNCTION public.personnel_dashboard_analytics(UUID, INTEGER) IS
  'Returns hourly assignment creation counts and current employee status totals to authorized personnel workspace dashboards.';

COMMIT;
