-- DHRMIS Migration 12: Pension Tables

-- PostgreSQL schema for Supabase backend

-- Pension Schemes Table
CREATE TABLE IF NOT EXISTS pension_schemes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  scheme_name TEXT NOT NULL,
  membership_number TEXT,
  employer_contribution NUMERIC(10, 2) DEFAULT 0,
  employee_contribution NUMERIC(10, 2) DEFAULT 0,
  retirement_eligibility_date TIMESTAMPTZ,
  pension_status TEXT NOT NULL DEFAULT 'Active' CHECK (pension_status IN ('Active', 'Retired', 'Suspended', 'Lapsed')),
  documentation JSONB DEFAULT '[]'::jsonb,
  beneficiary_next_of_kin_id UUID REFERENCES next_of_kin(id) ON DELETE SET NULL,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pension_schemes ENABLE ROW LEVEL SECURITY;

-- Index for pension
CREATE INDEX IF NOT EXISTS idx_pension_schemes_employee_id ON pension_schemes(employee_id);
CREATE INDEX IF NOT EXISTS idx_pension_schemes_status ON pension_schemes(pension_status);

-- Pension Contributions Table
CREATE TABLE IF NOT EXISTS pension_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  employer_contribution NUMERIC(10, 2) DEFAULT 0,
  employee_contribution NUMERIC(10, 2) DEFAULT 0,
  total_contribution NUMERIC(12, 2) DEFAULT 0,
  payment_date TIMESTAMPTZ,
  is_paid BOOLEAN DEFAULT FALSE,
  documentation JSONB DEFAULT '[]'::jsonb,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pension_contributions ENABLE ROW LEVEL SECURITY;

-- Index for pension contributions
CREATE INDEX IF NOT EXISTS idx_pension_contributions_employee_id ON pension_contributions(employee_id);
CREATE INDEX IF NOT EXISTS idx_pension_contributions_period ON pension_contributions(period);