-- DHRMIS Migration 13: Retirement Tables

-- PostgreSQL schema for Supabase backend

-- Retirement Records Table
CREATE TABLE IF NOT EXISTS retirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  retirement_type TEXT NOT NULL CHECK (retirement_type IN ('Normal', 'Early', 'Compassionate', 'ForceRetirement')),
  eligible_date TIMESTAMPTZ NOT NULL,
  applied_date TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  approval_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Completed', 'Processing')),
  effective_date TIMESTAMPTZ,
  retirement_documents JSONB DEFAULT '[]'::jsonb,
  remarks TEXT,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE retirements ENABLE ROW LEVEL SECURITY;

-- Index for retirement
CREATE INDEX IF NOT EXISTS idx_retirements_employee_id ON retirements(employee_id);
CREATE INDEX IF NOT EXISTS idx_retirements_status ON retirements(status);
CREATE INDEX IF NOT EXISTS idx_retirements_eligible_date ON retirements(eligible_date);

-- Early Retirement Applications Table
CREATE TABLE IF NOT EXISTS early_retirement_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  application_date TIMESTAMPTZ NOT NULL,
  reason TEXT,
  eligible_years_left INTEGER,
  documents JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'Submitted' CHECK (status IN ('Submitted', 'UnderReview', 'Recommended', 'Approved', 'Rejected', 'Completed')),
  reviewer UUID REFERENCES employees(id),
  review_comments TEXT,
  requested_effective_date TIMESTAMPTZ,
  final_decision_date TIMESTAMPTZ,
  approver_level TEXT,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE early_retirement_applications ENABLE ROW LEVEL SECURITY;

-- Index for early retirement
CREATE INDEX IF NOT EXISTS idx_early_retirement_applications_employee_id ON early_retirement_applications(employee_id);
CREATE INDEX IF NOT EXISTS idx_early_retirement_applications_status ON early_retirement_applications(status);