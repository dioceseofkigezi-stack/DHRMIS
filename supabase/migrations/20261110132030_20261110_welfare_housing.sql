-- DHRMIS Migration 16: Welfare & Housing Tables

-- PostgreSQL schema for Supabase backend

-- Welfare Records Table
CREATE TABLE IF NOT EXISTS welfare_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  membership_type TEXT NOT NULL,
  contributions NUMERIC(10, 2) DEFAULT 0,
  benefits TEXT,
  claims TEXT,
  assistance TEXT,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Pending', 'Approved', 'Disbursed', 'Cancelled')),
  approved_by UUID REFERENCES auth.users(id),
  approval_date TIMESTAMPTZ,
  documents JSONB DEFAULT '[]'::jsonb,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE welfare_records ENABLE ROW LEVEL SECURITY;

-- Index for welfare
CREATE INDEX IF NOT EXISTS idx_welfare_records_employee_id ON welfare_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_welfare_records_status ON welfare_records(status);

-- Property Assignments Table
CREATE TABLE IF NOT EXISTS property_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  property_reference TEXT NOT NULL,
  property_type TEXT NOT NULL CHECK (property_type IN ('House', 'Residence', 'Land', 'Other')),
  allocation_date TIMESTAMPTZ,
  occupancy_date TIMESTAMPTZ,
  condition TEXT,
  inventory TEXT,
  handover_date TIMESTAMPTZ,
  vacating_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'Allocated' CHECK (status IN ('Allocated', 'Occupied', 'Vacated', 'UnderMaintenance', 'Reserved')),
  handover_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  documents JSONB DEFAULT '[]'::jsonb,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE property_assignments ENABLE ROW LEVEL SECURITY;

-- Index for property assignments
CREATE INDEX IF NOT EXISTS idx_property_assignments_employee_id ON property_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_property_assignments_status ON property_assignments(status);