-- DHRMIS Migration 7: Professional Development Tables

-- PostgreSQL schema for Supabase backend

-- Qualification Table
CREATE TABLE IF NOT EXISTS qualifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  qualification TEXT NOT NULL,
  course TEXT NOT NULL,
  institution TEXT NOT NULL,
  location TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  completion_date TIMESTAMPTZ,
  award TEXT,
  grade TEXT,
  certificate_number TEXT,
  verification_status TEXT NOT NULL DEFAULT 'Pending' CHECK (verification_status IN ('Pending', 'Verified', 'NotVerified', 'Expired')),
  documents JSONB DEFAULT '[]'::jsonb,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE qualifications ENABLE ROW LEVEL SECURITY;

-- Index for qualifications
CREATE INDEX IF NOT EXISTS idx_qualifications_employee_id ON qualifications(employee_id);
CREATE INDEX IF NOT EXISTS idx_qualifications_verification_status ON qualifications(verification_status);

-- Training Records Table
CREATE TABLE IF NOT EXISTS training_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  training_programme TEXT NOT NULL,
  provider TEXT NOT NULL,
  course TEXT,
  date TIMESTAMPTZ NOT NULL,
  duration TEXT,
  certificate TEXT,
  required BOOLEAN DEFAULT TRUE,
  outcome TEXT,
  renewal_due_date TIMESTAMPTZ,
  cpd_credits INTEGER DEFAULT 0,
  documents JSONB DEFAULT '[]'::jsonb,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE training_records ENABLE ROW LEVEL SECURITY;

-- Index for training
CREATE INDEX IF NOT EXISTS idx_training_records_employee_id ON training_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_training_records_renewal_date ON training_records(renewal_due_date);

-- Professional Licence Table
CREATE TABLE IF NOT EXISTS professional_licences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  professional_body TEXT NOT NULL,
  registration_number TEXT NOT NULL,
  licence_number TEXT NOT NULL,
  issue_date TIMESTAMPTZ NOT NULL,
  expiry_date TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Expired', 'PendingRenewal', 'Suspended', 'Revoked')),
  certificate TEXT,
  verification_status TEXT NOT NULL DEFAULT 'Pending' CHECK (verification_status IN ('Pending', 'Verified', 'NotVerified')),
  renewal_due_date TIMESTAMPTZ NOT NULL,
  documents JSONB DEFAULT '[]'::jsonb,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE professional_licences ENABLE ROW LEVEL SECURITY;

-- Index for professional licences - critical for expiry notifications
CREATE INDEX IF NOT EXISTS idx_professional_licences_employee_id ON professional_licences(employee_id);
CREATE INDEX IF NOT EXISTS idx_professional_licences_expiry_date ON professional_licences(expiry_date);
CREATE INDEX IF NOT EXISTS idx_professional_licences_status ON professional_licences(status);