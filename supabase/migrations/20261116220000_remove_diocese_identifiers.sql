-- This installation is the Diocese of Kigezi. Organizational access starts at
-- personnel domains, Boards, Archdeaconries and Parishes; a Diocese row and ID
-- do not provide an additional authorization boundary.

CREATE OR REPLACE VIEW public.organizational_scopes
WITH (security_invoker = TRUE)
AS
  SELECT 'Department'::TEXT AS scope_type, domain.id AS scope_id,
    domain.code AS scope_code, domain.name AS scope_name,
    NULL::TEXT AS parent_scope_type, NULL::UUID AS parent_scope_id,
    domain.is_active AS is_active
  FROM public.personnel_domains AS domain
  UNION ALL
  SELECT 'Unit', department.id, department.code, department.name,
    'Department'::TEXT,
    COALESCE(
      (SELECT domain.id FROM public.personnel_domains AS domain WHERE domain.board_id = department.board_id),
      (SELECT domain.id FROM public.personnel_domains AS domain WHERE domain.is_secretariat IS TRUE)),
    department.isactive
  FROM public.departments AS department
  UNION ALL
  SELECT 'Institution', institution.id, institution.code, institution.name,
    'Department'::TEXT,
    COALESCE(
      (SELECT domain.id FROM public.personnel_domains AS domain WHERE domain.board_id = institution.board_id),
      (SELECT domain.id FROM public.personnel_domains AS domain WHERE domain.is_secretariat IS TRUE)),
    institution.isactive
  FROM public.institutions AS institution
  UNION ALL
  SELECT 'Archdeaconry', archdeaconry.id, NULL::TEXT, archdeaconry.name,
    'Department', (SELECT domain.id FROM public.personnel_domains AS domain WHERE domain.is_secretariat IS TRUE),
    archdeaconry.isactive
  FROM public.archdeaconries AS archdeaconry
  UNION ALL
  SELECT 'Parish', parish.id, NULL::TEXT, parish.name,
    'Archdeaconry', parish.archdeaconry_id, parish.isactive
  FROM public.parishes AS parish
  UNION ALL
  SELECT 'LocalChurch', church.id, NULL::TEXT, church.name,
    'Parish', church.parish_id, church.isactive
  FROM public.local_churches AS church;

-- Remove obsolete Diocese assignments before rejecting that scope type.
DELETE FROM public.user_scopes WHERE scope_type = 'Diocese';

ALTER TABLE public.user_scopes
  DROP CONSTRAINT IF EXISTS user_scopes_scope_type_check;
ALTER TABLE public.user_scopes
  ADD CONSTRAINT user_scopes_scope_type_check
  CHECK (scope_type IN (
    'Archdeaconry', 'Parish', 'Institution', 'Department', 'Board', 'PersonnelDomain'
  ));

ALTER TABLE public.archdeaconries
  DROP COLUMN IF EXISTS diocese_id;

DROP TABLE IF EXISTS public.dioceses;
