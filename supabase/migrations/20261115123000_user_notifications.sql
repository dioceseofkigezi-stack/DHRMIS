-- User notifications are created by trusted backend processes and read by each recipient.
BEGIN;

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'HR', 'Approval', 'Security', 'Retirement', 'Licence', 'Training', 'System', 'Administrative'
  )),
  severity TEXT NOT NULL DEFAULT 'Informational' CHECK (severity IN ('Informational', 'Low', 'Medium', 'High', 'Critical')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  internal_path TEXT,
  entity_type TEXT,
  entity_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created
  ON public.user_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notifications_unread
  ON public.user_notifications(user_id, created_at DESC) WHERE is_read IS FALSE;

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_notifications FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.user_notifications TO authenticated;
GRANT UPDATE (is_read, read_at) ON TABLE public.user_notifications TO authenticated;

CREATE POLICY user_notifications_read_own
  ON public.user_notifications FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND public.has_active_role(ARRAY[
    'SuperAdministrator', 'SystemAdministrator', 'CentralHR', 'BoardHR',
    'ArchdeaconryAdmin', 'ParishAdmin', 'InstitutionAdmin', 'FinanceOfficer',
    'RegistryOfficer', 'SafeguardingOfficer', 'ICTAdministrator', 'Auditor',
    'Employee', 'ReadOnly'
  ]::TEXT[]));

CREATE POLICY user_notifications_mark_read_own
  ON public.user_notifications FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND public.has_active_role(ARRAY[
    'SuperAdministrator', 'SystemAdministrator', 'CentralHR', 'BoardHR',
    'ArchdeaconryAdmin', 'ParishAdmin', 'InstitutionAdmin', 'FinanceOfficer',
    'RegistryOfficer', 'SafeguardingOfficer', 'ICTAdministrator', 'Auditor',
    'Employee', 'ReadOnly'
  ]::TEXT[]))
  WITH CHECK (user_id = (SELECT auth.uid()) AND public.has_active_role(ARRAY[
    'SuperAdministrator', 'SystemAdministrator', 'CentralHR', 'BoardHR',
    'ArchdeaconryAdmin', 'ParishAdmin', 'InstitutionAdmin', 'FinanceOfficer',
    'RegistryOfficer', 'SafeguardingOfficer', 'ICTAdministrator', 'Auditor',
    'Employee', 'ReadOnly'
  ]::TEXT[]));

CREATE TRIGGER audit_row_change
  AFTER INSERT OR UPDATE OR DELETE ON public.user_notifications
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change();

COMMIT;
