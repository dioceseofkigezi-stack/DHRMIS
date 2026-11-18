-- Return hourly audit totals for the platform dashboard without exposing log rows.
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_dashboard_activity(p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  bucket_start TIMESTAMPTZ,
  success_count BIGINT,
  failure_count BIGINT,
  warning_count BIGINT,
  skipped_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $function$
DECLARE
  report_days INTEGER := LEAST(GREATEST(COALESCE(p_days, 30), 1), 30);
BEGIN
  IF NOT public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[]) THEN
    RAISE EXCEPTION 'Only an active Super/System Administrator can view dashboard activity.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH bounds AS (
    SELECT date_trunc('hour', statement_timestamp()) - make_interval(days => report_days) AS start_at,
      date_trunc('hour', statement_timestamp()) AS end_at
  ), hour_buckets AS (
    SELECT generated.bucket_start
    FROM bounds
    CROSS JOIN LATERAL generate_series(bounds.start_at, bounds.end_at, INTERVAL '1 hour') AS generated(bucket_start)
  ), hourly_totals AS (
    SELECT date_trunc('hour', log_entry.created_at) AS hour_start,
      COUNT(*) FILTER (WHERE log_entry.result = 'Success') AS success_total,
      COUNT(*) FILTER (WHERE log_entry.result = 'Failure') AS failure_total,
      COUNT(*) FILTER (WHERE log_entry.result = 'Warning') AS warning_total,
      COUNT(*) FILTER (WHERE log_entry.result = 'Skipped') AS skipped_total
    FROM public.audit_log AS log_entry
    CROSS JOIN bounds
    WHERE log_entry.created_at >= bounds.start_at
      AND log_entry.created_at <= statement_timestamp()
    GROUP BY date_trunc('hour', log_entry.created_at)
  )
  SELECT hour_buckets.bucket_start,
    COALESCE(hourly_totals.success_total, 0),
    COALESCE(hourly_totals.failure_total, 0),
    COALESCE(hourly_totals.warning_total, 0),
    COALESCE(hourly_totals.skipped_total, 0)
  FROM hour_buckets
  LEFT JOIN hourly_totals ON hourly_totals.hour_start = hour_buckets.bucket_start
  ORDER BY hour_buckets.bucket_start;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_dashboard_activity(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_activity(INTEGER) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_dashboard_activity(INTEGER) IS
  'Returns hourly audit-result totals for up to 30 days to the active Super/System Administrator dashboard.';

COMMIT;
