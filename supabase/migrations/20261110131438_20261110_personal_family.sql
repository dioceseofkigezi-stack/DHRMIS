-- DHRMIS Migration 6: Personal & Family Tables

-- PostgreSQL schema for Supabase backend

-- Spouse Table
CREATE TABLE IF NOT EXISTS spouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  date_of_birth TIMESTAMPTZ,
  identification TEXT,
  telephone TEXT,
  email TEXT,
  occupation TEXT,
  employer_business TEXT,
  address TEXT,
  marriage_date TIMESTAMPTZ,
  marriage_status TEXT NOT NULL CHECK (marriage_status IN ('Married', 'Single', 'Divorced', 'Widowed', 'Separated')),
  marriage_document_id UUID,
  is_emergency_contact BOOLEAN DEFAULT FALSE,
  remarks TEXT,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE spouses ENABLE ROW LEVEL SECURITY;

-- Index for spouse
CREATE INDEX IF NOT EXISTS idx_spouses_employee_id ON spouses(employee_id);

-- Child Table
CREATE TABLE IF NOT EXISTS children (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  date_of_birth TIMESTAMPTZ NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female', 'Other', 'PreferNotToSay')),
  relationship TEXT NOT NULL,
  identification TEXT,
  birth_certificate_number TEXT,
  school TEXT,
  education_level TEXT,
  is_depondant BOOLEAN DEFAULT TRUE,
  is_sensitive BOOLEAN DEFAULT TRUE,
  documents JSONB DEFAULT '[]'::jsonb,
  date_added TIMESTAMPTZ DEFAULT NOW(),
  remarks TEXT,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE children ENABLE ROW LEVEL SECURITY;

-- Index for child
CREATE INDEX IF NOT EXISTS idx_children_employee_id ON children(employee_id);

-- Next of Kin Table
CREATE TABLE IF NOT EXISTS next_of_kin (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  telephone TEXT,
  address TEXT,
  email TEXT,
  identification TEXT,
  priority INTEGER DEFAULT 1,
  is_emergency_contact BOOLEAN DEFAULT FALSE,
  is_beneficiary_contact BOOLEAN DEFAULT FALSE,
  effective_date TIMESTAMPTZ,
  verification_status TEXT NOT NULL DEFAULT 'Pending' CHECK (verification_status IN ('Pending', 'Verified', 'Expired')),
  verification_date TIMESTAMPTZ,
  verified_by UUID REFERENCES employees(id),
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

ALTER TABLE next_of_kin ENABLE ROW LEVEL SECURITY;

-- Index for next of kin
CREATE INDEX IF NOT EXISTS idx_next_of_kin_employee_id ON next_of_kin(employee_id);
CREATE INDEX IF NOT EXISTS idx_next_of_kin_verified ON next_of_kin(verification_status);