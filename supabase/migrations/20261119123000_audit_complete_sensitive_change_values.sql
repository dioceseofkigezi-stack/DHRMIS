-- Record complete before/after values for changed business data while keeping
-- authentication credentials and secrets out of the audit trail.
BEGIN;

ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS record_key JSONB;

COMMENT ON COLUMN public.audit_log.record_key IS
  'Primary key values for changed rows, including composite and non-UUID primary keys.';

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

  -- Credentials are not useful for accountability and must never be copied to
  -- a second store. Personal, financial, medical, family, and case data remain
  -- available to the restricted audit readers as before/after values.
  IF normalized_field ~ '(password|passwd|passphrase|secret|token|credential|apikey|accesskey|privatekey|servicekey|servicerole|clientsecret|authorization|authheader|bearer|jwt|cookie|sessionid|authsessionid|encryptionkey|signingkey)' THEN
    RETURN to_jsonb('[REDACTED: CREDENTIAL OR SECRET]'::TEXT);
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
  config_key TEXT;
  result_values JSONB := '{}'::JSONB;
BEGIN
  IF p_row IS NULL THEN
    RETURN result_values;
  END IF;

  config_key := regexp_replace(lower(COALESCE(p_row ->> 'config_key', '')), '[^a-z0-9]', '', 'g');

  FOR field_name IN
    SELECT jsonb_array_elements_text(COALESCE(p_changed_fields, '[]'::JSONB))
  LOOP
    field_value := p_row -> field_name;

    -- Config values are normally user-visible. Redact values only where the
    -- config key itself clearly identifies a credential or secret.
    IF p_table_name = 'system_config' AND field_name = 'config_value'
      AND config_key ~ '(password|passwd|passphrase|secret|token|credential|apikey|accesskey|privatekey|servicekey|servicerole|clientsecret|authorization|authheader|bearer|jwt|cookie|encryptionkey|signingkey)' THEN
      field_value := to_jsonb('[REDACTED: CREDENTIAL OR SECRET]'::TEXT);
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
  record_key JSONB;
  record_snapshot JSONB;
  related_employee_id UUID;
  request_headers JSONB;
  request_claims JSONB;
  audit_actor_id UUID;
  audit_actor_name TEXT;
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

  audit_actor_id := auth.uid();
  IF audit_actor_id IS NULL AND request_claims ->> 'role' = 'service_role'
    AND request_headers ->> 'x-audit-actor-id' ~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    audit_actor_id := (request_headers ->> 'x-audit-actor-id')::UUID;
  END IF;

  IF audit_actor_id IS NOT NULL THEN
    SELECT COALESCE(
      NULLIF(BTRIM(actor.raw_user_meta_data ->> 'full_name'), ''),
      NULLIF(BTRIM(actor.raw_user_meta_data ->> 'name'), ''),
      actor.email
    ) INTO audit_actor_name
    FROM auth.users AS actor
    WHERE actor.id = audit_actor_id;
  END IF;

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
    WHERE tracked_session.user_id = audit_actor_id
      AND tracked_session.auth_session_id = request_claims ->> 'session_id'
    LIMIT 1;
  END IF;
  IF audit_session_id IS NULL AND request_claims ->> 'role' = 'service_role'
    AND request_headers ->> 'x-audit-session-id' ~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    SELECT tracked_session.id INTO audit_session_id
    FROM public.user_sessions AS tracked_session
    WHERE tracked_session.id = (request_headers ->> 'x-audit-session-id')::UUID
      AND tracked_session.user_id = audit_actor_id
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

  record_snapshot := CASE WHEN TG_OP = 'DELETE' THEN old_data ELSE new_data END;
  SELECT jsonb_object_agg(attribute_row.attname, record_snapshot -> attribute_row.attname ORDER BY key_column.ordinal)
    INTO record_key
    FROM pg_index AS index_row
    CROSS JOIN LATERAL unnest(index_row.indkey) WITH ORDINALITY AS key_column(attnum, ordinal)
    JOIN pg_attribute AS attribute_row
      ON attribute_row.attrelid = index_row.indrelid
      AND attribute_row.attnum = key_column.attnum
      AND attribute_row.attnum > 0
    WHERE index_row.indrelid = TG_RELID
      AND index_row.indisprimary;
  IF record_key IS NULL AND row_id IS NOT NULL THEN
    record_key := jsonb_build_object('id', row_id);
  END IF;
  record_key := public.audit_redact_json_value(record_key, 'record_key');

  INSERT INTO public.audit_log (
    user_id, user_name, action, module, record_id, record_key, record_type, employee_id,
    session_id, ip_address, device_info, user_agent,
    result, before_values, after_values, context
  ) VALUES (
    audit_actor_id,
    audit_actor_name,
    CASE TG_OP
      WHEN 'INSERT' THEN 'CREATED'
      WHEN 'UPDATE' THEN 'UPDATE'
      ELSE 'DELETE_REQUEST'
    END,
    CASE WHEN TG_TABLE_SCHEMA = 'public' THEN TG_TABLE_NAME ELSE TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME END,
    row_id,
    record_key,
    CASE WHEN TG_TABLE_SCHEMA = 'public' THEN TG_TABLE_NAME ELSE TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME END,
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
    'Database trigger recorded all changed fields and before/after values. Credential and secret values are excluded.'
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.log_row_change() FROM PUBLIC, anon, authenticated;

-- Cover every current application table, including tables added after the
-- original trigger list was written. The audit stores are excluded to avoid
-- recursively logging the logs themselves. Username writes have explicit
-- audit events in their RPCs and are excluded to avoid duplicate entries.
DO $block$
DECLARE
  table_row RECORD;
BEGIN
  IF to_regclass('public.employee_transfers') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_employee_transfers_change ON public.employee_transfers';
  END IF;

  FOR table_row IN
    SELECT relation.relname AS tablename
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND relation.relispartition IS FALSE
      AND relation.relname NOT IN ('audit_log', 'sensitive_read_log', 'admin_usernames')
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend AS extension_dependency
        WHERE extension_dependency.classid = 'pg_class'::REGCLASS
          AND extension_dependency.objid = relation.oid
          AND extension_dependency.deptype = 'e'
      )
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_row_change ON public.%I', table_row.tablename);
    EXECUTE format(
      'CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_row_change()',
      table_row.tablename
    );
  END LOOP;
END;
$block$;

-- Storage metadata includes file uploads and deletions, such as profile photos.
-- Capture the object path and metadata without copying the binary file itself.
DO $block$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_row_change ON storage.objects';
    EXECUTE 'CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.log_row_change()';
  END IF;
END;
$block$;

COMMENT ON FUNCTION public.audit_change_values(JSONB, JSONB, TEXT) IS
  'Records changed personal and business values for audit readers while redacting credentials and secrets.';
COMMENT ON FUNCTION public.log_row_change() IS
  'Records inserts, changed field updates, and deletes on audited application and storage tables with before/after values, except audit stores.';

COMMIT;
