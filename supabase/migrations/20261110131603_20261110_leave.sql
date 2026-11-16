-- DHRMIS Migration 8: Leave Management Tables

-- PostgreSQL schema for Supabase backend

-- Leave Records Table
CREATE TABLE IF NOT EXISTS leave_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL CHECK (leave_type IN ('Annual', 'Sick', 'Maternity', 'Paternity', 'Compassionate', 'Study', 'Sabbatical', 'Other')),
  period TEXT,
  entitlement_days INTEGER DEFAULT 0,
  taken_days INTEGER DEFAULT 0,
  balance_days INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Requested' CHECK (status IN ('Requested', 'Approved', 'Rejected', 'Cancelled', 'Pending')),
  approved_by UUID REFERENCES auth.users(id),
  approval_date TIMESTAMPTZ,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  reason TEXT,
  documents JSONB DEFAULT '[]'::jsonb,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE leave_records ENABLE ROW LEVEL SECURITY;

-- Index for leave
CREATE INDEX IF NOT EXISTS idx_leave_records_employee_id ON leave_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_records_status ON leave_records(status);
CREATE INDEX IF NOT EXISTS idx_leave_records_dates ON leave_records(start_date, end_date);