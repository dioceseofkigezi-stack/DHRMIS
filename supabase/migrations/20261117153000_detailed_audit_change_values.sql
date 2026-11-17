-- Preserve field-level before/after values in audit entries while redacting
-- credentials and high-risk personal information.
BEGIN;

ALTER TABLE public.sensitive_read_log
  ADD COLUMN IF NOT EXISTS accessed_fields JSONB NOT NULL DEFAULT '[]'::JSONB;

COMMENT ON COLUMN public.sensitive_read_log.accessed_fields IS
  'Field names made available during the logged view, export, or download; values are never stored here.';

CREATE OR REPLACE FUNCTION public.audit_redact_json_value(
  p_value JSONB,
  p_field_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
DECLARE
  normalized_field TEXT;
  redacted_value JSONB;
BEGIN
  normalized_field := regexp_replace(lower(COALESCE(p_field_name, '')), '[^a-z0-9]', '', 'g');

  IF normalized_field IN ('nin', 'ninnumber') OR normalized_field ~
    '(password|passwd|secret|token|credential|apikey|accesskey|privatekey|nationalid|bank|accountnumber|accountno|routingnumber|iban|swift|sortcode|dateofbirth|medical|diagnos|health|causeofdeath|deathcause|safeguard|disciplin|allegation|incident|complaint|narrative|evidence|children|child|spouse|nextofkin|phone|mobile|telephone|email|address|filename|fileurl|filecontent|documentdata|filepath|storagepath|objectkey)' THEN
    RETURN to_jsonb('[REDACTED]'::TEXT);
  END IF;

  IF p_value IS NULL OR jsonb_typeof(p_value) IS NULL OR jsonb_typeof(p_value) = 'null' THEN
    RETURN p_value;
  ELSIF jsonb_typeof(p_value) = 'object' THEN
    SELECT COALESCE(
      jsonb_object_agg(entry.key, public.audit_redact_json_value(entry.value, entry.key)),
      '{}'::JSONB
    )
    INTO redacted_value
    FROM jsonb_each(p_value) AS entry;
    RETURN redacted_value;
  ELSIF jsonb_typeof(p_value) = 'array' THEN
    SELECT COALESCE(
      jsonb_agg(public.audit_redact_json_value(entry.value, p_field_name)),
      '[]'::JSONB
    )
    INTO redacted_value
    FROM jsonb_array_elements(p_value) AS entry(value);
    RETURN redacted_value;
  END IF;

  RETURN p_value;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_change_values(
  p_row JSONB,
  p_changed_fields JSONB,
  p_table_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
DECLARE
  field_name TEXT;
  field_value JSONB;
  result_values JSONB := '{}'::JSONB;
BEGIN
  IF p_row IS NULL THEN
    RETURN result_values;
  END IF;

  FOR field_name IN
    SELECT jsonb_array_elements_text(COALESCE(p_changed_fields, '[]'::JSONB))
  LOOP
    field_value := p_row -> field_name;

    -- Configuration values can contain deployment-specific secrets even when
    -- their key name is not secret-like, so never copy those values to the log.
    IF (p_table_name = 'system_config' AND field_name = 'config_value') OR
      p_table_name IN ('safeguarding_cases', 'disciplinary_cases', 'employee_death_records', 'spouses', 'children', 'next_of_kin') THEN
      field_value := to_jsonb('[REDACTED]'::TEXT);
    ELSE
      field_value := public.audit_redact_json_value(field_value, field_name);
    END IF;

    result_values := result_values || jsonb_build_object(field_name, field_value);
  END LOOP;

  RETURN result_values;
END;
$function$;

REVOKE ALL ON FUNCTION public.audit_redact_json_value(JSONB, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_change_values(JSONB, JSONB, TEXT) FROM PUBLIC, anon, authenticated;

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
  request_headers JSONB;
  request_claims JSONB;
  audit_session_id UUID;
  request_ip_address TEXT;
  request_device_info TEXT;
  request_user_agent TEXT;
BEGIN
  BEGIN
    request_headers := COALESCE(NULLIF(current_setting('request.headers', true), '')::JSONB, '{}'::JSONB);
  EXCEPTION WHEN OTHERS THEN
    request_headers := '{}'::JSONB;
  END;
  BEGIN
    request_claims := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::JSONB, '{}'::JSONB);
  EXCEPTION WHEN OTHERS THEN
    request_claims := '{}'::JSONB;
  END;

  request_ip_address := NULLIF(BTRIM(SPLIT_PART(COALESCE(
    request_headers ->> 'x-forwarded-for',
    request_headers ->> 'cf-connecting-ip',
    request_headers ->> 'x-real-ip',
    ''
  ), ',', 1)), '');
  request_device_info := NULLIF(LEFT(COALESCE(request_headers ->> 'x-client-info', ''), 500), '');
  request_user_agent := NULLIF(LEFT(COALESCE(request_headers ->> 'user-agent', ''), 1000), '');

  IF request_claims ->> 'session_id' IS NOT NULL THEN
    SELECT tracked_session.id INTO audit_session_id
    FROM public.user_sessions AS tracked_session
    WHERE tracked_session.user_id = auth.uid()
      AND tracked_session.auth_session_id = request_claims ->> 'session_id'
    LIMIT 1;
  END IF;

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
    session_id, ip_address, device_info, user_agent,
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
    audit_session_id,
    request_ip_address,
    request_device_info,
    request_user_agent,
    'Success',
    CASE WHEN TG_OP = 'INSERT' THEN NULL
      ELSE jsonb_build_object(
        'changed_fields', changed_fields,
        'values', public.audit_change_values(old_data, changed_fields, TG_TABLE_NAME)
      ) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL
      ELSE jsonb_build_object(
        'changed_fields', changed_fields,
        'values', public.audit_change_values(new_data, changed_fields, TG_TABLE_NAME)
      ) END,
    'Database change trigger; changed fields and permitted before/after values recorded. Sensitive values are redacted.'
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.log_row_change() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.audit_change_values(JSONB, JSONB, TEXT) IS
  'Builds an audit-safe snapshot of changed fields, redacting credentials and sensitive personal values.';

COMMIT;
