-- DHRMIS Migration 9: Performance & Appraisal Tables

-- PostgreSQL schema for Supabase backend

-- Performance Appraisals Table
CREATE TABLE IF NOT EXISTS performance_appraisals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  appraisal_period TEXT NOT NULL,
  objectives JSONB DEFAULT '[]'::jsonb,
  kpis JSONB DEFAULT '[]'::jsonb,
  supervisor_assessment TEXT,
  employee_comments TEXT,
  development_needs JSONB DEFAULT '[]'::jsonb,
  recommendations TEXT,
  performance_improvement_plan TEXT,
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'InProgress', 'Submitted', 'Approved', 'Rejected', 'Completed')),
  supervisor_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id),
  approval_date TIMESTAMPTZ,
  effective_date TIMESTAMPTZ,
  documents JSONB DEFAULT '[]'::jsonb,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE performance_appraisals ENABLE ROW LEVEL SECURITY;

-- Index for appraisals
CREATE INDEX IF NOT EXISTS idx_performance_appraisals_employee_id ON performance_appraisals(employee_id);
CREATE INDEX IF NOT EXISTS idx_performance_appraisals_status ON performance_appraisals(status);
CREATE INDEX IF NOT EXISTS idx_performance_appraisals_period ON performance_appraisals(appraisal_period);