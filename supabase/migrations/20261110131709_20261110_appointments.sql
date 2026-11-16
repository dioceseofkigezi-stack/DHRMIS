-- DHRMIS Migration 10: Appointments & Promotions Tables

-- PostgreSQL schema for Supabase backend

-- Appointments Table
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  previous_position TEXT,
  new_position TEXT NOT NULL,
  previous_grade_id UUID REFERENCES grades(id) ON DELETE SET NULL,
  new_grade_id UUID REFERENCES grades(id) ON DELETE SET NULL,
  effective_date TIMESTAMPTZ NOT NULL,
  authority TEXT NOT NULL,
  reference_number TEXT,
  appointment_letter_id UUID,
  supporting_document_id UUID,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Completed')),
  approved_by UUID REFERENCES auth.users(id),
  approval_date TIMESTAMPTZ,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Index for appointments
CREATE INDEX IF NOT EXISTS idx_appointments_employee_id ON appointments(employee_id);
CREATE INDEX IF NOT EXISTS idx_appointments_effective_date ON appointments(effective_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

-- Promotions are handled as a special case of appointments with status 'Promoted'
-- No separate table needed - use appointments with promotion-specific status handling