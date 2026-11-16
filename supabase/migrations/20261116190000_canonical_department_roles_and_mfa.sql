-- Canonical DHRMIS access: one platform administrator and one scoped user per
-- top-level department. Employee identity and effective-dated assignments stay
-- in the existing shared employee master.
BEGIN;

CREATE TABLE IF NOT EXISTS public.roles (
  role_code TEXT PRIMARY KEY,
  role_name TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('SYSTEM', 'PERSONNEL_DOMAIN')),
  scope_code TEXT,
  is_system_role BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT roles_scope_definition_check CHECK (
    (scope_type = 'SYSTEM' AND scope_code IS NULL)
    OR (scope_type = 'PERSONNEL_DOMAIN' AND scope_code IS NOT NULL)
  )
);

INSERT INTO public.roles (role_code, role_name, scope_type, scope_code) VALUES
  ('SUPER_SYSTEM_ADMIN', 'Super/System Administrator', 'SYSTEM', NULL),
  ('SECRETARIAT_USER', 'Secretariat / Main Office User', 'PERSONNEL_DOMAIN', 'SECRETARIAT'),
  ('MISSION_BOARD_USER', 'Mission Board User', 'PERSONNEL_DOMAIN', 'MISSION'),
  ('EDUCATION_BOARD_USER', 'Education Board User', 'PERSONNEL_DOMAIN', 'EDUCATION'),
  ('HEALTH_BOARD_USER', 'Health Board User', 'PERSONNEL_DOMAIN', 'HEALTH'),
  ('LAND_FINANCE_BOARD_USER', 'Land & Finance Board User', 'PERSONNEL_DOMAIN', 'LAND_FINANCE'),
  ('PLANNING_DEVELOPMENT_BOARD_USER', 'Planning & Development Board User', 'PERSONNEL_DOMAIN', 'PLANNING_DEVELOPMENT'),
  ('ICT_BOARD_USER', 'ICT Board User', 'PERSONNEL_DOMAIN', 'ICT')
ON CONFLICT (role_code) DO UPDATE SET
  role_name = EXCLUDED.role_name,
  scope_type = EXCLUDED.scope_type,
  scope_code = EXCLUDED.scope_code,
  is_active = TRUE;
UPDATE public.roles SET is_active = FALSE
WHERE role_code IN ('SUPER_ADMIN', 'SYSTEM_ADMIN');
ALTER TABLE public.roles DROP COLUMN IF EXISTS requires_mfa;
UPDATE public.roles SET is_system_role = (scope_type = 'SYSTEM');

CREATE TABLE IF NOT EXISTS public.permissions (
  permission_code TEXT PRIMARY KEY,
  permission_name TEXT NOT NULL,
  permission_group TEXT NOT NULL,
  is_sensitive BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT INTO public.permissions (permission_code, permission_name, permission_group, is_sensitive) VALUES
  ('SYSTEM_OVERSIGHT', 'System-wide oversight', 'Administration', TRUE),
  ('SYSTEM_TECHNICAL_ADMIN', 'Technical configuration and maintenance', 'Administration', TRUE),
  ('USER_ACCESS_ADMIN', 'Create, suspend and replace designated accounts', 'Administration', TRUE),
  ('PERSONNEL_READ', 'Read scoped personnel records', 'Personnel', TRUE),
  ('PERSONNEL_WRITE', 'Manage scoped personnel records', 'Personnel', TRUE),
  ('RECRUITMENT_ADMIN', 'Manage scoped recruitment', 'Personnel', TRUE),
  ('ORGANIZATION_ADMIN', 'Manage authorized organizational records', 'Organization', FALSE),
  ('REPORTS_EXPORT', 'Run scoped reports and exports', 'Reporting', TRUE),
  ('SECURITY_MONITORING', 'Review technical security events', 'Administration', TRUE),
  ('AUDIT_OVERSIGHT', 'Review system audit records', 'Administration', TRUE),
  ('FINANCIAL_PERSONNEL', 'Manage scoped finance and payroll records', 'Finance', TRUE)
ON CONFLICT (permission_code) DO UPDATE SET
  permission_name = EXCLUDED.permission_name,
  permission_group = EXCLUDED.permission_group,
  is_sensitive = EXCLUDED.is_sensitive;

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_code TEXT NOT NULL REFERENCES public.roles(role_code) ON DELETE CASCADE,
  permission_code TEXT NOT NULL REFERENCES public.permissions(permission_code) ON DELETE CASCADE,
  PRIMARY KEY (role_code, permission_code)
);

INSERT INTO public.role_permissions (role_code, permission_code)
SELECT 'SUPER_SYSTEM_ADMIN', permission.permission_code FROM public.permissions AS permission
ON CONFLICT DO NOTHING;
DELETE FROM public.role_permissions WHERE role_code IN ('SUPER_ADMIN', 'SYSTEM_ADMIN');
INSERT INTO public.role_permissions (role_code, permission_code)
SELECT role_definition.role_code, permission.permission_code
FROM public.roles AS role_definition
CROSS JOIN public.permissions AS permission
WHERE role_definition.scope_type = 'PERSONNEL_DOMAIN'
  AND permission.permission_code IN (
    'PERSONNEL_READ', 'PERSONNEL_WRITE', 'RECRUITMENT_ADMIN',
    'ORGANIZATION_ADMIN', 'REPORTS_EXPORT'
  )
ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions (role_code, permission_code) VALUES
  ('LAND_FINANCE_BOARD_USER', 'FINANCIAL_PERSONNEL')
ON CONFLICT DO NOTHING;

-- Give clients a common read model for the existing organizational tables.
CREATE OR REPLACE VIEW public.organizational_scopes
WITH (security_invoker = TRUE)
AS
  SELECT 'Diocese'::TEXT AS scope_type, diocese.id AS scope_id,
    diocese.code AS scope_code, diocese.name AS scope_name,
    NULL::TEXT AS parent_scope_type, NULL::UUID AS parent_scope_id,
    diocese.isactive AS is_active
  FROM public.dioceses AS diocese
  UNION ALL
  SELECT 'Department'::TEXT AS scope_type, domain.id AS scope_id,
    domain.code AS scope_code, domain.name AS scope_name,
    'Diocese'::TEXT AS parent_scope_type,
    (SELECT diocese.id FROM public.dioceses AS diocese LIMIT 1) AS parent_scope_id,
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

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.roles, public.permissions, public.role_permissions, public.organizational_scopes TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.roles, public.permissions, public.role_permissions FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS roles_read_active ON public.roles;
CREATE POLICY roles_read_active ON public.roles FOR SELECT TO authenticated
  USING (is_active IS TRUE AND auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS roles_manage_super_admin ON public.roles;
CREATE POLICY roles_manage_super_admin ON public.roles FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[]))
  WITH CHECK (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[]));
DROP POLICY IF EXISTS permissions_read_authenticated ON public.permissions;
CREATE POLICY permissions_read_authenticated ON public.permissions FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS permissions_manage_super_admin ON public.permissions;
CREATE POLICY permissions_manage_super_admin ON public.permissions FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[]))
  WITH CHECK (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[]));
DROP POLICY IF EXISTS role_permissions_read_authenticated ON public.role_permissions;
CREATE POLICY role_permissions_read_authenticated ON public.role_permissions FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS role_permissions_manage_super_admin ON public.role_permissions;
CREATE POLICY role_permissions_manage_super_admin ON public.role_permissions FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[]))
  WITH CHECK (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[]));

-- Convert prior user roles to the one-role model. Existing ambiguous Board HR
-- accounts are mapped only when their assigned organizational scope identifies
-- one department; unrecognized roles are retained as inactive history.
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS retired_role_code TEXT;
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_code_check;

WITH scoped_domains AS (
  SELECT scope.user_id, domain.code AS domain_code, 1 AS priority, scope.assignmentdate AS assigned_at
  FROM public.user_scopes AS scope
  JOIN public.personnel_domains AS domain ON domain.id = scope.scope_id
  WHERE scope.scope_type = 'PersonnelDomain' AND scope.isactive IS TRUE
  UNION ALL
  SELECT scope.user_id, domain.code, 2, scope.assignmentdate
  FROM public.user_scopes AS scope
  JOIN public.personnel_domains AS domain ON domain.board_id = scope.scope_id
  WHERE scope.scope_type = 'Board' AND scope.isactive IS TRUE
  UNION ALL
  SELECT scope.user_id, domain.code, 3, scope.assignmentdate
  FROM public.user_scopes AS scope
  JOIN public.departments AS department ON department.id = scope.scope_id
  JOIN public.personnel_domains AS domain ON domain.board_id = department.board_id
  WHERE scope.scope_type = 'Department' AND scope.isactive IS TRUE
  UNION ALL
  SELECT scope.user_id, domain.code, 4, scope.assignmentdate
  FROM public.user_scopes AS scope
  JOIN public.institutions AS institution ON institution.id = scope.scope_id
  JOIN public.personnel_domains AS domain ON domain.board_id = institution.board_id
  WHERE scope.scope_type = 'Institution' AND scope.isactive IS TRUE
), primary_scope AS (
  SELECT DISTINCT ON (user_id) user_id,
    CASE domain_code
      WHEN 'SECRETARIAT' THEN 'SECRETARIAT_USER'
      WHEN 'MISSION' THEN 'MISSION_BOARD_USER'
      WHEN 'EDUCATION' THEN 'EDUCATION_BOARD_USER'
      WHEN 'HEALTH' THEN 'HEALTH_BOARD_USER'
      WHEN 'LAND_FINANCE' THEN 'LAND_FINANCE_BOARD_USER'
      WHEN 'PLANNING_DEVELOPMENT' THEN 'PLANNING_DEVELOPMENT_BOARD_USER'
      WHEN 'ICT' THEN 'ICT_BOARD_USER'
    END AS role_code
  FROM scoped_domains
  ORDER BY user_id, priority, assigned_at NULLS LAST, domain_code
), role_map AS (
  SELECT assignment.id, assignment.role_code AS old_role_code,
    CASE assignment.role_code
      WHEN 'SuperAdministrator' THEN 'SUPER_SYSTEM_ADMIN'
      WHEN 'SystemAdministrator' THEN 'SUPER_SYSTEM_ADMIN'
      WHEN 'CentralHR' THEN 'SECRETARIAT_USER'
      WHEN 'ArchdeaconryAdmin' THEN 'SECRETARIAT_USER'
      WHEN 'ParishAdmin' THEN 'SECRETARIAT_USER'
      WHEN 'FinanceOfficer' THEN 'LAND_FINANCE_BOARD_USER'
      WHEN 'BoardHR' THEN primary_scope.role_code
      WHEN 'InstitutionAdmin' THEN primary_scope.role_code
      WHEN 'SUPER_ADMIN' THEN 'SUPER_SYSTEM_ADMIN'
      WHEN 'SYSTEM_ADMIN' THEN 'SUPER_SYSTEM_ADMIN'
      WHEN 'SUPER_SYSTEM_ADMIN' THEN 'SUPER_SYSTEM_ADMIN'
      WHEN 'SECRETARIAT_USER' THEN 'SECRETARIAT_USER'
      WHEN 'MISSION_BOARD_USER' THEN 'MISSION_BOARD_USER'
      WHEN 'EDUCATION_BOARD_USER' THEN 'EDUCATION_BOARD_USER'
      WHEN 'HEALTH_BOARD_USER' THEN 'HEALTH_BOARD_USER'
      WHEN 'LAND_FINANCE_BOARD_USER' THEN 'LAND_FINANCE_BOARD_USER'
      WHEN 'PLANNING_DEVELOPMENT_BOARD_USER' THEN 'PLANNING_DEVELOPMENT_BOARD_USER'
      WHEN 'ICT_BOARD_USER' THEN 'ICT_BOARD_USER'
      ELSE NULL
    END AS new_role_code
  FROM public.user_roles AS assignment
  LEFT JOIN primary_scope ON primary_scope.user_id = assignment.user_id
)
UPDATE public.user_roles AS assignment
SET retired_role_code = CASE WHEN role_map.new_role_code IS NULL
    THEN COALESCE(assignment.retired_role_code, role_map.old_role_code)
    WHEN role_map.old_role_code IN ('SuperAdministrator', 'SystemAdministrator', 'SUPER_ADMIN', 'SYSTEM_ADMIN')
      THEN COALESCE(assignment.retired_role_code, role_map.old_role_code)
    ELSE assignment.retired_role_code END,
    role_code = COALESCE(role_map.new_role_code, 'SUPER_SYSTEM_ADMIN'),
    isactive = CASE WHEN role_map.new_role_code IS NULL THEN FALSE ELSE assignment.isactive END,
    issuspended = CASE WHEN role_map.new_role_code IS NULL THEN TRUE ELSE assignment.issuspended END,
    updatedat = clock_timestamp()
FROM role_map
WHERE assignment.id = role_map.id;

UPDATE public.user_roles
SET isactive = COALESCE(isactive, FALSE) AND user_id IS NOT NULL,
    issuspended = COALESCE(issuspended, TRUE) OR user_id IS NULL,
    updatedat = clock_timestamp();

WITH ranked_user_roles AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY user_id
    ORDER BY CASE retired_role_code
      WHEN 'SUPER_ADMIN' THEN 1 WHEN 'SuperAdministrator' THEN 1
      WHEN 'SYSTEM_ADMIN' THEN 2 WHEN 'SystemAdministrator' THEN 2
      ELSE 3 END,
      createdat NULLS LAST, id
  ) AS rank
  FROM public.user_roles
  WHERE isactive IS TRUE AND issuspended IS FALSE
)
UPDATE public.user_roles AS assignment SET isactive = FALSE, issuspended = TRUE, updatedat = clock_timestamp()
FROM ranked_user_roles AS ranked
WHERE assignment.id = ranked.id AND ranked.rank > 1;

WITH ranked_role_slots AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY role_code
    ORDER BY CASE retired_role_code
      WHEN 'SUPER_ADMIN' THEN 1 WHEN 'SuperAdministrator' THEN 1
      WHEN 'SYSTEM_ADMIN' THEN 2 WHEN 'SystemAdministrator' THEN 2
      ELSE 3 END,
      createdat NULLS LAST, user_id, id
  ) AS rank
  FROM public.user_roles
  WHERE isactive IS TRUE AND issuspended IS FALSE
)
UPDATE public.user_roles AS assignment SET isactive = FALSE, issuspended = TRUE, updatedat = clock_timestamp()
FROM ranked_role_slots AS ranked
WHERE assignment.id = ranked.id AND ranked.rank > 1;

ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_code_check CHECK (role_code IN (
  'SUPER_SYSTEM_ADMIN', 'SECRETARIAT_USER', 'MISSION_BOARD_USER',
  'EDUCATION_BOARD_USER', 'HEALTH_BOARD_USER', 'LAND_FINANCE_BOARD_USER',
  'PLANNING_DEVELOPMENT_BOARD_USER', 'ICT_BOARD_USER'
));
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_catalog_fkey;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_catalog_fkey
  FOREIGN KEY (role_code) REFERENCES public.roles(role_code) ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_one_active_slot_per_role
  ON public.user_roles (role_code) WHERE isactive IS TRUE AND issuspended IS FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_one_active_role_per_user
  ON public.user_roles (user_id) WHERE isactive IS TRUE AND issuspended IS FALSE;

WITH ranked_user_scopes AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY user_id, scope_type, scope_id ORDER BY assignmentdate, id
  ) AS rank
  FROM public.user_scopes
)
DELETE FROM public.user_scopes AS scope USING ranked_user_scopes AS ranked
WHERE scope.id = ranked.id AND ranked.rank > 1;
CREATE UNIQUE INDEX IF NOT EXISTS user_scopes_unique_user_scope
  ON public.user_scopes (user_id, scope_type, scope_id);

-- Tie administrative revocation to Supabase Auth's signed session identifier.
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS auth_session_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS user_sessions_auth_session_id_unique
  ON public.user_sessions (auth_session_id);

CREATE OR REPLACE FUNCTION public.sync_designated_user_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
DECLARE
  domain_code TEXT;
  target_domain public.personnel_domains%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles AS other_role
      WHERE other_role.user_id = OLD.user_id AND other_role.id <> NEW.id
        AND other_role.isactive IS TRUE AND other_role.issuspended IS FALSE
    ) THEN
      UPDATE public.user_scopes SET isactive = FALSE, deactivationdate = clock_timestamp(), updatedat = clock_timestamp()
      WHERE user_id = OLD.user_id;
    END IF;
  END IF;

  IF NEW.isactive IS NOT TRUE OR NEW.issuspended IS TRUE THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles AS other_role
      WHERE other_role.user_id = NEW.user_id AND other_role.id <> NEW.id
        AND other_role.isactive IS TRUE AND other_role.issuspended IS FALSE
    ) THEN
      UPDATE public.user_scopes SET isactive = FALSE, deactivationdate = clock_timestamp(), updatedat = clock_timestamp()
      WHERE user_id = NEW.user_id;
    END IF;
    RETURN NEW;
  END IF;

  UPDATE public.user_scopes SET isactive = FALSE, deactivationdate = clock_timestamp(), updatedat = clock_timestamp()
  WHERE user_id = NEW.user_id;

  SELECT scope_code INTO domain_code FROM public.roles WHERE role_code = NEW.role_code;
  IF domain_code IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO target_domain FROM public.personnel_domains
  WHERE code = domain_code AND is_active IS TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The organizational scope for role % is not active.', NEW.role_code USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.user_scopes (
    user_id, scope_id, scope_type, scope_name, purpose,
    isactive, istemporary, assignedby, assignmentdate, createdat, updatedat
  ) VALUES (
    NEW.user_id, target_domain.id, 'PersonnelDomain', target_domain.name,
    'Designated top-level department account', TRUE, FALSE, auth.uid(),
    clock_timestamp(), clock_timestamp(), clock_timestamp()
  )
  ON CONFLICT (user_id, scope_type, scope_id) DO UPDATE SET
    scope_name = EXCLUDED.scope_name,
    purpose = EXCLUDED.purpose,
    isactive = TRUE,
    istemporary = FALSE,
    assignedby = EXCLUDED.assignedby,
    assignmentdate = clock_timestamp(),
    deactivationdate = NULL,
    expiresat = NULL,
    updatedat = clock_timestamp();

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS user_roles_sync_designated_scope ON public.user_roles;
CREATE TRIGGER user_roles_sync_designated_scope
  AFTER INSERT OR UPDATE OF user_id, role_code, isactive, issuspended
  ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.sync_designated_user_scope();

CREATE OR REPLACE FUNCTION public.cleanup_designated_user_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles AS other_role
    WHERE other_role.user_id = OLD.user_id
      AND other_role.isactive IS TRUE AND other_role.issuspended IS FALSE
  ) THEN
    UPDATE public.user_scopes SET isactive = FALSE,
      deactivationdate = clock_timestamp(), updatedat = clock_timestamp()
    WHERE user_id = OLD.user_id;
  END IF;
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS user_roles_cleanup_designated_scope ON public.user_roles;
CREATE TRIGGER user_roles_cleanup_designated_scope
  AFTER DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.cleanup_designated_user_scope();

-- Refresh existing active account scopes through the same lifecycle used by
-- account creation, replacement, suspension and role changes.
UPDATE public.user_roles SET role_code = role_code, updatedat = clock_timestamp();

CREATE OR REPLACE FUNCTION public.current_user_session_is_active()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_sessions AS tracked_session
      WHERE tracked_session.user_id = auth.uid()
        AND tracked_session.auth_session_id = auth.jwt() ->> 'session_id'
        AND tracked_session.isactive IS TRUE
        AND tracked_session.expiresat > statement_timestamp()
  );
$function$;

CREATE OR REPLACE FUNCTION public.has_active_role(allowed_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND public.current_user_session_is_active()
    AND EXISTS (
      SELECT 1 FROM public.user_roles AS assignment
      WHERE assignment.user_id = auth.uid()
        AND assignment.isactive IS TRUE
        AND assignment.issuspended IS FALSE
        AND (assignment.accountexpiry IS NULL OR assignment.accountexpiry > statement_timestamp())
        AND (assignment.lockeduntil IS NULL OR assignment.lockeduntil <= statement_timestamp())
        AND (
          assignment.role_code = ANY (allowed_roles)
          OR (assignment.role_code = 'SUPER_SYSTEM_ADMIN'
            AND allowed_roles && ARRAY[
              'SUPER_ADMIN', 'SYSTEM_ADMIN', 'SuperAdministrator', 'SystemAdministrator'
            ]::TEXT[])
          OR (assignment.role_code = 'SECRETARIAT_USER'
            AND allowed_roles && ARRAY['CentralHR', 'ArchdeaconryAdmin', 'ParishAdmin']::TEXT[])
          OR (assignment.role_code = 'MISSION_BOARD_USER'
            AND allowed_roles && ARRAY['BoardHR', 'InstitutionAdmin']::TEXT[])
          OR (assignment.role_code = 'EDUCATION_BOARD_USER'
            AND allowed_roles && ARRAY['BoardHR', 'InstitutionAdmin']::TEXT[])
          OR (assignment.role_code = 'HEALTH_BOARD_USER'
            AND allowed_roles && ARRAY['BoardHR', 'InstitutionAdmin']::TEXT[])
          OR (assignment.role_code = 'LAND_FINANCE_BOARD_USER'
            AND allowed_roles && ARRAY['BoardHR', 'InstitutionAdmin', 'FinanceOfficer']::TEXT[])
          OR (assignment.role_code = 'PLANNING_DEVELOPMENT_BOARD_USER'
            AND allowed_roles && ARRAY['BoardHR', 'InstitutionAdmin']::TEXT[])
          OR (assignment.role_code = 'ICT_BOARD_USER'
            AND allowed_roles && ARRAY['BoardHR', 'InstitutionAdmin']::TEXT[])
        )
    );
$function$;

CREATE OR REPLACE FUNCTION public.user_has_active_scope(requested_scope_type TEXT, requested_scope_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT auth.uid() IS NOT NULL AND public.current_user_session_is_active()
    AND requested_scope_id IS NOT NULL
    AND (
      public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
      OR EXISTS (
        SELECT 1
        FROM public.user_scopes AS assigned_scope
        JOIN public.personnel_domains AS domain
          ON domain.id = assigned_scope.scope_id
        LEFT JOIN public.departments AS department
          ON requested_scope_type = 'Department' AND department.id = requested_scope_id
        LEFT JOIN public.institutions AS institution
          ON requested_scope_type = 'Institution' AND institution.id = requested_scope_id
        WHERE assigned_scope.user_id = auth.uid()
          AND assigned_scope.scope_type = 'PersonnelDomain'
          AND assigned_scope.isactive IS TRUE
          AND (assigned_scope.expiresat IS NULL OR assigned_scope.expiresat > statement_timestamp())
          AND domain.is_active IS TRUE
          AND (
            (requested_scope_type = 'PersonnelDomain' AND domain.id = requested_scope_id)
            OR (requested_scope_type = 'Board' AND domain.board_id = requested_scope_id)
            OR (requested_scope_type = 'Department' AND (
              (department.board_id IS NOT NULL AND department.board_id = domain.board_id)
              OR (department.board_id IS NULL AND domain.is_secretariat IS TRUE)
            ))
            OR (requested_scope_type = 'Institution' AND (
              (COALESCE(institution.board_id, (SELECT owner_department.board_id FROM public.departments AS owner_department WHERE owner_department.id = institution.department_id)) IS NOT NULL
                AND COALESCE(institution.board_id, (SELECT owner_department.board_id FROM public.departments AS owner_department WHERE owner_department.id = institution.department_id)) = domain.board_id)
              OR (COALESCE(institution.board_id, (SELECT owner_department.board_id FROM public.departments AS owner_department WHERE owner_department.id = institution.department_id)) IS NULL
                AND (institution.archdeaconry_id IS NOT NULL OR institution.parish_id IS NOT NULL)
                AND domain.is_secretariat IS TRUE)
            ))
            OR (requested_scope_type IN ('Archdeaconry', 'Parish', 'LocalChurch') AND domain.is_secretariat IS TRUE)
          )
          AND public.has_active_role(ARRAY[
            CASE domain.code
              WHEN 'SECRETARIAT' THEN 'SECRETARIAT_USER'
              WHEN 'MISSION' THEN 'MISSION_BOARD_USER'
              WHEN 'EDUCATION' THEN 'EDUCATION_BOARD_USER'
              WHEN 'HEALTH' THEN 'HEALTH_BOARD_USER'
              WHEN 'LAND_FINANCE' THEN 'LAND_FINANCE_BOARD_USER'
              WHEN 'PLANNING_DEVELOPMENT' THEN 'PLANNING_DEVELOPMENT_BOARD_USER'
              WHEN 'ICT' THEN 'ICT_BOARD_USER'
            END
          ]::TEXT[])
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.user_has_personnel_domain_scope(target_domain_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT public.user_has_active_scope('PersonnelDomain', target_domain_id);
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_personnel_domain(target_domain_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR public.user_has_personnel_domain_scope(target_domain_id);
$function$;

CREATE OR REPLACE FUNCTION public.user_has_employee_scope(target_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT target_employee_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.assignments AS assignment
    WHERE assignment.employee_id = target_employee_id
      AND assignment.is_primary IS TRUE
      AND assignment.status IN ('Active', 'OnLeave', 'Suspended')
      AND assignment.start_date <= CURRENT_DATE
      AND (assignment.end_date IS NULL OR assignment.end_date >= CURRENT_DATE)
      AND public.can_manage_personnel_domain(assignment.personnel_domain_id)
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_access_employee(target_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR public.user_has_employee_scope(target_employee_id);
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_employee(target_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR EXISTS (
      SELECT 1 FROM public.assignments AS assignment
      WHERE assignment.employee_id = target_employee_id
        AND assignment.is_primary IS TRUE
        AND assignment.status IN ('Active', 'OnLeave', 'Suspended')
        AND assignment.start_date <= CURRENT_DATE
        AND (assignment.end_date IS NULL OR assignment.end_date >= CURRENT_DATE)
        AND public.can_manage_personnel_domain(assignment.personnel_domain_id)
    );
$function$;

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
  IF auth.uid() IS NULL OR NOT public.can_manage_employee(p_employee_id) THEN
    RAISE EXCEPTION 'The employee is outside your personnel scope.' USING ERRCODE = '42501';
  END IF;
  IF p_reported_death_date IS NULL OR p_reported_death_date > statement_timestamp() THEN
    RAISE EXCEPTION 'Reported death date must be present and cannot be in the future' USING ERRCODE = '22023';
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
    WHERE document.id = p_supporting_document_id AND document.employee_id = p_employee_id
      AND public.can_access_document(document.id)
  ) THEN
    RAISE EXCEPTION 'Supporting document is not linked to this employee' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('employee-death:' || p_employee_id::TEXT, 0));
  IF EXISTS (
    SELECT 1 FROM public.employee_death_records AS existing_report
    WHERE existing_report.employee_id = p_employee_id
      AND existing_report.verification_status IN ('Pending', 'FirstVerification', 'SecondVerification')
  ) THEN
    RAISE EXCEPTION 'An active death report already exists for this employee' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.employee_death_records (
    employee_id, reported_death_date, place_of_death, cause_of_death,
    death_certificate_reference, supporting_document_id, reporter_id,
    verification_status, reversal_status
  ) VALUES (
    p_employee_id, p_reported_death_date, NULLIF(btrim(p_place_of_death), ''),
    NULLIF(btrim(p_cause_of_death), ''), NULLIF(btrim(p_death_certificate_reference), ''),
    p_supporting_document_id, auth.uid(), 'Pending', 'None'
  ) RETURNING id INTO new_record_id;
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
  IF actor_user_id IS NULL OR actor_employee_id IS NULL THEN
    RAISE EXCEPTION 'A designated user linked to an employee record is required to verify a death report.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO report FROM public.employee_death_records WHERE id = p_record_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Death report not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.can_manage_employee(report.employee_id) THEN
    RAISE EXCEPTION 'The employee is outside your personnel scope.' USING ERRCODE = '42501';
  END IF;
  IF actor_user_id = report.reporter_id OR actor_employee_id = report.employee_id THEN
    RAISE EXCEPTION 'The reporter or subject cannot verify this report' USING ERRCODE = '42501';
  END IF;

  IF report.verification_status = 'Pending' THEN
    UPDATE public.employee_death_records SET verification_status = 'FirstVerification',
      first_verifier_id = actor_employee_id, first_verifier_user_id = actor_user_id,
      first_verification_date = clock_timestamp() WHERE id = p_record_id;
    RETURN 'FirstVerification';
  ELSIF report.verification_status = 'FirstVerification' THEN
    IF report.first_verifier_user_id = actor_user_id OR report.first_verifier_id = actor_employee_id THEN
      RAISE EXCEPTION 'A different person must perform the second verification' USING ERRCODE = '42501';
    END IF;
    UPDATE public.employee_death_records SET verification_status = 'SecondVerification',
      second_verifier_id = actor_employee_id, second_verifier_user_id = actor_user_id,
      second_verification_date = clock_timestamp() WHERE id = p_record_id;
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
  IF actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;
  IF p_confirmed_death_date IS NULL OR p_confirmed_death_date > statement_timestamp() THEN
    RAISE EXCEPTION 'Confirmed death date must be present and cannot be in the future' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO report FROM public.employee_death_records WHERE id = p_record_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Death report not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.can_manage_employee(report.employee_id) THEN
    RAISE EXCEPTION 'The employee is outside your personnel scope.' USING ERRCODE = '42501';
  END IF;
  IF report.verification_status <> 'SecondVerification'
     OR report.reporter_id = actor_user_id
     OR report.first_verifier_user_id = actor_user_id
     OR report.second_verifier_user_id = actor_user_id THEN
    RAISE EXCEPTION 'Approval requires two independent verifications by other users' USING ERRCODE = '42501';
  END IF;

  UPDATE public.employee_death_records SET verification_status = 'Passed',
    confirmed_death_date = p_confirmed_death_date, approved_by = actor_user_id,
    approval_date = clock_timestamp(), approving_authority = actor_user_id::TEXT
  WHERE id = p_record_id;
  UPDATE public.employees SET life_status = 'Deceased', date_of_death = p_confirmed_death_date,
    employment_status = CASE WHEN employment_status IN ('Active', 'OnLeave', 'Suspended')
      THEN 'DeceasedActive' ELSE employment_status END,
    "updatedAt" = clock_timestamp()
  WHERE id = report.employee_id;
  RETURN report.employee_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.can_access_confidential_employee(target_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR public.can_manage_employee(target_employee_id);
$function$;

CREATE OR REPLACE FUNCTION public.can_access_confidential_personnel()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[]);
$function$;

CREATE OR REPLACE FUNCTION public.can_access_finance_employee(target_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR (public.has_active_role(ARRAY['LAND_FINANCE_BOARD_USER']::TEXT[])
      AND public.can_access_employee(target_employee_id));
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_finance_employee(target_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR (public.has_active_role(ARRAY['LAND_FINANCE_BOARD_USER']::TEXT[])
      AND public.can_manage_employee(target_employee_id));
$function$;

ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS personnel_domain_id UUID
  REFERENCES public.personnel_domains(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.can_access_employee_placement(
  target_employee_id UUID, target_domain_id UUID, target_board_id UUID,
  target_archdeaconry_id UUID, target_parish_id UUID, target_institution_id UUID,
  target_department_id UUID
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR public.user_has_active_scope('PersonnelDomain', target_domain_id)
    OR (target_domain_id IS NULL AND target_board_id IS NULL
      AND public.user_has_active_scope('Archdeaconry', target_archdeaconry_id))
    OR (target_domain_id IS NULL AND target_board_id IS NULL
      AND target_archdeaconry_id IS NULL
      AND public.user_has_active_scope('Parish', target_parish_id))
    OR (target_domain_id IS NULL AND target_board_id IS NULL
      AND target_archdeaconry_id IS NULL AND target_parish_id IS NULL
      AND public.user_has_active_scope('Department', target_department_id))
    OR (target_domain_id IS NULL AND target_board_id IS NULL
      AND public.user_has_active_scope('Institution', target_institution_id));
$function$;

CREATE OR REPLACE FUNCTION public.can_access_document(target_document_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.documents AS document
    WHERE document.id = target_document_id
      AND (
        public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
        OR (document.employee_id IS NOT NULL AND public.can_access_employee(document.employee_id))
        OR (document.personnel_domain_id IS NOT NULL
          AND public.user_has_active_scope('PersonnelDomain', document.personnel_domain_id))
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_document(target_document_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.documents AS document
    WHERE document.id = target_document_id
      AND (
        public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
        OR (document.employee_id IS NOT NULL AND public.can_manage_employee(document.employee_id))
        OR (document.personnel_domain_id IS NOT NULL
          AND public.can_manage_personnel_domain(document.personnel_domain_id))
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_access_vacancy(target_vacancy_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.vacancies AS vacancy
    WHERE vacancy.id = target_vacancy_id
      AND public.can_manage_personnel_domain(vacancy.personnel_domain_id)
  );
$function$;

-- Department dashboards use server-side counts so changing client filters or
-- resource identifiers cannot expose another personnel domain's totals.
CREATE OR REPLACE FUNCTION public.count_personnel_domain_records(
  target_domain_id UUID,
  resource_code TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
DECLARE
  domain_row public.personnel_domains%ROWTYPE;
  total BIGINT;
BEGIN
  IF NOT public.can_manage_personnel_domain(target_domain_id) THEN
    RAISE EXCEPTION 'The requested personnel domain is outside your authorization.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO domain_row FROM public.personnel_domains
  WHERE id = target_domain_id AND is_active IS TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The personnel domain is not active.' USING ERRCODE = '22023';
  END IF;

  CASE resource_code
    WHEN 'employees' THEN
      SELECT COUNT(DISTINCT employee.id) INTO total
      FROM public.employees AS employee
      JOIN public.assignments AS assignment ON assignment.employee_id = employee.id
      WHERE assignment.personnel_domain_id = target_domain_id
        AND assignment.is_primary IS TRUE
        AND assignment.status IN ('Active', 'OnLeave', 'Suspended')
        AND assignment.start_date <= CURRENT_DATE
        AND (assignment.end_date IS NULL OR assignment.end_date >= CURRENT_DATE);
    WHEN 'clergy' THEN
      SELECT COUNT(DISTINCT employee.id) INTO total
      FROM public.employees AS employee
      JOIN public.assignments AS assignment ON assignment.employee_id = employee.id
      WHERE assignment.personnel_domain_id = target_domain_id
        AND assignment.is_primary IS TRUE AND employee.employee_category = 'Clergy'
        AND assignment.status IN ('Active', 'OnLeave', 'Suspended')
        AND assignment.start_date <= CURRENT_DATE
        AND (assignment.end_date IS NULL OR assignment.end_date >= CURRENT_DATE);
    WHEN 'catechists' THEN
      SELECT COUNT(DISTINCT employee.id) INTO total
      FROM public.employees AS employee
      JOIN public.assignments AS assignment ON assignment.employee_id = employee.id
      WHERE assignment.personnel_domain_id = target_domain_id
        AND assignment.is_primary IS TRUE AND employee.employee_category = 'Catechist'
        AND assignment.status IN ('Active', 'OnLeave', 'Suspended')
        AND assignment.start_date <= CURRENT_DATE
        AND (assignment.end_date IS NULL OR assignment.end_date >= CURRENT_DATE);
    WHEN 'assignments' THEN
      SELECT COUNT(*) INTO total FROM public.assignments AS assignment
      WHERE assignment.personnel_domain_id = target_domain_id
        AND assignment.is_primary IS TRUE
        AND assignment.status IN ('Active', 'OnLeave', 'Suspended')
        AND assignment.start_date <= CURRENT_DATE
        AND (assignment.end_date IS NULL OR assignment.end_date >= CURRENT_DATE);
    WHEN 'vacancies' THEN
      SELECT COUNT(*) INTO total FROM public.vacancies
      WHERE personnel_domain_id = target_domain_id AND status = 'Open';
    WHEN 'applicants' THEN
      SELECT COUNT(*) INTO total FROM public.applicants AS applicant
      JOIN public.vacancies AS vacancy ON vacancy.id = applicant.vacancy_id
      WHERE vacancy.personnel_domain_id = target_domain_id;
    WHEN 'leave_records' THEN
      SELECT COUNT(DISTINCT leave_record.id) INTO total
      FROM public.leave_records AS leave_record
      WHERE EXISTS (
        SELECT 1 FROM public.assignments AS assignment
        WHERE assignment.employee_id = leave_record.employee_id
          AND assignment.personnel_domain_id = target_domain_id
          AND assignment.is_primary IS TRUE
          AND assignment.status IN ('Active', 'OnLeave', 'Suspended')
          AND assignment.start_date <= CURRENT_DATE
          AND (assignment.end_date IS NULL OR assignment.end_date >= CURRENT_DATE)
      );
    WHEN 'training_records' THEN
      SELECT COUNT(DISTINCT training.id) INTO total
      FROM public.training_records AS training
      WHERE EXISTS (
        SELECT 1 FROM public.assignments AS assignment
        WHERE assignment.employee_id = training.employee_id
          AND assignment.personnel_domain_id = target_domain_id
          AND assignment.is_primary IS TRUE
          AND assignment.status IN ('Active', 'OnLeave', 'Suspended')
          AND assignment.start_date <= CURRENT_DATE
          AND (assignment.end_date IS NULL OR assignment.end_date >= CURRENT_DATE)
      );
    WHEN 'qualifications' THEN
      SELECT COUNT(DISTINCT qualification.id) INTO total
      FROM public.qualifications AS qualification
      WHERE EXISTS (
        SELECT 1 FROM public.assignments AS assignment
        WHERE assignment.employee_id = qualification.employee_id
          AND assignment.personnel_domain_id = target_domain_id
          AND assignment.is_primary IS TRUE
          AND assignment.status IN ('Active', 'OnLeave', 'Suspended')
          AND assignment.start_date <= CURRENT_DATE
          AND (assignment.end_date IS NULL OR assignment.end_date >= CURRENT_DATE)
      );
    WHEN 'performance_appraisals' THEN
      SELECT COUNT(DISTINCT appraisal.id) INTO total
      FROM public.performance_appraisals AS appraisal
      WHERE EXISTS (
        SELECT 1 FROM public.assignments AS assignment
        WHERE assignment.employee_id = appraisal.employee_id
          AND assignment.personnel_domain_id = target_domain_id
          AND assignment.is_primary IS TRUE
          AND assignment.status IN ('Active', 'OnLeave', 'Suspended')
          AND assignment.start_date <= CURRENT_DATE
          AND (assignment.end_date IS NULL OR assignment.end_date >= CURRENT_DATE)
      );
    WHEN 'employee_transfers' THEN
      SELECT COUNT(*) INTO total FROM public.employee_transfers AS transfer_record
      WHERE transfer_record.previous_domain_id = target_domain_id
         OR transfer_record.new_domain_id = target_domain_id;
    WHEN 'retirements' THEN
      SELECT COUNT(DISTINCT retirement.id) INTO total
      FROM public.retirements AS retirement
      WHERE EXISTS (
        SELECT 1 FROM public.assignments AS assignment
        WHERE assignment.employee_id = retirement.employee_id
          AND assignment.personnel_domain_id = target_domain_id
          AND assignment.is_primary IS TRUE
          AND assignment.status IN ('Active', 'OnLeave', 'Suspended', 'Completed', 'Terminated')
          AND assignment.start_date <= CURRENT_DATE
          AND (assignment.end_date IS NULL OR assignment.end_date >= CURRENT_DATE)
      );
    WHEN 'early_retirement_applications' THEN
      SELECT COUNT(DISTINCT application.id) INTO total
      FROM public.early_retirement_applications AS application
      WHERE EXISTS (
        SELECT 1 FROM public.assignments AS assignment
        WHERE assignment.employee_id = application.employee_id
          AND assignment.personnel_domain_id = target_domain_id
          AND assignment.is_primary IS TRUE
          AND assignment.status IN ('Active', 'OnLeave', 'Suspended')
          AND assignment.start_date <= CURRENT_DATE
          AND (assignment.end_date IS NULL OR assignment.end_date >= CURRENT_DATE)
      );
    WHEN 'institutions' THEN
      SELECT COUNT(*) INTO total FROM public.institutions
      WHERE board_id = domain_row.board_id AND isactive IS TRUE;
    WHEN 'professional_licences' THEN
      SELECT COUNT(DISTINCT licence.id) INTO total
      FROM public.professional_licences AS licence
      WHERE EXISTS (
        SELECT 1 FROM public.assignments AS assignment
        WHERE assignment.employee_id = licence.employee_id
          AND assignment.personnel_domain_id = target_domain_id
          AND assignment.is_primary IS TRUE
          AND assignment.status IN ('Active', 'OnLeave', 'Suspended')
          AND assignment.start_date <= CURRENT_DATE
          AND (assignment.end_date IS NULL OR assignment.end_date >= CURRENT_DATE)
      );
    ELSE
      RAISE EXCEPTION 'This metric is not available for personnel-domain reporting.' USING ERRCODE = '22023';
  END CASE;
  RETURN COALESCE(total, 0);
END;
$function$;

CREATE OR REPLACE VIEW public.personnel_domain_employees
WITH (security_invoker = TRUE)
AS
SELECT DISTINCT ON (employee.id, assignment.personnel_domain_id)
  employee.id, employee.employee_id, employee.employee_number, employee.title,
  employee.first_name, employee.middle_name, employee.last_name, employee.gender,
  employee.email, employee.telephone, employee.employee_category, employee.employment_status,
  assignment.personnel_domain_id
FROM public.employees AS employee
JOIN public.assignments AS assignment ON assignment.employee_id = employee.id
WHERE assignment.is_primary IS TRUE
  AND assignment.status IN ('Active', 'OnLeave', 'Suspended')
  AND assignment.start_date <= CURRENT_DATE
  AND (assignment.end_date IS NULL OR assignment.end_date >= CURRENT_DATE)
ORDER BY employee.id, assignment.personnel_domain_id, assignment.start_date DESC;

-- Departmental documents follow their employee or explicit personnel domain.
CREATE INDEX IF NOT EXISTS idx_documents_personnel_domain
  ON public.documents (personnel_domain_id, employee_id);
UPDATE public.documents AS document SET personnel_domain_id = assignment.personnel_domain_id
FROM public.assignments AS assignment
WHERE document.employee_id = assignment.employee_id
  AND assignment.is_primary IS TRUE
  AND assignment.status IN ('Active', 'OnLeave', 'Suspended')
  AND document.personnel_domain_id IS NULL;

-- Replace permissive legacy directory policies as a set so their OR behavior
-- cannot grant broader access than the canonical organizational scopes.
DO $directory_policies$
DECLARE policy_row RECORD;
BEGIN
  FOR policy_row IN SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'dioceses', 'boards', 'departments', 'institutions', 'archdeaconries',
        'parishes', 'local_churches', 'grades', 'positions'
      )
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', policy_row.policyname, policy_row.tablename);
  END LOOP;
END;
$directory_policies$;

CREATE POLICY dioceses_read_authorized ON public.dioceses FOR SELECT TO authenticated
  USING (public.has_active_role(ARRAY[
    'SUPER_SYSTEM_ADMIN', 'SECRETARIAT_USER', 'MISSION_BOARD_USER',
    'EDUCATION_BOARD_USER', 'HEALTH_BOARD_USER', 'LAND_FINANCE_BOARD_USER',
    'PLANNING_DEVELOPMENT_BOARD_USER', 'ICT_BOARD_USER'
  ]::TEXT[]));
CREATE POLICY dioceses_manage_super_admin ON public.dioceses FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[]))
  WITH CHECK (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[]));

CREATE POLICY boards_read_scoped ON public.boards FOR SELECT TO authenticated
  USING (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR public.user_has_active_scope('Board', id));
CREATE POLICY boards_manage_super_admin ON public.boards FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[]))
  WITH CHECK (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[]));

CREATE POLICY departments_read_scoped ON public.departments FOR SELECT TO authenticated
  USING (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR public.user_has_active_scope('Department', id));
CREATE POLICY departments_manage_scoped ON public.departments FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR (board_id IS NOT NULL AND public.user_has_active_scope('Board', board_id))
    OR (board_id IS NULL AND public.user_has_personnel_domain_scope(
      (SELECT domain.id FROM public.personnel_domains AS domain WHERE domain.is_secretariat IS TRUE))))
  WITH CHECK (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR (board_id IS NOT NULL AND public.user_has_active_scope('Board', board_id))
    OR (board_id IS NULL AND public.user_has_personnel_domain_scope(
      (SELECT domain.id FROM public.personnel_domains AS domain WHERE domain.is_secretariat IS TRUE))));

CREATE POLICY institutions_read_scoped ON public.institutions FOR SELECT TO authenticated
  USING (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR public.user_has_active_scope('Institution', id)
    OR public.user_has_active_scope('Department', department_id)
    OR public.user_has_active_scope('Board', board_id));
CREATE POLICY institutions_manage_scoped ON public.institutions FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR public.user_has_active_scope('Institution', id)
    OR public.user_has_active_scope('Department', department_id)
    OR public.user_has_active_scope('Board', board_id))
  WITH CHECK (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR (board_id IS NOT NULL AND public.user_has_active_scope('Board', board_id))
    OR (department_id IS NOT NULL AND public.user_has_active_scope('Department', department_id))
    OR ((board_id IS NULL AND department_id IS NULL)
      AND (archdeaconry_id IS NOT NULL OR parish_id IS NOT NULL)
      AND public.user_has_personnel_domain_scope(
        (SELECT domain.id FROM public.personnel_domains AS domain WHERE domain.is_secretariat IS TRUE))));

CREATE POLICY archdeaconries_read_scoped ON public.archdeaconries FOR SELECT TO authenticated
  USING (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR public.user_has_active_scope('Archdeaconry', id));
CREATE POLICY archdeaconries_manage_scoped ON public.archdeaconries FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR public.user_has_personnel_domain_scope(
      (SELECT domain.id FROM public.personnel_domains AS domain WHERE domain.is_secretariat IS TRUE)))
  WITH CHECK (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR public.user_has_personnel_domain_scope(
      (SELECT domain.id FROM public.personnel_domains AS domain WHERE domain.is_secretariat IS TRUE)));

CREATE POLICY parishes_read_scoped ON public.parishes FOR SELECT TO authenticated
  USING (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR public.user_has_active_scope('Parish', id));
CREATE POLICY parishes_manage_scoped ON public.parishes FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR public.user_has_personnel_domain_scope(
      (SELECT domain.id FROM public.personnel_domains AS domain WHERE domain.is_secretariat IS TRUE)))
  WITH CHECK (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR public.user_has_personnel_domain_scope(
      (SELECT domain.id FROM public.personnel_domains AS domain WHERE domain.is_secretariat IS TRUE)));

CREATE POLICY local_churches_read_scoped ON public.local_churches FOR SELECT TO authenticated
  USING (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR public.user_has_active_scope('LocalChurch', id));
CREATE POLICY local_churches_manage_scoped ON public.local_churches FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR public.user_has_personnel_domain_scope(
      (SELECT domain.id FROM public.personnel_domains AS domain WHERE domain.is_secretariat IS TRUE)))
  WITH CHECK (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR public.user_has_personnel_domain_scope(
      (SELECT domain.id FROM public.personnel_domains AS domain WHERE domain.is_secretariat IS TRUE)));

CREATE POLICY grades_read_scoped ON public.grades FOR SELECT TO authenticated
  USING (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR public.user_has_active_scope('Department', department_id)
    OR public.user_has_active_scope('Board', board_id));
CREATE POLICY grades_manage_scoped ON public.grades FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR public.user_has_active_scope('Department', department_id)
    OR public.user_has_active_scope('Board', board_id))
  WITH CHECK (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR public.user_has_active_scope('Department', department_id)
    OR public.user_has_active_scope('Board', board_id));

CREATE POLICY positions_read_scoped ON public.positions FOR SELECT TO authenticated
  USING (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR public.user_has_active_scope('Department', department_id)
    OR public.user_has_active_scope('Board', board_id));
CREATE POLICY positions_manage_scoped ON public.positions FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR public.user_has_active_scope('Department', department_id)
    OR public.user_has_active_scope('Board', board_id))
  WITH CHECK (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR public.user_has_active_scope('Department', department_id)
    OR public.user_has_active_scope('Board', board_id));

DROP POLICY IF EXISTS personnel_domains_read_authorized ON public.personnel_domains;
CREATE POLICY personnel_domains_read_authorized ON public.personnel_domains
  FOR SELECT TO authenticated
  USING (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR public.user_has_active_scope('PersonnelDomain', id));

DROP POLICY IF EXISTS employees_read_scoped ON public.employees;
DROP POLICY IF EXISTS employees_insert_scoped ON public.employees;
DROP POLICY IF EXISTS employees_update_scoped ON public.employees;
CREATE POLICY employees_read_scoped ON public.employees FOR SELECT TO authenticated
  USING (public.can_access_employee(id));
CREATE POLICY employees_insert_scoped ON public.employees FOR INSERT TO authenticated
  WITH CHECK (FALSE);
CREATE POLICY employees_update_scoped ON public.employees FOR UPDATE TO authenticated
  USING (public.can_manage_employee(id)) WITH CHECK (public.can_manage_employee(id));

DROP POLICY IF EXISTS assignments_read_scoped ON public.assignments;
DROP POLICY IF EXISTS assignments_insert_scoped ON public.assignments;
DROP POLICY IF EXISTS assignments_update_scoped ON public.assignments;
CREATE POLICY assignments_read_scoped ON public.assignments FOR SELECT TO authenticated
  USING (start_date <= CURRENT_DATE
    AND public.can_access_employee_placement(employee_id, personnel_domain_id, board_id,
    archdeaconry_id, parish_id, institution_id, department_id));
CREATE POLICY assignments_insert_scoped ON public.assignments FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_employee(employee_id)
    AND public.can_manage_personnel_domain(personnel_domain_id));
CREATE POLICY assignments_update_scoped ON public.assignments FOR UPDATE TO authenticated
  USING (public.can_access_employee_placement(employee_id, personnel_domain_id, board_id,
    archdeaconry_id, parish_id, institution_id, department_id))
  WITH CHECK (public.can_manage_employee(employee_id)
    AND public.can_manage_personnel_domain(personnel_domain_id));

DROP POLICY IF EXISTS employee_roles_read_scoped ON public.employee_roles;
DROP POLICY IF EXISTS employee_roles_insert_scoped ON public.employee_roles;
DROP POLICY IF EXISTS employee_roles_update_scoped ON public.employee_roles;
CREATE POLICY employee_roles_read_scoped ON public.employee_roles FOR SELECT TO authenticated
  USING (start_date <= CURRENT_DATE
    AND public.can_access_employee_placement(employee_id, personnel_domain_id, board_id,
    archdeaconry_id, parish_id, institution_id, department_id));
CREATE POLICY employee_roles_insert_scoped ON public.employee_roles FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_employee(employee_id)
    AND public.can_manage_personnel_domain(personnel_domain_id));
CREATE POLICY employee_roles_update_scoped ON public.employee_roles FOR UPDATE TO authenticated
  USING (public.can_access_employee_placement(employee_id, personnel_domain_id, board_id,
    archdeaconry_id, parish_id, institution_id, department_id))
  WITH CHECK (public.can_manage_employee(employee_id)
    AND public.can_manage_personnel_domain(personnel_domain_id));

DROP POLICY IF EXISTS vacancies_read_authorized ON public.vacancies;
DROP POLICY IF EXISTS vacancies_insert_authorized ON public.vacancies;
DROP POLICY IF EXISTS vacancies_update_authorized ON public.vacancies;
CREATE POLICY vacancies_read_authorized ON public.vacancies FOR SELECT TO authenticated
  USING (public.can_manage_personnel_domain(personnel_domain_id));
CREATE POLICY vacancies_insert_authorized ON public.vacancies FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_personnel_domain(personnel_domain_id));
CREATE POLICY vacancies_update_authorized ON public.vacancies FOR UPDATE TO authenticated
  USING (public.can_manage_personnel_domain(personnel_domain_id))
  WITH CHECK (public.can_manage_personnel_domain(personnel_domain_id));

DROP POLICY IF EXISTS applicants_read_authorized ON public.applicants;
DROP POLICY IF EXISTS applicants_insert_authorized ON public.applicants;
DROP POLICY IF EXISTS applicants_update_authorized ON public.applicants;
CREATE POLICY applicants_read_authorized ON public.applicants FOR SELECT TO authenticated
  USING (vacancy_id IS NOT NULL AND public.can_access_vacancy(vacancy_id));
CREATE POLICY applicants_insert_authorized ON public.applicants FOR INSERT TO authenticated
  WITH CHECK (vacancy_id IS NOT NULL AND public.can_access_vacancy(vacancy_id));
CREATE POLICY applicants_update_authorized ON public.applicants FOR UPDATE TO authenticated
  USING (vacancy_id IS NOT NULL AND public.can_access_vacancy(vacancy_id))
  WITH CHECK (vacancy_id IS NOT NULL AND public.can_access_vacancy(vacancy_id));

DROP POLICY IF EXISTS recruitment_applications_read_authorized ON public.recruitment_applications;
DROP POLICY IF EXISTS recruitment_applications_insert_authorized ON public.recruitment_applications;
DROP POLICY IF EXISTS recruitment_applications_update_authorized ON public.recruitment_applications;
CREATE POLICY recruitment_applications_read_authorized ON public.recruitment_applications FOR SELECT TO authenticated
  USING (public.can_access_vacancy(vacancy_id));
CREATE POLICY recruitment_applications_insert_authorized ON public.recruitment_applications FOR INSERT TO authenticated
  WITH CHECK (public.can_access_vacancy(vacancy_id));
CREATE POLICY recruitment_applications_update_authorized ON public.recruitment_applications FOR UPDATE TO authenticated
  USING (public.can_access_vacancy(vacancy_id)) WITH CHECK (public.can_access_vacancy(vacancy_id));

-- Retirement case management is part of each department's personnel work;
-- pension, payroll and benefits remain restricted to Land & Finance.
DROP POLICY IF EXISTS finance_records_read_scoped ON public.retirements;
DROP POLICY IF EXISTS finance_records_insert_scoped ON public.retirements;
DROP POLICY IF EXISTS finance_records_update_scoped ON public.retirements;
DROP POLICY IF EXISTS retirements_read_scoped ON public.retirements;
DROP POLICY IF EXISTS retirements_insert_scoped ON public.retirements;
DROP POLICY IF EXISTS retirements_update_scoped ON public.retirements;
CREATE POLICY retirements_read_scoped ON public.retirements FOR SELECT TO authenticated
  USING (public.can_access_employee(employee_id));
CREATE POLICY retirements_insert_scoped ON public.retirements FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_employee(employee_id));
CREATE POLICY retirements_update_scoped ON public.retirements FOR UPDATE TO authenticated
  USING (public.can_manage_employee(employee_id))
  WITH CHECK (public.can_manage_employee(employee_id));

DROP POLICY IF EXISTS documents_read_scoped ON public.documents;
DROP POLICY IF EXISTS documents_insert_authorized ON public.documents;
DROP POLICY IF EXISTS documents_update_authorized ON public.documents;
CREATE POLICY documents_read_scoped ON public.documents FOR SELECT TO authenticated
  USING (public.can_access_document(id));
CREATE POLICY documents_insert_authorized ON public.documents FOR INSERT TO authenticated
  WITH CHECK (
    public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR (employee_id IS NOT NULL AND public.can_manage_employee(employee_id))
    OR (employee_id IS NULL AND public.can_manage_personnel_domain(personnel_domain_id))
  );
CREATE POLICY documents_update_authorized ON public.documents FOR UPDATE TO authenticated
  USING (public.can_access_document(id))
  WITH CHECK (
    public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[])
    OR (employee_id IS NOT NULL AND public.can_manage_employee(employee_id))
    OR (employee_id IS NULL AND public.can_manage_personnel_domain(personnel_domain_id))
  );

DROP POLICY IF EXISTS stored_files_read_authorized ON public.stored_files;
DROP POLICY IF EXISTS stored_files_insert_authorized ON public.stored_files;
DROP POLICY IF EXISTS stored_files_update_authorized ON public.stored_files;
CREATE POLICY stored_files_read_authorized ON public.stored_files FOR SELECT TO authenticated
  USING (public.can_access_document(document_id));
CREATE POLICY stored_files_insert_authorized ON public.stored_files FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_document(document_id));
CREATE POLICY stored_files_update_authorized ON public.stored_files FOR UPDATE TO authenticated
  USING (public.can_manage_document(document_id)) WITH CHECK (public.can_manage_document(document_id));

-- Storage objects use the document identifier in the second path component.
DROP POLICY IF EXISTS hr_documents_storage_read ON storage.objects;
DROP POLICY IF EXISTS hr_documents_storage_insert ON storage.objects;
DROP POLICY IF EXISTS hr_documents_storage_update ON storage.objects;
DROP POLICY IF EXISTS hr_documents_storage_delete ON storage.objects;
CREATE POLICY hr_documents_storage_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'hr-documents' AND public.can_access_document(
    CASE WHEN split_part(name, '/', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN split_part(name, '/', 2)::UUID ELSE NULL END));
CREATE POLICY hr_documents_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'hr-documents' AND public.can_manage_document(
    CASE WHEN split_part(name, '/', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN split_part(name, '/', 2)::UUID ELSE NULL END));
CREATE POLICY hr_documents_storage_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'hr-documents' AND public.can_manage_document(
    CASE WHEN split_part(name, '/', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN split_part(name, '/', 2)::UUID ELSE NULL END))
  WITH CHECK (bucket_id = 'hr-documents' AND public.can_manage_document(
    CASE WHEN split_part(name, '/', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN split_part(name, '/', 2)::UUID ELSE NULL END));
CREATE POLICY hr_documents_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'hr-documents' AND public.can_manage_document(
    CASE WHEN split_part(name, '/', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN split_part(name, '/', 2)::UUID ELSE NULL END));

-- User access and assigned scopes are administered only by the platform admin;
-- account holders can read their own role and scope rows for session loading.
DROP POLICY IF EXISTS user_roles_manage_admin ON public.user_roles;
DROP POLICY IF EXISTS user_roles_read_own_or_admin ON public.user_roles;
CREATE POLICY user_roles_read_own_or_admin ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[]));
CREATE POLICY user_roles_manage_admin ON public.user_roles FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[]))
  WITH CHECK (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[]));
DROP POLICY IF EXISTS user_scopes_manage_admin ON public.user_scopes;
DROP POLICY IF EXISTS user_scopes_read_own_or_admin ON public.user_scopes;
CREATE POLICY user_scopes_read_own_or_admin ON public.user_scopes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[]));
CREATE POLICY user_scopes_manage_admin ON public.user_scopes FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[]))
  WITH CHECK (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[]));

DROP POLICY IF EXISTS user_sessions_self_track_insert ON public.user_sessions;
CREATE POLICY user_sessions_self_track_insert ON public.user_sessions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND auth_session_id = auth.jwt() ->> 'session_id'
    AND isactive IS TRUE
    AND expiresat > statement_timestamp()
    AND expiresat <= to_timestamp((auth.jwt() ->> 'exp')::DOUBLE PRECISION)
  );
DROP POLICY IF EXISTS user_sessions_self_track_update ON public.user_sessions;
CREATE POLICY user_sessions_self_track_update ON public.user_sessions FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND auth_session_id = auth.jwt() ->> 'session_id' AND isactive IS TRUE)
  WITH CHECK (
    user_id = auth.uid()
    AND auth_session_id = auth.jwt() ->> 'session_id'
    AND isactive IS TRUE
    AND expiresat > statement_timestamp()
    AND expiresat <= to_timestamp((auth.jwt() ->> 'exp')::DOUBLE PRECISION)
  );
DROP POLICY IF EXISTS user_sessions_self_revoke ON public.user_sessions;
CREATE POLICY user_sessions_self_revoke ON public.user_sessions FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND auth_session_id = auth.jwt() ->> 'session_id' AND isactive IS TRUE)
  WITH CHECK (user_id = auth.uid() AND auth_session_id = auth.jwt() ->> 'session_id' AND isactive IS FALSE);

-- The platform administrator retains both system monitoring and full audit
-- oversight permissions.
DO $policies$
DECLARE policy_row RECORD;
BEGIN
  FOR policy_row IN SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('security_event', 'audit_log', 'sensitive_read_log')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', policy_row.policyname, policy_row.tablename);
  END LOOP;
END;
$policies$;

CREATE POLICY security_event_read_technical ON public.security_event FOR SELECT TO authenticated
  USING (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[]));
CREATE POLICY security_event_insert_own ON public.security_event FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.has_active_role(ARRAY[
    'SUPER_SYSTEM_ADMIN', 'SECRETARIAT_USER', 'MISSION_BOARD_USER',
    'EDUCATION_BOARD_USER', 'HEALTH_BOARD_USER', 'LAND_FINANCE_BOARD_USER',
    'PLANNING_DEVELOPMENT_BOARD_USER', 'ICT_BOARD_USER'
  ]::TEXT[]));
CREATE POLICY security_event_update_technical ON public.security_event FOR UPDATE TO authenticated
  USING (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[]))
  WITH CHECK (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[]));
CREATE POLICY audit_log_read_platform_admin ON public.audit_log FOR SELECT TO authenticated
  USING (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[]));
CREATE POLICY sensitive_read_log_read_platform_admin ON public.sensitive_read_log FOR SELECT TO authenticated
  USING (public.has_active_role(ARRAY['SUPER_SYSTEM_ADMIN']::TEXT[]));
CREATE POLICY sensitive_read_log_insert_own ON public.sensitive_read_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.has_active_role(ARRAY[
    'SUPER_SYSTEM_ADMIN', 'SECRETARIAT_USER', 'MISSION_BOARD_USER',
    'EDUCATION_BOARD_USER', 'HEALTH_BOARD_USER', 'LAND_FINANCE_BOARD_USER',
    'PLANNING_DEVELOPMENT_BOARD_USER', 'ICT_BOARD_USER'
  ]::TEXT[]));

DROP POLICY IF EXISTS user_notifications_read_own ON public.user_notifications;
DROP POLICY IF EXISTS user_notifications_mark_read_own ON public.user_notifications;
CREATE POLICY user_notifications_read_own ON public.user_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.current_user_session_is_active()
    AND public.has_active_role(ARRAY[
      'SUPER_SYSTEM_ADMIN', 'SECRETARIAT_USER', 'MISSION_BOARD_USER',
      'EDUCATION_BOARD_USER', 'HEALTH_BOARD_USER', 'LAND_FINANCE_BOARD_USER',
      'PLANNING_DEVELOPMENT_BOARD_USER', 'ICT_BOARD_USER'
    ]::TEXT[]));
CREATE POLICY user_notifications_mark_read_own ON public.user_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.current_user_session_is_active()
    AND public.has_active_role(ARRAY[
      'SUPER_SYSTEM_ADMIN', 'SECRETARIAT_USER', 'MISSION_BOARD_USER',
      'EDUCATION_BOARD_USER', 'HEALTH_BOARD_USER', 'LAND_FINANCE_BOARD_USER',
      'PLANNING_DEVELOPMENT_BOARD_USER', 'ICT_BOARD_USER'
    ]::TEXT[]))
  WITH CHECK (user_id = auth.uid() AND public.current_user_session_is_active()
    AND public.has_active_role(ARRAY[
      'SUPER_SYSTEM_ADMIN', 'SECRETARIAT_USER', 'MISSION_BOARD_USER',
      'EDUCATION_BOARD_USER', 'HEALTH_BOARD_USER', 'LAND_FINANCE_BOARD_USER',
      'PLANNING_DEVELOPMENT_BOARD_USER', 'ICT_BOARD_USER'
    ]::TEXT[]));

REVOKE ALL ON FUNCTION public.sync_designated_user_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_designated_user_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_user_session_is_active() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_active_role(TEXT[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_has_active_scope(TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_has_personnel_domain_scope(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_personnel_domain(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_has_employee_scope(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_employee(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_employee(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_confidential_employee(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_confidential_personnel() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_finance_employee(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_finance_employee(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_employee_placement(UUID, UUID, UUID, UUID, UUID, UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_document(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_document(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_vacancy(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_session_is_active() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_role(TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_active_scope(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_personnel_domain_scope(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_personnel_domain(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_employee_scope(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_employee(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_employee(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_confidential_employee(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_confidential_personnel() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_finance_employee(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_finance_employee(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_employee_placement(UUID, UUID, UUID, UUID, UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_document(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_document(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_vacancy(UUID) TO authenticated;

COMMIT;
