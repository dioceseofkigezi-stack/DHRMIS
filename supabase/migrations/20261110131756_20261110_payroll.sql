-- DHRMIS Migration 11: Payroll & Benefits Tables

-- PostgreSQL schema for Supabase backend

-- Payroll Records Table
CREATE TABLE IF NOT EXISTS payroll_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  payroll_period TEXT NOT NULL,
  basic_salary NUMERIC(12, 2) DEFAULT 0,
  allowances NUMERIC(12, 2) DEFAULT 0,
  benefits NUMERIC(12, 2) DEFAULT 0,
  deductions NUMERIC(12, 2) DEFAULT 0,
  net_pay NUMERIC(12, 2) DEFAULT 0,
  bank_account_id TEXT,
  payment_method TEXT NOT NULL DEFAULT 'BankTransfer' CHECK (payment_method IN ('BankTransfer', 'Checks', 'Cash')),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Processed', 'Failed', 'Cancelled')),
  processed_at TIMESTAMPTZ,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY;

-- Index for payroll - highly restricted access
CREATE INDEX IF NOT EXISTS idx_payroll_records_employee_id ON payroll_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_records_period ON payroll_records(payroll_period);

-- Benefits Table
CREATE TABLE IF NOT EXISTS benefits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  benefit_name TEXT NOT NULL,
  benefit_type TEXT NOT NULL DEFAULT 'Salary' CHECK (benefit_type IN ('Salary', 'Allowance', 'Other')),
  amount NUMERIC(12, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  effective_date TIMESTAMPTZ NOT NULL,
  expiry_date TIMESTAMPTZ,
  remarks TEXT,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE benefits ENABLE ROW LEVEL SECURITY;

-- Index for benefits
CREATE INDEX IF NOT EXISTS idx_benefits_employee_id ON benefits(employee_id);
CREATE INDEX IF NOT EXISTS idx_benefits_active ON benefits(is_active);