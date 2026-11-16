-- DHRMIS Migration 5a: Assignments Table

-- PostgreSQL schema for Supabase backend

-- Assignment Table
CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  board_id UUID REFERENCES boards(id) ON DELETE SET NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
  archdeaconry_id UUID REFERENCES archdeaconries(id) ON DELETE SET NULL,
  parish_id UUID REFERENCES parishes(id) ON DELETE SET NULL,
  local_church_id UUID REFERENCES local_churches(id) ON DELETE SET NULL,
  position_id UUID REFERENCES positions(id) ON DELETE SET NULL,
  grade_id UUID REFERENCES grades(id) ON DELETE SET NULL,
  supervisor_id UUID REFERENCES employees(id) ON DELETE SET NULL,

  assignment_type TEXT NOT NULL CHECK (assignment_type IN ('Permanent', 'Temporary', 'Acting', 'Probation', 'Contract')),
  is_primary BOOLEAN DEFAULT TRUE,
  is_additional BOOLEAN DEFAULT FALSE,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'OnLeave', 'Suspended', 'Completed', 'Terminated')),
  reference_number TEXT,
  supporting_document_id UUID,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;

-- Indexes for Assignment lookups
CREATE INDEX IF NOT EXISTS idx_assignments_employee_id ON assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_assignments_board_id ON assignments(board_id);
CREATE INDEX IF NOT EXISTS idx_assignments_department_id ON assignments(department_id);
CREATE INDEX IF NOT EXISTS idx_assignments_institution_id ON assignments(institution_id);
CREATE INDEX IF NOT EXISTS idx_assignments_archdeaconry_id ON assignments(archdeaconry_id);
CREATE INDEX IF NOT EXISTS idx_assignments_parish_id ON assignments(parish_id);
CREATE INDEX IF NOT EXISTS idx_assignments_local_church_id ON assignments(local_church_id);
CREATE INDEX IF NOT EXISTS idx_assignments_position_id ON assignments(position_id);
CREATE INDEX IF NOT EXISTS idx_assignments_grade_id ON assignments(grade_id);
CREATE INDEX IF NOT EXISTS idx_assignments_start_date ON assignments(start_date);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON assignments(status);
CREATE INDEX IF NOT EXISTS idx_assignments_active_primary ON assignments(employee_id, is_primary, status) WHERE status = 'Active';