-- Preserve a readable actor name alongside the durable Auth user ID.
BEGIN;

ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS user_name TEXT;

UPDATE public.audit_log AS log_entry
SET user_name = COALESCE(
  NULLIF(BTRIM(auth_user.raw_user_meta_data ->> 'full_name'), ''),
  NULLIF(BTRIM(auth_user.raw_user_meta_data ->> 'name'), ''),
  auth_user.email
)
FROM auth.users AS auth_user
WHERE log_entry.user_id = auth_user.id
  AND log_entry.user_name IS NULL;

CREATE OR REPLACE FUNCTION public.set_audit_log_user_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.user_id = auth.uid() THEN
    NEW.user_name := COALESCE(
      NULLIF(BTRIM(auth.jwt() -> 'user_metadata' ->> 'full_name'), ''),
      NULLIF(BTRIM(auth.jwt() -> 'user_metadata' ->> 'name'), ''),
      NULLIF(auth.jwt() ->> 'email', ''),
      NEW.user_name
    );
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_audit_log_user_name() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS audit_log_set_user_name ON public.audit_log;
CREATE TRIGGER audit_log_set_user_name
  BEFORE INSERT ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_log_user_name();

COMMENT ON COLUMN public.audit_log.user_name IS
  'Display name captured when the audit entry is written; user_id remains the authoritative actor identifier.';

COMMIT;
