-- Give each independent personnel-management area an explicit owner.
-- Employee identity remains in employees; ownership and placement stay on
-- effective-dated assignment rows.

BEGIN;

INSERT INTO public.boards (code, name, description)
VALUES
  ('MISSION', 'Mission Board', 'Evangelism, discipleship and mission programmes.'),
  ('EDUCATION', 'Education Board', 'Church-founded schools, colleges and training institutions.'),
  ('HEALTH', 'Health Board', 'Hospitals, health centres and community health programmes.'),
  ('LAND_FINANCE', 'Land & Finance Board', 'Land, property, assets, finance and accountability.'),
  ('PLANNING_DEVELOPMENT', 'Planning & Development Board', 'Infrastructure, strategic growth and development programmes.'),
  ('ICT', 'ICT Board', 'Information systems, infrastructure, security and digital transformation.')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.personnel_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  board_id UUID UNIQUE REFERENCES public.boards(id) ON DELETE RESTRICT,
  is_secretariat BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT personnel_domains_owner_check CHECK (
    (is_secretariat IS TRUE AND board_id IS NULL)
    OR (is_secretariat IS FALSE AND board_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS personnel_domains_one_secretariat
  ON public.personnel_domains (is_secretariat)
  WHERE is_secretariat IS TRUE;

ALTER TABLE public.personnel_domains ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.personnel_domains TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.personnel_domains TO authenticated;

INSERT INTO public.personnel_domains (code, name, is_secretariat, description)
VALUES ('SECRETARIAT', 'Diocesan Secretariat / Central Administration', TRUE,
  'Independent personnel-management domain and administrator of the ecclesiastical structure.')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.personnel_domains (code, name, board_id, description)
SELECT board.code, board.name, board.id, board.description
FROM public.boards AS board
WHERE board.code IN ('MISSION', 'EDUCATION', 'HEALTH', 'LAND_FINANCE', 'PLANNING_DEVELOPMENT', 'ICT')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS personnel_domain_id UUID
    REFERENCES public.personnel_domains(id) ON DELETE RESTRICT;
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS authority TEXT;
CREATE INDEX IF NOT EXISTS idx_assignments_personnel_domain
  ON public.assignments (personnel_domain_id, status, start_date DESC);

ALTER TABLE public.employee_roles
  ADD COLUMN IF NOT EXISTS personnel_domain_id UUID
    REFERENCES public.personnel_domains(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_employee_roles_personnel_domain
  ON public.employee_roles (personnel_domain_id, status, start_date DESC);

-- Backfill only when the legacy placement identifies an owner. Unknown board
-- identifiers are deliberately left unmapped for an administrator to review.
UPDATE public.assignments AS assignment
SET personnel_domain_id = COALESCE(
  (SELECT owner_domain.id
   FROM public.personnel_domains AS owner_domain
   WHERE owner_domain.board_id = COALESCE(
     assignment.board_id,
     (SELECT department.board_id FROM public.departments AS department WHERE department.id = assignment.department_id),
     (SELECT institution.board_id FROM public.institutions AS institution WHERE institution.id = assignment.institution_id)
   )),
  CASE WHEN assignment.board_id IS NULL
      AND (SELECT department.board_id FROM public.departments AS department WHERE department.id = assignment.department_id) IS NULL
      AND (SELECT institution.board_id FROM public.institutions AS institution WHERE institution.id = assignment.institution_id) IS NULL
      AND (assignment.department_id IS NOT NULL OR assignment.archdeaconry_id IS NOT NULL
        OR assignment.parish_id IS NOT NULL OR assignment.local_church_id IS NOT NULL)
    THEN (SELECT owner_domain.id FROM public.personnel_domains AS owner_domain WHERE owner_domain.is_secretariat IS TRUE)
  END
)
WHERE assignment.personnel_domain_id IS NULL;

UPDATE public.employee_roles AS employee_role
SET personnel_domain_id = COALESCE(
  (SELECT owner_domain.id
   FROM public.personnel_domains AS owner_domain
   WHERE owner_domain.board_id = COALESCE(
     employee_role.board_id,
     (SELECT department.board_id FROM public.departments AS department WHERE department.id = employee_role.department_id),
     (SELECT institution.board_id FROM public.institutions AS institution WHERE institution.id = employee_role.institution_id)
   )),
  CASE WHEN employee_role.board_id IS NULL
      AND (SELECT department.board_id FROM public.departments AS department WHERE department.id = employee_role.department_id) IS NULL
      AND (SELECT institution.board_id FROM public.institutions AS institution WHERE institution.id = employee_role.institution_id) IS NULL
      AND (employee_role.department_id IS NOT NULL OR employee_role.archdeaconry_id IS NOT NULL
        OR employee_role.parish_id IS NOT NULL OR employee_role.local_church_id IS NOT NULL)
    THEN (SELECT owner_domain.id FROM public.personnel_domains AS owner_domain WHERE owner_domain.is_secretariat IS TRUE)
  END
)
WHERE employee_role.personnel_domain_id IS NULL;

ALTER TABLE public.vacancies
  ADD COLUMN IF NOT EXISTS personnel_domain_id UUID
    REFERENCES public.personnel_domains(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_vacancies_personnel_domain
  ON public.vacancies (personnel_domain_id, status);

UPDATE public.vacancies AS vacancy
SET personnel_domain_id = COALESCE(
  (SELECT owner_domain.id
   FROM public.personnel_domains AS owner_domain
   WHERE owner_domain.board_id = COALESCE(
     vacancy.board_id,
     (SELECT department.board_id FROM public.departments AS department WHERE department.id = vacancy.department_id),
     (SELECT institution.board_id FROM public.institutions AS institution WHERE institution.id = vacancy.institution_id)
   )),
  CASE WHEN vacancy.board_id IS NULL AND vacancy.department_id IS NOT NULL
      AND (SELECT department.board_id FROM public.departments AS department WHERE department.id = vacancy.department_id) IS NULL
    THEN (SELECT owner_domain.id FROM public.personnel_domains AS owner_domain WHERE owner_domain.is_secretariat IS TRUE)
  END
)
WHERE vacancy.personnel_domain_id IS NULL;

ALTER TABLE public.user_scopes DROP CONSTRAINT IF EXISTS user_scopes_scope_type_check;
ALTER TABLE public.user_scopes
  ADD CONSTRAINT user_scopes_scope_type_check
  CHECK (scope_type IN ('Diocese', 'Archdeaconry', 'Parish', 'Institution', 'Department', 'Board', 'PersonnelDomain'));

DROP POLICY IF EXISTS personnel_domains_read_authorized ON public.personnel_domains;
DROP POLICY IF EXISTS personnel_domains_manage_admin ON public.personnel_domains;
CREATE POLICY personnel_domains_read_authorized ON public.personnel_domains
  FOR SELECT TO authenticated
  USING (
    public.has_active_role(ARRAY['SuperAdministrator', 'CentralHR', 'BoardHR', 'InstitutionAdmin', 'ArchdeaconryAdmin', 'ParishAdmin', 'ICTAdministrator', 'FinanceOfficer']::TEXT[])
    OR EXISTS (
      SELECT 1 FROM public.user_scopes AS scope
      WHERE scope.user_id = auth.uid() AND scope.isactive IS TRUE
        AND scope.scope_type = 'PersonnelDomain' AND scope.scope_id = personnel_domains.id
    )
  );
CREATE POLICY personnel_domains_manage_admin ON public.personnel_domains
  FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['SuperAdministrator']::TEXT[]))
  WITH CHECK (public.has_active_role(ARRAY['SuperAdministrator']::TEXT[]));

DROP POLICY IF EXISTS organizational_directory_read ON public.dioceses;
DROP POLICY IF EXISTS organizational_directory_manage ON public.dioceses;
CREATE POLICY dioceses_read_authorized ON public.dioceses
  FOR SELECT TO authenticated
  USING (public.has_active_role(ARRAY['SuperAdministrator', 'CentralHR', 'BoardHR', 'ArchdeaconryAdmin', 'ParishAdmin', 'InstitutionAdmin']::TEXT[]));
CREATE POLICY dioceses_manage_admin ON public.dioceses
  FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['SuperAdministrator']::TEXT[]))
  WITH CHECK (public.has_active_role(ARRAY['SuperAdministrator']::TEXT[]));

DO $policies$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'archdeaconries', 'parishes', 'local_churches', 'boards',
    'departments', 'institutions', 'grades', 'positions'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS organizational_directory_read ON public.%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS organizational_directory_manage ON public.%I', table_name);
  END LOOP;
END;
$policies$;

CREATE POLICY archdeaconries_read_scoped ON public.archdeaconries
  FOR SELECT TO authenticated
  USING (
    public.has_active_role(ARRAY['SuperAdministrator']::TEXT[])
    OR public.user_has_active_scope('Archdeaconry', id)
    OR (public.has_active_role(ARRAY['CentralHR']::TEXT[])
      AND public.user_has_active_scope('PersonnelDomain',
        (SELECT domain.id FROM public.personnel_domains AS domain WHERE domain.is_secretariat IS TRUE)))
  );
CREATE POLICY archdeaconries_manage_scoped ON public.archdeaconries
  FOR ALL TO authenticated
  USING (
    public.has_active_role(ARRAY['SuperAdministrator']::TEXT[])
    OR (public.has_active_role(ARRAY['CentralHR']::TEXT[])
      AND public.user_has_active_scope('PersonnelDomain',
        (SELECT domain.id FROM public.personnel_domains AS domain WHERE domain.is_secretariat IS TRUE)))
    OR (public.has_active_role(ARRAY['ArchdeaconryAdmin']::TEXT[])
      AND public.user_has_active_scope('Archdeaconry', id))
  )
  WITH CHECK (
    public.has_active_role(ARRAY['SuperAdministrator']::TEXT[])
    OR (public.has_active_role(ARRAY['CentralHR']::TEXT[])
      AND public.user_has_active_scope('PersonnelDomain',
        (SELECT domain.id FROM public.personnel_domains AS domain WHERE domain.is_secretariat IS TRUE)))
  );

CREATE POLICY parishes_read_scoped ON public.parishes
  FOR SELECT TO authenticated
  USING (
    public.has_active_role(ARRAY['SuperAdministrator']::TEXT[])
    OR public.user_has_active_scope('Parish', id)
    OR public.user_has_active_scope('Archdeaconry', archdeaconry_id)
    OR (public.has_active_role(ARRAY['CentralHR']::TEXT[])
      AND public.user_has_active_scope('PersonnelDomain',
        (SELECT domain.id FROM public.personnel_domains AS domain WHERE domain.is_secretariat IS TRUE)))
  );
CREATE POLICY parishes_manage_scoped ON public.parishes
  FOR ALL TO authenticated
  USING (
    public.has_active_role(ARRAY['SuperAdministrator']::TEXT[])
    OR (public.has_active_role(ARRAY['CentralHR']::TEXT[])
      AND public.user_has_active_scope('PersonnelDomain',
        (SELECT domain.id FROM public.personnel_domains AS domain WHERE domain.is_secretariat IS TRUE)))
    OR (public.has_active_role(ARRAY['ParishAdmin']::TEXT[])
      AND public.user_has_active_scope('Parish', id))
  )
  WITH CHECK (
    public.has_active_role(ARRAY['SuperAdministrator']::TEXT[])
    OR (public.has_active_role(ARRAY['CentralHR']::TEXT[])
      AND public.user_has_active_scope('PersonnelDomain',
        (SELECT domain.id FROM public.personnel_domains AS domain WHERE domain.is_secretariat IS TRUE)))
  );

CREATE POLICY local_churches_read_scoped ON public.local_churches
  FOR SELECT TO authenticated
  USING (
    public.has_active_role(ARRAY['SuperAdministrator']::TEXT[])
    OR public.user_has_active_scope('Parish', parish_id)
    OR EXISTS (
      SELECT 1 FROM public.parishes AS parish
      WHERE parish.id = local_churches.parish_id
        AND public.user_has_active_scope('Archdeaconry', parish.archdeaconry_id)
    )
    OR (public.has_active_role(ARRAY['CentralHR']::TEXT[])
      AND public.user_has_active_scope('PersonnelDomain',
        (SELECT domain.id FROM public.personnel_domains AS domain WHERE domain.is_secretariat IS TRUE)))
  );
CREATE POLICY local_churches_manage_scoped ON public.local_churches
  FOR ALL TO authenticated
  USING (
    public.has_active_role(ARRAY['SuperAdministrator']::TEXT[])
    OR (public.has_active_role(ARRAY['CentralHR']::TEXT[])
      AND public.user_has_active_scope('PersonnelDomain',
        (SELECT domain.id FROM public.personnel_domains AS domain WHERE domain.is_secretariat IS TRUE)))
    OR (public.has_active_role(ARRAY['ParishAdmin']::TEXT[])
      AND public.user_has_active_scope('Parish', parish_id))
  )
  WITH CHECK (
    public.has_active_role(ARRAY['SuperAdministrator']::TEXT[])
    OR (public.has_active_role(ARRAY['CentralHR']::TEXT[])
      AND public.user_has_active_scope('PersonnelDomain',
        (SELECT domain.id FROM public.personnel_domains AS domain WHERE domain.is_secretariat IS TRUE)))
    OR (public.has_active_role(ARRAY['ParishAdmin']::TEXT[])
      AND public.user_has_active_scope('Parish', parish_id))
  );

CREATE POLICY boards_read_scoped ON public.boards
  FOR SELECT TO authenticated
  USING (
    public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR', 'Auditor', 'ReadOnly']::TEXT[])
    OR public.user_has_active_scope('Board', id)
    OR EXISTS (SELECT 1 FROM public.personnel_domains AS domain
      WHERE domain.board_id = boards.id
        AND public.user_has_active_scope('PersonnelDomain', domain.id))
  );
CREATE POLICY boards_manage_admin ON public.boards
  FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['SuperAdministrator']::TEXT[]))
  WITH CHECK (public.has_active_role(ARRAY['SuperAdministrator']::TEXT[]));

CREATE POLICY departments_read_scoped ON public.departments
  FOR SELECT TO authenticated
  USING (
    public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR', 'Auditor', 'ReadOnly']::TEXT[])
    OR public.user_has_active_scope('Department', id)
    OR (board_id IS NOT NULL AND public.user_has_active_scope('Board', board_id))
    OR EXISTS (SELECT 1 FROM public.personnel_domains AS domain
      WHERE domain.board_id = departments.board_id
        AND public.user_has_active_scope('PersonnelDomain', domain.id))
    OR (board_id IS NULL AND public.has_active_role(ARRAY['CentralHR']::TEXT[])
      AND public.user_has_active_scope('PersonnelDomain',
        (SELECT domain.id FROM public.personnel_domains AS domain WHERE domain.is_secretariat IS TRUE)))
  );
CREATE POLICY departments_manage_scoped ON public.departments
  FOR ALL TO authenticated
  USING (
    public.has_active_role(ARRAY['SuperAdministrator']::TEXT[])
    OR (board_id IS NOT NULL AND public.has_active_role(ARRAY['BoardHR']::TEXT[])
      AND (public.user_has_active_scope('Board', board_id)
        OR EXISTS (SELECT 1 FROM public.personnel_domains AS domain
          WHERE domain.board_id = departments.board_id
            AND public.user_has_active_scope('PersonnelDomain', domain.id))))
    OR (board_id IS NULL AND public.has_active_role(ARRAY['CentralHR']::TEXT[])
      AND public.user_has_active_scope('PersonnelDomain',
        (SELECT domain.id FROM public.personnel_domains AS domain WHERE domain.is_secretariat IS TRUE)))
  )
  WITH CHECK (
    public.has_active_role(ARRAY['SuperAdministrator']::TEXT[])
    OR (board_id IS NOT NULL AND public.has_active_role(ARRAY['BoardHR']::TEXT[])
      AND (public.user_has_active_scope('Board', board_id)
        OR EXISTS (SELECT 1 FROM public.personnel_domains AS domain
          WHERE domain.board_id = departments.board_id
            AND public.user_has_active_scope('PersonnelDomain', domain.id))))
    OR (board_id IS NULL AND public.has_active_role(ARRAY['CentralHR']::TEXT[])
      AND public.user_has_active_scope('PersonnelDomain',
        (SELECT domain.id FROM public.personnel_domains AS domain WHERE domain.is_secretariat IS TRUE)))
  );

CREATE POLICY institutions_read_scoped ON public.institutions
  FOR SELECT TO authenticated
  USING (
    public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'Auditor', 'ReadOnly']::TEXT[])
    OR public.user_has_active_scope('Institution', id)
    OR public.user_has_active_scope('Department', department_id)
    OR (board_id IS NOT NULL AND public.user_has_active_scope('Board', board_id))
    OR EXISTS (SELECT 1 FROM public.personnel_domains AS domain
      WHERE domain.board_id = institutions.board_id
        AND public.user_has_active_scope('PersonnelDomain', domain.id))
  );
CREATE POLICY institutions_manage_scoped ON public.institutions
  FOR ALL TO authenticated
  USING (
    public.has_active_role(ARRAY['SuperAdministrator']::TEXT[])
    OR (public.has_active_role(ARRAY['BoardHR']::TEXT[])
      AND (public.user_has_active_scope('Institution', id)
        OR (board_id IS NOT NULL AND public.user_has_active_scope('Board', board_id))
        OR EXISTS (SELECT 1 FROM public.personnel_domains AS domain
          WHERE domain.board_id = institutions.board_id
            AND public.user_has_active_scope('PersonnelDomain', domain.id))))
  )
  WITH CHECK (
    public.has_active_role(ARRAY['SuperAdministrator']::TEXT[])
    OR (public.has_active_role(ARRAY['BoardHR']::TEXT[])
      AND (public.user_has_active_scope('Institution', id)
        OR (board_id IS NOT NULL AND public.user_has_active_scope('Board', board_id))
        OR EXISTS (SELECT 1 FROM public.personnel_domains AS domain
          WHERE domain.board_id = institutions.board_id
            AND public.user_has_active_scope('PersonnelDomain', domain.id))))
  );

CREATE POLICY grades_read_scoped ON public.grades
  FOR SELECT TO authenticated
  USING (public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR', 'Auditor', 'ReadOnly']::TEXT[])
    OR public.user_has_active_scope('Department', department_id)
    OR (board_id IS NOT NULL AND public.user_has_active_scope('Board', board_id))
    OR EXISTS (SELECT 1 FROM public.personnel_domains AS domain WHERE domain.board_id = grades.board_id
      AND public.user_has_active_scope('PersonnelDomain', domain.id)));
CREATE POLICY grades_manage_scoped ON public.grades
  FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['SuperAdministrator']::TEXT[])
    OR (public.has_active_role(ARRAY['BoardHR']::TEXT[])
      AND (public.user_has_active_scope('Department', department_id)
        OR public.user_has_active_scope('Board', board_id)
        OR EXISTS (SELECT 1 FROM public.personnel_domains AS domain WHERE domain.board_id = grades.board_id
          AND public.user_has_active_scope('PersonnelDomain', domain.id)))))
  WITH CHECK (public.has_active_role(ARRAY['SuperAdministrator']::TEXT[])
    OR (public.has_active_role(ARRAY['BoardHR']::TEXT[])
      AND (public.user_has_active_scope('Department', department_id)
        OR public.user_has_active_scope('Board', board_id)
        OR EXISTS (SELECT 1 FROM public.personnel_domains AS domain WHERE domain.board_id = grades.board_id
          AND public.user_has_active_scope('PersonnelDomain', domain.id)))));

CREATE POLICY positions_read_scoped ON public.positions
  FOR SELECT TO authenticated
  USING (public.has_active_role(ARRAY['SuperAdministrator', 'SystemAdministrator', 'CentralHR', 'Auditor', 'ReadOnly']::TEXT[])
    OR public.user_has_active_scope('Department', department_id)
    OR (board_id IS NOT NULL AND public.user_has_active_scope('Board', board_id))
    OR EXISTS (SELECT 1 FROM public.personnel_domains AS domain WHERE domain.board_id = positions.board_id
      AND public.user_has_active_scope('PersonnelDomain', domain.id)));
CREATE POLICY positions_manage_scoped ON public.positions
  FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['SuperAdministrator']::TEXT[])
    OR (public.has_active_role(ARRAY['BoardHR']::TEXT[])
      AND (public.user_has_active_scope('Department', department_id)
        OR public.user_has_active_scope('Board', board_id)
        OR EXISTS (SELECT 1 FROM public.personnel_domains AS domain WHERE domain.board_id = positions.board_id
          AND public.user_has_active_scope('PersonnelDomain', domain.id)))))
  WITH CHECK (public.has_active_role(ARRAY['SuperAdministrator']::TEXT[])
    OR (public.has_active_role(ARRAY['BoardHR']::TEXT[])
      AND (public.user_has_active_scope('Department', department_id)
        OR public.user_has_active_scope('Board', board_id)
        OR EXISTS (SELECT 1 FROM public.personnel_domains AS domain WHERE domain.board_id = positions.board_id
          AND public.user_has_active_scope('PersonnelDomain', domain.id)))));

CREATE OR REPLACE FUNCTION public.can_manage_personnel_domain(target_domain_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT public.has_active_role(ARRAY['SuperAdministrator']::TEXT[])
    OR EXISTS (
      SELECT 1
      FROM public.personnel_domains AS domain
      WHERE domain.id = target_domain_id
        AND domain.is_active IS TRUE
        AND (
          (domain.is_secretariat IS TRUE
            AND public.has_active_role(ARRAY['CentralHR']::TEXT[])
            AND public.user_has_active_scope('PersonnelDomain', domain.id))
          OR
          (domain.board_id IS NOT NULL
            AND public.has_active_role(ARRAY['BoardHR']::TEXT[])
            AND (
              public.user_has_active_scope('PersonnelDomain', domain.id)
              OR public.user_has_active_scope('Board', domain.board_id)
              OR EXISTS (
                SELECT 1 FROM public.departments AS department
                WHERE department.board_id = domain.board_id
                  AND public.user_has_active_scope('Department', department.id)
              )
            ))
        )
    );
$function$;

CREATE OR REPLACE FUNCTION public.user_has_employee_scope(target_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND target_employee_id IS NOT NULL
    AND (
      public.current_user_employee_id() = target_employee_id
      OR EXISTS (
        SELECT 1 FROM public.assignments AS assignment
        WHERE assignment.employee_id = target_employee_id
          AND assignment.status IN ('Active', 'OnLeave', 'Suspended')
          AND assignment.start_date <= CURRENT_DATE
          AND (assignment.end_date IS NULL OR assignment.end_date >= CURRENT_DATE)
          AND (
            public.user_has_active_scope('PersonnelDomain', assignment.personnel_domain_id)
            OR public.user_has_active_scope('Board', assignment.board_id)
            OR public.user_has_active_scope('Archdeaconry', assignment.archdeaconry_id)
            OR public.user_has_active_scope('Parish', assignment.parish_id)
            OR public.user_has_active_scope('Institution', assignment.institution_id)
            OR public.user_has_active_scope('Department', assignment.department_id)
          )
      )
      OR EXISTS (
        SELECT 1 FROM public.employee_roles AS employee_role
        WHERE employee_role.employee_id = target_employee_id
          AND employee_role.status = 'Active'
          AND (employee_role.end_date IS NULL OR employee_role.end_date >= CURRENT_DATE)
          AND (
            public.user_has_active_scope('PersonnelDomain', employee_role.personnel_domain_id)
            OR public.user_has_active_scope('Board', employee_role.board_id)
            OR public.user_has_active_scope('Archdeaconry', employee_role.archdeaconry_id)
            OR public.user_has_active_scope('Parish', employee_role.parish_id)
            OR public.user_has_active_scope('Institution', employee_role.institution_id)
            OR public.user_has_active_scope('Department', employee_role.department_id)
          )
      )
      OR EXISTS (
        SELECT 1 FROM public.assignments AS assignment
        JOIN public.archdeaconries AS archdeaconry ON archdeaconry.id = assignment.archdeaconry_id
        WHERE assignment.employee_id = target_employee_id
          AND assignment.status IN ('Active', 'OnLeave', 'Suspended')
          AND assignment.start_date <= CURRENT_DATE
          AND (assignment.end_date IS NULL OR assignment.end_date >= CURRENT_DATE)
          AND public.user_has_active_scope('Diocese', archdeaconry.diocese_id)
      )
      OR EXISTS (
        SELECT 1 FROM public.assignments AS assignment
        JOIN public.parishes AS parish ON parish.id = assignment.parish_id
        JOIN public.archdeaconries AS archdeaconry ON archdeaconry.id = parish.archdeaconry_id
        WHERE assignment.employee_id = target_employee_id
          AND assignment.status IN ('Active', 'OnLeave', 'Suspended')
          AND assignment.start_date <= CURRENT_DATE
          AND (assignment.end_date IS NULL OR assignment.end_date >= CURRENT_DATE)
          AND public.user_has_active_scope('Diocese', archdeaconry.diocese_id)
      )
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
  SELECT public.has_active_role(ARRAY['SuperAdministrator']::TEXT[])
    OR public.current_user_employee_id() = target_employee_id
    OR (
      public.user_has_employee_scope(target_employee_id)
      AND (
        (public.has_active_role(ARRAY['CentralHR']::TEXT[])
          AND EXISTS (
            SELECT 1 FROM public.assignments AS assignment
            JOIN public.personnel_domains AS domain ON domain.id = assignment.personnel_domain_id
            WHERE assignment.employee_id = target_employee_id
              AND domain.is_secretariat IS TRUE
              AND public.user_has_active_scope('PersonnelDomain', domain.id)
          ))
        OR (public.has_active_role(ARRAY['BoardHR']::TEXT[])
          AND EXISTS (
            SELECT 1 FROM public.assignments AS assignment
            JOIN public.personnel_domains AS domain ON domain.id = assignment.personnel_domain_id
            WHERE assignment.employee_id = target_employee_id
              AND domain.board_id IS NOT NULL
              AND (
                public.user_has_active_scope('PersonnelDomain', domain.id)
                OR public.user_has_active_scope('Board', domain.board_id)
                OR EXISTS (
                  SELECT 1 FROM public.departments AS department
                  WHERE department.board_id = domain.board_id
                    AND public.user_has_active_scope('Department', department.id)
                )
              )
          ))
        OR (public.has_active_role(ARRAY['ArchdeaconryAdmin']::TEXT[])
          AND EXISTS (
            SELECT 1 FROM public.assignments AS assignment
            WHERE assignment.employee_id = target_employee_id
              AND public.user_has_active_scope('Archdeaconry', assignment.archdeaconry_id)
          ))
        OR (public.has_active_role(ARRAY['ParishAdmin']::TEXT[])
          AND EXISTS (
            SELECT 1 FROM public.assignments AS assignment
            WHERE assignment.employee_id = target_employee_id
              AND public.user_has_active_scope('Parish', assignment.parish_id)
          ))
        OR (public.has_active_role(ARRAY['InstitutionAdmin']::TEXT[])
          AND EXISTS (
            SELECT 1 FROM public.assignments AS assignment
            WHERE assignment.employee_id = target_employee_id
              AND (public.user_has_active_scope('Institution', assignment.institution_id)
                OR public.user_has_active_scope('Department', assignment.department_id))
          ))
        OR (public.has_active_role(ARRAY['FinanceOfficer']::TEXT[])
          AND public.user_has_employee_scope(target_employee_id))
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.can_access_confidential_employee(target_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT public.has_active_role(ARRAY['SuperAdministrator']::TEXT[])
    OR (public.has_active_role(ARRAY['CentralHR', 'BoardHR']::TEXT[])
      AND public.can_access_employee(target_employee_id));
$function$;

CREATE OR REPLACE FUNCTION public.can_access_confidential_personnel()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT public.has_active_role(ARRAY['SuperAdministrator']::TEXT[]);
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_finance_employee(target_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT public.has_active_role(ARRAY['SuperAdministrator']::TEXT[])
    OR (public.has_active_role(ARRAY['FinanceOfficer']::TEXT[])
      AND target_employee_id IS DISTINCT FROM public.current_user_employee_id()
      AND public.user_has_employee_scope(target_employee_id));
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
        public.has_active_role(ARRAY['SuperAdministrator']::TEXT[])
        OR (document.employee_id IS NOT NULL AND public.can_access_employee(document.employee_id))
        OR (document.employee_id IS NULL AND public.has_active_role(ARRAY['RegistryOfficer']::TEXT[]))
      )
  );
$function$;

-- Employee identity is shared, while assignment and role rows stay private to
-- the personnel domain or organizational scope responsible for each row.
CREATE OR REPLACE FUNCTION public.can_access_employee_placement(
  target_employee_id UUID,
  target_domain_id UUID,
  target_board_id UUID,
  target_archdeaconry_id UUID,
  target_parish_id UUID,
  target_institution_id UUID,
  target_department_id UUID
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT public.has_active_role(ARRAY['SuperAdministrator']::TEXT[])
    OR public.current_user_employee_id() = target_employee_id
    OR (
      public.can_access_employee(target_employee_id)
      AND (
        (public.has_active_role(ARRAY['CentralHR']::TEXT[])
          AND (
            (target_domain_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.personnel_domains AS domain
              WHERE domain.id = target_domain_id AND domain.is_secretariat IS TRUE
                AND public.user_has_active_scope('PersonnelDomain', domain.id)
            ))
            OR (target_domain_id IS NULL AND target_board_id IS NULL
              AND public.user_has_active_scope('PersonnelDomain',
                (SELECT domain.id FROM public.personnel_domains AS domain WHERE domain.is_secretariat IS TRUE)))
          ))
        OR (public.has_active_role(ARRAY['BoardHR']::TEXT[])
          AND (
            (target_domain_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.personnel_domains AS domain
              WHERE domain.id = target_domain_id AND domain.board_id IS NOT NULL
                AND (public.user_has_active_scope('PersonnelDomain', domain.id)
                  OR public.user_has_active_scope('Board', domain.board_id))
            ))
            OR (target_domain_id IS NULL AND target_board_id IS NOT NULL
              AND public.user_has_active_scope('Board', target_board_id))
            OR public.user_has_active_scope('Department', target_department_id)
          ))
        OR (public.has_active_role(ARRAY['ArchdeaconryAdmin']::TEXT[])
          AND public.user_has_active_scope('Archdeaconry', target_archdeaconry_id))
        OR (public.has_active_role(ARRAY['ParishAdmin']::TEXT[])
          AND public.user_has_active_scope('Parish', target_parish_id))
        OR (public.has_active_role(ARRAY['InstitutionAdmin']::TEXT[])
          AND (public.user_has_active_scope('Institution', target_institution_id)
            OR public.user_has_active_scope('Department', target_department_id)))
      )
    );
$function$;

DROP POLICY IF EXISTS user_roles_manage_admin ON public.user_roles;
CREATE POLICY user_roles_manage_admin ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['SuperAdministrator']::TEXT[]))
  WITH CHECK (public.has_active_role(ARRAY['SuperAdministrator']::TEXT[]));
DROP POLICY IF EXISTS user_scopes_manage_admin ON public.user_scopes;
CREATE POLICY user_scopes_manage_admin ON public.user_scopes
  FOR ALL TO authenticated
  USING (public.has_active_role(ARRAY['SuperAdministrator']::TEXT[]))
  WITH CHECK (public.has_active_role(ARRAY['SuperAdministrator']::TEXT[]));

DROP POLICY IF EXISTS documents_read_scoped ON public.documents;
DROP POLICY IF EXISTS documents_insert_authorized ON public.documents;
DROP POLICY IF EXISTS documents_update_authorized ON public.documents;
CREATE POLICY documents_read_scoped ON public.documents
  FOR SELECT TO authenticated USING (public.can_access_document(id));
CREATE POLICY documents_insert_authorized ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_active_role(ARRAY['SuperAdministrator']::TEXT[])
    OR (employee_id IS NULL AND public.has_active_role(ARRAY['RegistryOfficer']::TEXT[]))
    OR (employee_id IS NOT NULL AND public.can_manage_employee(employee_id))
  );
CREATE POLICY documents_update_authorized ON public.documents
  FOR UPDATE TO authenticated
  USING (public.can_access_document(id))
  WITH CHECK (
    public.has_active_role(ARRAY['SuperAdministrator']::TEXT[])
    OR (employee_id IS NULL AND public.has_active_role(ARRAY['RegistryOfficer']::TEXT[]))
    OR (employee_id IS NOT NULL AND public.can_manage_employee(employee_id))
  );

DROP POLICY IF EXISTS stored_files_read_authorized ON public.stored_files;
DROP POLICY IF EXISTS stored_files_insert_authorized ON public.stored_files;
DROP POLICY IF EXISTS stored_files_update_authorized ON public.stored_files;
CREATE POLICY stored_files_read_authorized ON public.stored_files
  FOR SELECT TO authenticated USING (public.can_access_document(document_id));
CREATE POLICY stored_files_insert_authorized ON public.stored_files
  FOR INSERT TO authenticated WITH CHECK (public.can_access_document(document_id));
CREATE POLICY stored_files_update_authorized ON public.stored_files
  FOR UPDATE TO authenticated
  USING (public.can_access_document(document_id))
  WITH CHECK (public.can_access_document(document_id));

DO $confidential$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'personal_details', 'spouses', 'children', 'next_of_kin',
    'disciplinary_cases', 'employee_death_records'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS confidential_personnel_read_central_hr ON public.%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS confidential_personnel_insert_central_hr ON public.%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS confidential_personnel_update_central_hr ON public.%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS confidential_personnel_read_scoped ON public.%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS confidential_personnel_insert_scoped ON public.%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS confidential_personnel_update_scoped ON public.%I', table_name);
    EXECUTE format('CREATE POLICY confidential_personnel_read_scoped ON public.%I FOR SELECT TO authenticated USING (public.can_access_confidential_employee(employee_id))', table_name);
    EXECUTE format('CREATE POLICY confidential_personnel_insert_scoped ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_access_confidential_employee(employee_id))', table_name);
    EXECUTE format('CREATE POLICY confidential_personnel_update_scoped ON public.%I FOR UPDATE TO authenticated USING (public.can_access_confidential_employee(employee_id)) WITH CHECK (public.can_access_confidential_employee(employee_id))', table_name);
  END LOOP;
END;
$confidential$;

DROP POLICY IF EXISTS hr_records_read_scoped ON public.personal_details;
DROP POLICY IF EXISTS hr_records_insert_scoped ON public.personal_details;
DROP POLICY IF EXISTS hr_records_update_scoped ON public.personal_details;

CREATE OR REPLACE FUNCTION public.can_manage_employee(target_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT public.has_active_role(ARRAY['SuperAdministrator']::TEXT[])
    OR (public.can_access_employee(target_employee_id)
      AND public.has_active_role(ARRAY['CentralHR', 'BoardHR', 'ArchdeaconryAdmin', 'ParishAdmin', 'InstitutionAdmin']::TEXT[]));
$function$;

CREATE OR REPLACE FUNCTION public.can_access_finance_employee(target_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
  SELECT public.has_active_role(ARRAY['SuperAdministrator']::TEXT[])
    OR public.current_user_employee_id() = target_employee_id
    OR (public.has_active_role(ARRAY['FinanceOfficer']::TEXT[])
      AND public.user_has_employee_scope(target_employee_id));
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

CREATE OR REPLACE VIEW public.personnel_domain_employees
WITH (security_invoker = true)
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
GRANT SELECT ON public.personnel_domain_employees TO authenticated;

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
  domain_board_id UUID;
  total BIGINT;
BEGIN
  IF NOT public.can_manage_personnel_domain(target_domain_id) THEN
    RAISE EXCEPTION 'The requested personnel domain is outside your authorization.' USING ERRCODE = '42501';
  END IF;
  SELECT board_id INTO domain_board_id FROM public.personnel_domains
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
      JOIN public.assignments AS assignment ON assignment.employee_id = leave_record.employee_id
      WHERE assignment.personnel_domain_id = target_domain_id
        AND assignment.is_primary IS TRUE
        AND assignment.status IN ('Active', 'OnLeave', 'Suspended')
        AND assignment.start_date <= CURRENT_DATE
        AND (assignment.end_date IS NULL OR assignment.end_date >= CURRENT_DATE);
    WHEN 'institutions' THEN
      SELECT COUNT(*) INTO total FROM public.institutions
      WHERE board_id = domain_board_id AND isactive IS TRUE;
    WHEN 'professional_licences' THEN
      SELECT COUNT(DISTINCT licence.id) INTO total
      FROM public.professional_licences AS licence
      JOIN public.assignments AS assignment ON assignment.employee_id = licence.employee_id
      WHERE assignment.personnel_domain_id = target_domain_id
        AND assignment.is_primary IS TRUE
        AND assignment.status IN ('Active', 'OnLeave', 'Suspended')
        AND assignment.start_date <= CURRENT_DATE
        AND (assignment.end_date IS NULL OR assignment.end_date >= CURRENT_DATE);
    ELSE
      RAISE EXCEPTION 'This metric is not available for personnel-domain reporting.' USING ERRCODE = '22023';
  END CASE;
  RETURN COALESCE(total, 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_personnel_domain_placement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $function$
DECLARE
  owner_domain public.personnel_domains%ROWTYPE;
  related_board_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'assignments' AND TG_OP = 'UPDATE'
      AND OLD.personnel_domain_id IS DISTINCT FROM NEW.personnel_domain_id THEN
    RAISE EXCEPTION 'Change personnel domains through the approved transfer workflow.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO owner_domain FROM public.personnel_domains
  WHERE id = NEW.personnel_domain_id AND is_active IS TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active personnel-management domain is required.' USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'assignments' AND TG_OP = 'INSERT'
      AND EXISTS (
        SELECT 1 FROM public.assignments AS current_assignment
        WHERE current_assignment.employee_id = NEW.employee_id
          AND current_assignment.status IN ('Active', 'OnLeave', 'Suspended')
          AND current_assignment.start_date <= CURRENT_DATE
          AND (current_assignment.end_date IS NULL OR current_assignment.end_date >= CURRENT_DATE)
          AND current_assignment.personnel_domain_id IS NOT NULL
          AND current_assignment.personnel_domain_id IS DISTINCT FROM NEW.personnel_domain_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.employee_transfers AS transfer_request
        WHERE transfer_request.employee_id = NEW.employee_id
          AND transfer_request.new_domain_id = NEW.personnel_domain_id
          AND transfer_request.new_assignment_id IS NULL
          AND transfer_request.created_by = auth.uid()
          AND transfer_request.status = 'Pending'
      ) THEN
    RAISE EXCEPTION 'Move an employee between personnel domains through the approved transfer workflow.' USING ERRCODE = '23514';
  END IF;

  IF owner_domain.is_secretariat IS TRUE THEN
    IF NEW.board_id IS NOT NULL OR NEW.institution_id IS NOT NULL THEN
      RAISE EXCEPTION 'Secretariat placements cannot belong to a Board or Board institution.' USING ERRCODE = '23514';
    END IF;
    IF NEW.department_id IS NOT NULL THEN
      SELECT board_id INTO related_board_id FROM public.departments WHERE id = NEW.department_id;
      IF related_board_id IS NOT NULL THEN
        RAISE EXCEPTION 'A Secretariat placement must use a Secretariat department.' USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSE
    IF NEW.board_id IS NOT NULL AND NEW.board_id IS DISTINCT FROM owner_domain.board_id THEN
      RAISE EXCEPTION 'The assignment Board does not match its personnel-management domain.' USING ERRCODE = '23514';
    END IF;
    IF NEW.archdeaconry_id IS NOT NULL OR NEW.parish_id IS NOT NULL OR NEW.local_church_id IS NOT NULL THEN
      RAISE EXCEPTION 'Ecclesiastical placements belong to the Secretariat domain.' USING ERRCODE = '23514';
    END IF;
    IF NEW.department_id IS NOT NULL THEN
      SELECT board_id INTO related_board_id FROM public.departments WHERE id = NEW.department_id;
      IF related_board_id IS NOT NULL AND related_board_id IS DISTINCT FROM owner_domain.board_id THEN
        RAISE EXCEPTION 'The department does not belong to this personnel-management domain.' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF NEW.institution_id IS NOT NULL THEN
      SELECT board_id INTO related_board_id FROM public.institutions WHERE id = NEW.institution_id;
      IF related_board_id IS NOT NULL AND related_board_id IS DISTINCT FROM owner_domain.board_id THEN
        RAISE EXCEPTION 'The institution does not belong to this personnel-management domain.' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_vacancy_personnel_domain()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $function$
DECLARE
  owner_domain public.personnel_domains%ROWTYPE;
  related_board_id UUID;
BEGIN
  SELECT * INTO owner_domain FROM public.personnel_domains
  WHERE id = NEW.personnel_domain_id AND is_active IS TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active personnel-management domain is required.' USING ERRCODE = '23514';
  END IF;

  IF NEW.board_id IS NOT NULL AND NEW.board_id IS DISTINCT FROM owner_domain.board_id THEN
    RAISE EXCEPTION 'The vacancy Board does not match its personnel-management domain.' USING ERRCODE = '23514';
  END IF;
  IF NEW.department_id IS NOT NULL THEN
    SELECT board_id INTO related_board_id FROM public.departments WHERE id = NEW.department_id;
    IF related_board_id IS DISTINCT FROM owner_domain.board_id THEN
      RAISE EXCEPTION 'The vacancy department does not belong to this personnel-management domain.' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.institution_id IS NOT NULL THEN
    SELECT board_id INTO related_board_id FROM public.institutions WHERE id = NEW.institution_id;
    IF related_board_id IS DISTINCT FROM owner_domain.board_id THEN
      RAISE EXCEPTION 'The vacancy institution does not belong to this personnel-management domain.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS assignments_enforce_personnel_domain ON public.assignments;
CREATE TRIGGER assignments_enforce_personnel_domain
  BEFORE INSERT OR UPDATE OF personnel_domain_id, board_id, department_id, institution_id,
    archdeaconry_id, parish_id, local_church_id
  ON public.assignments FOR EACH ROW EXECUTE FUNCTION public.enforce_personnel_domain_placement();
DROP TRIGGER IF EXISTS employee_roles_enforce_personnel_domain ON public.employee_roles;
CREATE TRIGGER employee_roles_enforce_personnel_domain
  BEFORE INSERT OR UPDATE OF personnel_domain_id, board_id, department_id, institution_id,
    archdeaconry_id, parish_id, local_church_id
  ON public.employee_roles FOR EACH ROW EXECUTE FUNCTION public.enforce_personnel_domain_placement();
DROP TRIGGER IF EXISTS vacancies_enforce_personnel_domain ON public.vacancies;
CREATE TRIGGER vacancies_enforce_personnel_domain
  BEFORE INSERT OR UPDATE OF personnel_domain_id, board_id, department_id, institution_id
  ON public.vacancies FOR EACH ROW EXECUTE FUNCTION public.enforce_vacancy_personnel_domain();

-- Remove the old broad role policies before replacing them with owner checks.
DROP POLICY IF EXISTS employees_insert_central_hr ON public.employees;
DROP POLICY IF EXISTS employees_read_scoped ON public.employees;
DROP POLICY IF EXISTS employees_update_scoped ON public.employees;
CREATE POLICY employees_read_scoped ON public.employees
  FOR SELECT TO authenticated
  USING (public.can_access_employee(id) OR public.can_access_finance_employee(id));
CREATE POLICY employees_insert_scoped ON public.employees
  FOR INSERT TO authenticated WITH CHECK (FALSE);
CREATE POLICY employees_update_scoped ON public.employees
  FOR UPDATE TO authenticated
  USING (public.can_manage_employee(id))
  WITH CHECK (public.can_manage_employee(id));

DROP POLICY IF EXISTS assignments_read_scoped ON public.assignments;
DROP POLICY IF EXISTS assignments_insert_scoped ON public.assignments;
DROP POLICY IF EXISTS assignments_update_scoped ON public.assignments;
CREATE POLICY assignments_read_scoped ON public.assignments
  FOR SELECT TO authenticated USING (public.can_access_employee_placement(
    employee_id, personnel_domain_id, board_id, archdeaconry_id, parish_id, institution_id, department_id));
CREATE POLICY assignments_insert_scoped ON public.assignments
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_employee(employee_id)
    AND (public.can_manage_personnel_domain(personnel_domain_id)
      OR public.can_manage_organizational_scope(archdeaconry_id, parish_id, institution_id, department_id)));
CREATE POLICY assignments_update_scoped ON public.assignments
  FOR UPDATE TO authenticated
  USING (public.can_access_employee_placement(
    employee_id, personnel_domain_id, board_id, archdeaconry_id, parish_id, institution_id, department_id))
  WITH CHECK (public.can_manage_employee(employee_id)
    AND (public.can_manage_personnel_domain(personnel_domain_id)
      OR public.can_manage_organizational_scope(archdeaconry_id, parish_id, institution_id, department_id)));

DROP POLICY IF EXISTS employee_roles_read_scoped ON public.employee_roles;
DROP POLICY IF EXISTS employee_roles_insert_scoped ON public.employee_roles;
DROP POLICY IF EXISTS employee_roles_update_scoped ON public.employee_roles;
CREATE POLICY employee_roles_read_scoped ON public.employee_roles
  FOR SELECT TO authenticated USING (public.can_access_employee_placement(
    employee_id, personnel_domain_id, board_id, archdeaconry_id, parish_id, institution_id, department_id));
CREATE POLICY employee_roles_insert_scoped ON public.employee_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_employee(employee_id)
    AND (public.can_manage_personnel_domain(personnel_domain_id)
      OR public.can_manage_organizational_scope(archdeaconry_id, parish_id, institution_id, department_id)));
CREATE POLICY employee_roles_update_scoped ON public.employee_roles
  FOR UPDATE TO authenticated
  USING (public.can_access_employee_placement(
    employee_id, personnel_domain_id, board_id, archdeaconry_id, parish_id, institution_id, department_id))
  WITH CHECK (public.can_manage_employee(employee_id)
    AND (public.can_manage_personnel_domain(personnel_domain_id)
      OR public.can_manage_organizational_scope(archdeaconry_id, parish_id, institution_id, department_id)));

DROP POLICY IF EXISTS vacancies_read_authorized ON public.vacancies;
DROP POLICY IF EXISTS vacancies_insert_authorized ON public.vacancies;
DROP POLICY IF EXISTS vacancies_update_authorized ON public.vacancies;
CREATE POLICY vacancies_read_authorized ON public.vacancies
  FOR SELECT TO authenticated USING (public.can_manage_personnel_domain(personnel_domain_id));
CREATE POLICY vacancies_insert_authorized ON public.vacancies
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_personnel_domain(personnel_domain_id));
CREATE POLICY vacancies_update_authorized ON public.vacancies
  FOR UPDATE TO authenticated
  USING (public.can_manage_personnel_domain(personnel_domain_id))
  WITH CHECK (public.can_manage_personnel_domain(personnel_domain_id));

DROP POLICY IF EXISTS applicants_read_authorized ON public.applicants;
DROP POLICY IF EXISTS applicants_insert_authorized ON public.applicants;
DROP POLICY IF EXISTS applicants_update_authorized ON public.applicants;
DROP POLICY IF EXISTS applicants_delete_central_hr ON public.applicants;
CREATE POLICY applicants_read_authorized ON public.applicants
  FOR SELECT TO authenticated
  USING (vacancy_id IS NOT NULL AND public.can_access_vacancy(vacancy_id));
CREATE POLICY applicants_insert_authorized ON public.applicants
  FOR INSERT TO authenticated
  WITH CHECK (vacancy_id IS NOT NULL AND public.can_access_vacancy(vacancy_id));
CREATE POLICY applicants_update_authorized ON public.applicants
  FOR UPDATE TO authenticated
  USING (vacancy_id IS NOT NULL AND public.can_access_vacancy(vacancy_id))
  WITH CHECK (vacancy_id IS NOT NULL AND public.can_access_vacancy(vacancy_id));

DROP POLICY IF EXISTS recruitment_applications_read_authorized ON public.recruitment_applications;
DROP POLICY IF EXISTS recruitment_applications_insert_authorized ON public.recruitment_applications;
DROP POLICY IF EXISTS recruitment_applications_update_authorized ON public.recruitment_applications;
DROP POLICY IF EXISTS recruitment_applications_delete_central_hr ON public.recruitment_applications;
CREATE POLICY recruitment_applications_read_authorized ON public.recruitment_applications
  FOR SELECT TO authenticated USING (public.can_access_vacancy(vacancy_id));
CREATE POLICY recruitment_applications_insert_authorized ON public.recruitment_applications
  FOR INSERT TO authenticated WITH CHECK (public.can_access_vacancy(vacancy_id));
CREATE POLICY recruitment_applications_update_authorized ON public.recruitment_applications
  FOR UPDATE TO authenticated
  USING (public.can_access_vacancy(vacancy_id))
  WITH CHECK (public.can_access_vacancy(vacancy_id));

-- Workspace creation is one transaction: the employee and first placement are
-- created together, and the target owner is checked on the server.
CREATE OR REPLACE FUNCTION public.create_employee_in_personnel_domain(
  employee_data JSONB,
  target_domain_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
DECLARE
  new_employee_id UUID;
  domain_board_id UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_personnel_domain(target_domain_id) THEN
    RAISE EXCEPTION 'Not authorized to create staff in this personnel domain.' USING ERRCODE = '42501';
  END IF;
  IF (employee_data - ARRAY[
    'employee_id', 'employee_number', 'title', 'first_name', 'middle_name',
    'last_name', 'gender', 'email', 'telephone', 'employee_category'
  ]) <> '{}'::JSONB THEN
    RAISE EXCEPTION 'The employee payload includes unsupported or protected fields.' USING ERRCODE = '22023';
  END IF;

  SELECT domain.board_id INTO domain_board_id
  FROM public.personnel_domains AS domain
  WHERE domain.id = target_domain_id AND domain.is_active IS TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Personnel domain is not active.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.employees (
    employee_id, employee_number, title, first_name, middle_name, last_name,
    gender, email, telephone, employee_category
  ) VALUES (
    NULLIF(employee_data->>'employee_id', ''),
    NULLIF(employee_data->>'employee_number', ''),
    COALESCE(NULLIF(employee_data->>'title', ''), 'Mr'),
    NULLIF(employee_data->>'first_name', ''),
    NULLIF(employee_data->>'middle_name', ''),
    NULLIF(employee_data->>'last_name', ''),
    NULLIF(employee_data->>'gender', ''),
    NULLIF(employee_data->>'email', ''),
    NULLIF(employee_data->>'telephone', ''),
    NULLIF(employee_data->>'employee_category', '')
  ) RETURNING id INTO new_employee_id;

  INSERT INTO public.assignments (
    employee_id, personnel_domain_id, board_id, assignment_type,
    is_primary, is_additional, start_date, status
  ) VALUES (
    new_employee_id, target_domain_id, domain_board_id, 'Permanent', TRUE, FALSE,
    CURRENT_DATE, 'Active'
  );

  RETURN new_employee_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.can_manage_personnel_domain(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_confidential_employee(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_confidential_personnel() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_finance_employee(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_document(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_employee_placement(UUID, UUID, UUID, UUID, UUID, UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.count_personnel_domain_records(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_employee_in_personnel_domain(JSONB, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_personnel_domain(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_confidential_employee(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_confidential_personnel() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_finance_employee(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_document(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_employee_placement(UUID, UUID, UUID, UUID, UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_personnel_domain_records(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_employee_in_personnel_domain(JSONB, UUID) TO authenticated;

CREATE TABLE IF NOT EXISTS public.employee_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  previous_assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE RESTRICT,
  new_assignment_id UUID REFERENCES public.assignments(id) ON DELETE RESTRICT,
  previous_domain_id UUID NOT NULL REFERENCES public.personnel_domains(id) ON DELETE RESTRICT,
  new_domain_id UUID NOT NULL REFERENCES public.personnel_domains(id) ON DELETE RESTRICT,
  effective_date DATE NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Completed')),
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  authority TEXT,
  reference_number TEXT,
  supporting_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  responsible_officer_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT employee_transfers_domains_differ CHECK (previous_domain_id <> new_domain_id)
);
ALTER TABLE public.employee_transfers ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.employee_transfers TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.employee_transfers FROM authenticated;
CREATE INDEX IF NOT EXISTS idx_employee_transfers_employee_date
  ON public.employee_transfers (employee_id, effective_date DESC);
CREATE POLICY employee_transfers_read_scoped ON public.employee_transfers
  FOR SELECT TO authenticated USING (
    public.can_manage_personnel_domain(previous_domain_id)
    OR public.can_manage_personnel_domain(new_domain_id)
  );
CREATE POLICY employee_transfers_insert_scoped ON public.employee_transfers
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.can_manage_employee(employee_id)
    AND public.can_manage_personnel_domain(previous_domain_id)
    AND previous_assignment_id <> new_assignment_id
  );
CREATE POLICY employee_transfers_update_scoped ON public.employee_transfers
  FOR UPDATE TO authenticated
  USING (FALSE)
  WITH CHECK (FALSE);

CREATE TRIGGER audit_employee_transfers_change
  AFTER INSERT OR UPDATE OR DELETE ON public.employee_transfers
  FOR EACH ROW EXECUTE FUNCTION public.log_row_change();

CREATE OR REPLACE FUNCTION public.request_employee_transfer(
  source_assignment_id UUID,
  target_domain_id UUID,
  effective_date DATE,
  transfer_reason TEXT,
  assignment_details JSONB DEFAULT '{}'::JSONB,
  transfer_authority TEXT DEFAULT NULL,
  transfer_reference TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
DECLARE
  source_row public.assignments%ROWTYPE;
  target_domain public.personnel_domains%ROWTYPE;
  next_assignment_id UUID;
  new_transfer_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO source_row FROM public.assignments
  WHERE id = source_assignment_id
    AND status IN ('Active', 'OnLeave')
    AND start_date <= CURRENT_DATE
    AND (end_date IS NULL OR end_date >= CURRENT_DATE)
  FOR UPDATE;
  IF NOT FOUND OR NOT public.can_manage_employee(source_row.employee_id)
      OR NOT public.can_manage_personnel_domain(source_row.personnel_domain_id) THEN
    RAISE EXCEPTION 'The source assignment is not within your personnel scope.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO target_domain FROM public.personnel_domains
  WHERE id = target_domain_id AND is_active IS TRUE;
  IF NOT FOUND OR target_domain_id = source_row.personnel_domain_id THEN
    RAISE EXCEPTION 'Choose a different active personnel domain.' USING ERRCODE = '22023';
  END IF;
  IF effective_date <= CURRENT_DATE OR NULLIF(BTRIM(transfer_reason), '') IS NULL THEN
    RAISE EXCEPTION 'The effective date must be in the future and a reason is required.' USING ERRCODE = '22023';
  END IF;
  IF (assignment_details - ARRAY[
    'department_id', 'institution_id', 'position_id', 'grade_id', 'supervisor_id', 'assignment_type'
  ]) <> '{}'::JSONB THEN
    RAISE EXCEPTION 'The proposed assignment contains unsupported fields.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.employee_transfers (
    employee_id, previous_assignment_id, new_assignment_id,
    previous_domain_id, new_domain_id, effective_date, reason, status,
    authority, reference_number, responsible_officer_id, created_by
  ) VALUES (
    source_row.employee_id, source_row.id, NULL,
    source_row.personnel_domain_id, target_domain.id, effective_date, transfer_reason, 'Pending',
    transfer_authority, transfer_reference, public.current_user_employee_id(), auth.uid()
  ) RETURNING id INTO new_transfer_id;

  INSERT INTO public.assignments (
    employee_id, personnel_domain_id, board_id, department_id, institution_id,
    position_id, grade_id, supervisor_id, assignment_type, is_primary,
    is_additional, start_date, status, reference_number
  ) VALUES (
    source_row.employee_id, target_domain.id, target_domain.board_id,
    NULLIF(assignment_details->>'department_id', '')::UUID,
    NULLIF(assignment_details->>'institution_id', '')::UUID,
    NULLIF(assignment_details->>'position_id', '')::UUID,
    NULLIF(assignment_details->>'grade_id', '')::UUID,
    NULLIF(assignment_details->>'supervisor_id', '')::UUID,
    COALESCE(NULLIF(assignment_details->>'assignment_type', ''), source_row.assignment_type),
    TRUE, FALSE, effective_date, 'Active', transfer_reference
  ) RETURNING id INTO next_assignment_id;

  UPDATE public.employee_transfers
  SET new_assignment_id = next_assignment_id, updated_at = NOW()
  WHERE id = new_transfer_id;

  RETURN new_transfer_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_employee_transfer(target_transfer_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
DECLARE
  transfer_row public.employee_transfers%ROWTYPE;
  previous_assignment public.assignments%ROWTYPE;
  next_assignment public.assignments%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO transfer_row
  FROM public.employee_transfers
  WHERE id = target_transfer_id AND status = 'Pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The pending transfer was not found.' USING ERRCODE = 'P0002';
  END IF;
  IF transfer_row.created_by = auth.uid() THEN
    RAISE EXCEPTION 'A transfer must be approved by a different officer.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_manage_personnel_domain(transfer_row.new_domain_id) THEN
    RAISE EXCEPTION 'The receiving personnel domain must approve this transfer.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO previous_assignment FROM public.assignments
  WHERE id = transfer_row.previous_assignment_id
    AND employee_id = transfer_row.employee_id
    AND personnel_domain_id = transfer_row.previous_domain_id
  FOR UPDATE;
  SELECT * INTO next_assignment FROM public.assignments
  WHERE id = transfer_row.new_assignment_id
    AND employee_id = transfer_row.employee_id
    AND personnel_domain_id = transfer_row.new_domain_id
  FOR UPDATE;
  IF previous_assignment.id IS NULL OR next_assignment.id IS NULL
      OR previous_assignment.status NOT IN ('Active', 'OnLeave')
      OR next_assignment.start_date::DATE <> transfer_row.effective_date
      OR previous_assignment.start_date::DATE >= transfer_row.effective_date THEN
    RAISE EXCEPTION 'The transfer assignments or effective date are invalid.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.assignments
  SET end_date = transfer_row.effective_date - 1,
      updatedat = NOW()
  WHERE id = previous_assignment.id;
  UPDATE public.employee_transfers
  SET status = 'Approved', approved_by = auth.uid(), updated_at = NOW()
  WHERE id = transfer_row.id;

  RETURN transfer_row.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_employee_transfer(target_transfer_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $function$
DECLARE
  transfer_row public.employee_transfers%ROWTYPE;
  changed_rows INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO transfer_row FROM public.employee_transfers
  WHERE id = target_transfer_id AND status = 'Approved'
  FOR UPDATE;
  IF NOT FOUND OR CURRENT_DATE < transfer_row.effective_date THEN
    RAISE EXCEPTION 'Only an approved transfer on or after its effective date can be completed.' USING ERRCODE = '22023';
  END IF;
  IF NOT (public.can_manage_personnel_domain(transfer_row.previous_domain_id)
      OR public.can_manage_personnel_domain(transfer_row.new_domain_id)) THEN
    RAISE EXCEPTION 'This transfer is outside your personnel scope.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.assignments
  SET status = 'Completed', updatedat = NOW()
  WHERE id = transfer_row.previous_assignment_id
    AND employee_id = transfer_row.employee_id
    AND personnel_domain_id = transfer_row.previous_domain_id
    AND end_date = transfer_row.effective_date - 1;
  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  IF changed_rows <> 1 THEN
    RAISE EXCEPTION 'The previous assignment no longer matches this transfer.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.employee_transfers
  SET status = 'Completed', updated_at = NOW()
  WHERE id = transfer_row.id;
  RETURN transfer_row.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.request_employee_transfer(UUID, UUID, DATE, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_employee_transfer(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_employee_transfer(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_employee_transfer(UUID, UUID, DATE, TEXT, JSONB, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_employee_transfer(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_employee_transfer(UUID) TO authenticated;

COMMIT;
