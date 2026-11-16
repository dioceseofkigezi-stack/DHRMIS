-- Private object storage for HR documents. File access follows document RLS.
BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hr-documents',
  'hr-documents',
  FALSE,
  52428800,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY hr_documents_storage_read
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'hr-documents'
    AND (
      public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR', 'RegistryOfficer']::TEXT[])
      OR public.can_access_document(
        CASE
          WHEN split_part(name, '/', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          THEN split_part(name, '/', 2)::UUID
          ELSE NULL
        END
      )
    )
  );

CREATE POLICY hr_documents_storage_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'hr-documents'
    AND public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR', 'RegistryOfficer']::TEXT[])
  );

CREATE POLICY hr_documents_storage_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'hr-documents'
    AND public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR', 'RegistryOfficer']::TEXT[])
  )
  WITH CHECK (
    bucket_id = 'hr-documents'
    AND public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR', 'RegistryOfficer']::TEXT[])
  );

CREATE POLICY hr_documents_storage_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'hr-documents'
    AND public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR', 'RegistryOfficer']::TEXT[])
  );

COMMIT;
