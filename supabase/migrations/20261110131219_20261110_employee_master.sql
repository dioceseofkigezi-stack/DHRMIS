-- DHRMIS Migration 4: Employee Master Tables

-- PostgreSQL schema for Supabase backend

-- Employee Table (Central Master)
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id TEXT UNIQUE NOT NULL, -- Permanent Employee ID
  employee_number TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL DEFAULT 'Mr',
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  alternative_names TEXT,
  gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female', 'Other', 'PreferNotToSay')),
  date_of_birth TIMESTAMPTZ,
  place_of_birth TEXT,
  nationality TEXT,
  national_id TEXT,
  passport_number TEXT,
  telephone TEXT,
  email TEXT NOT NULL,
  address TEXT,
  emergency_contact_name TEXT,
  emergency_contact_telephone TEXT,
  emergency_contact_relationship TEXT,
  employee_category TEXT NOT NULL CHECK (employee_category IN (
    'Clergy', 'Catechist', 'LayStaff', 'InstitutionalStaff', 'Contract', 'Volunteer'
  )),
  life_status TEXT NOT NULL DEFAULT 'Alive' CHECK (life_status IN ('Alive', 'Deceased', 'UnknownNotConfirmed')),
  date_of_death TIMESTAMPTZ,
  date_of_separation TIMESTAMPTZ,
  employment_status TEXT NOT NULL DEFAULT 'Active' CHECK (employment_status IN (
    'Active', 'Retired', 'Resigned', 'Separated', 'DeceasedActive', 'OnLeave', 'Suspended'
  )),
  photo_id UUID,
  archived_at TIMESTAMPTZ,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- Indexes for Employee lookups
CREATE INDEX IF NOT EXISTS idx_employees_employee_id ON employees(employee_id);
CREATE INDEX IF NOT EXISTS idx_employees_national_id ON employees(national_id) WHERE national_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email);
CREATE INDEX IF NOT EXISTS idx_employees_life_status ON employees(life_status);
CREATE INDEX IF NOT EXISTS idx_employees_employment_status ON employees(employment_status);

-- Employee Personal Details Table (for enhanced access restrictions)
CREATE TABLE IF NOT EXISTS personal_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  title TEXT,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  alternative_names TEXT,
  gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female', 'Other', 'PreferNotToSay')),
  date_of_birth TIMESTAMPTZ,
  place_of_birth TEXT,
  nationality TEXT,
  national_id TEXT,
  passport_number TEXT,
  telephone TEXT,
  email TEXT NOT NULL,
  address TEXT,
  isSensitive BOOLEAN DEFAULT TRUE,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE personal_details ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_personal_details_employee_id ON personal_details(employee_id);