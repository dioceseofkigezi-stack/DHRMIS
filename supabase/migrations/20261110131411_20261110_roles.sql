-- DHRMIS Migration 5b: Roles & Acting Appointments Tables

-- PostgreSQL schema for Supabase backend

-- Employee Roles Table
CREATE TABLE IF NOT EXISTS employee_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  role_type TEXT NOT NULL CHECK (role_type IN ('Position', 'Office', 'Role', 'Coordinator', 'Chaplaincy', 'Committee', 'WorkingGroup', 'BoardMember')),
  is_primary BOOLEAN DEFAULT TRUE,
  is_additional BOOLEAN DEFAULT FALSE,
  board_id UUID REFERENCES boards(id) ON DELETE SET NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
  archdeaconry_id UUID REFERENCES archdeaconries(id) ON DELETE SET NULL,
  parish_id UUID REFERENCES parishes(id) ON DELETE SET NULL,
  local_church_id UUID REFERENCES local_churches(id) ON DELETE SET NULL,

  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  authority TEXT,
  reference_number TEXT,
  supervisor_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Completed', 'Terminated')),
  remarks TEXT,

  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE employee_roles ENABLE ROW LEVEL SECURITY;

-- Indexes for Employee Roles lookups
CREATE INDEX IF NOT EXISTS idx_employee_roles_employee_id ON employee_roles(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_roles_role_type ON employee_roles(role_type);
CREATE INDEX IF NOT EXISTS idx_employee_roles_is_primary ON employee_roles(is_primary);

-- Acting Appointments Table
CREATE TABLE IF NOT EXISTS acting_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  acting_for_position_id UUID REFERENCES positions(id) ON DELETE SET NULL,
  acting_for_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  authority TEXT NOT NULL,
  reference_number TEXT,
  supporting_document_id UUID,
  is_active BOOLEAN DEFAULT TRUE,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE acting_appointments ENABLE ROW LEVEL SECURITY;

-- Indexes for Acting Appointments
CREATE INDEX IF NOT EXISTS idx_acting_appointments_employee_id ON acting_appointments(employee_id);
CREATE INDEX IF NOT EXISTS idx_acting_appointments_is_active ON acting_appointments(is_active);
CREATE INDEX IF NOT EXISTS idx_acting_appointments_dates ON acting_appointments(start_date, end_date);

-- Delegation Table
CREATE TABLE IF NOT EXISTS delegations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delegator_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  delegate_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  scope TEXT NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  reason TEXT,
  approved_by UUID REFERENCES auth.users(id),
  approval_date TIMESTAMPTZ,
  is_expired BOOLEAN DEFAULT FALSE,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT
);

ALTER TABLE delegations ENABLE ROW LEVEL SECURITY;

-- Indexes for Delegation
CREATE INDEX IF NOT EXISTS idx_delegations_delegator_id ON delegations(delegator_id);
CREATE INDEX IF NOT EXISTS idx_delegations_delegate_id ON delegations(delegate_id);
CREATE INDEX IF NOT EXISTS idx_delegations_start_date ON delegations(start_date);
CREATE INDEX IF NOT EXISTS idx_delegations_end_date ON delegations(end_date);
CREATE INDEX IF NOT EXISTS idx_delegations_is_expired ON delegations(is_expired);