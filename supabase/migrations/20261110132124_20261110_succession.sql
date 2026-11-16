-- DHRMIS Migration 18: Succession Planning Tables

-- PostgreSQL schema for Supabase backend

-- Succession Records Table
CREATE TABLE IF NOT EXISTS succession_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  position_id UUID REFERENCES positions(id) ON DELETE SET NULL,
  position_title TEXT NOT NULL,
  current_status TEXT NOT NULL DEFAULT 'Active' CHECK (current_status IN ('Active', 'Retiring', 'Retired', 'Resigning', 'Terminated')),
  estimated_retirement_date TIMESTAMPTZ,
  vacancy_id UUID REFERENCES vacancies(id) ON DELETE SET NULL,
  critical BOOLEAN DEFAULT FALSE,
  potential_successors TEXT,
  qualification_requirements TEXT,
  staffing_gaps TEXT,
  recruitment_required BOOLEAN DEFAULT TRUE,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE succession_records ENABLE ROW LEVEL SECURITY;

-- Index for succession
CREATE INDEX IF NOT EXISTS idx_succession_records_employee_id ON succession_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_succession_records_critical ON succession_records(critical);