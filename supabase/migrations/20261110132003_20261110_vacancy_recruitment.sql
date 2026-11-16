-- DHRMIS Migration 17: Vacancy & Recruitment Tables

-- PostgreSQL schema for Supabase backend

-- Vacancies Table
CREATE TABLE IF NOT EXISTS vacancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vacancy_code TEXT UNIQUE NOT NULL,
  board_id UUID REFERENCES boards(id) ON DELETE SET NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
  position TEXT NOT NULL,
  grade_id UUID REFERENCES grades(id) ON DELETE SET NULL,
  location TEXT,
  position_type TEXT NOT NULL DEFAULT 'Permanent' CHECK (position_type IN ('Permanent', 'Temporary', 'Contract', 'Acting')),
  reporting_to UUID REFERENCES positions(id) ON DELETE SET NULL,
  vacancies INTEGER DEFAULT 1,
  salary_range TEXT,
  requirements TEXT,
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Closed', 'Filled', 'OnHold', 'Draft')),
  advertisement TEXT,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW(),
  expiry_date TIMESTAMPTZ
);

ALTER TABLE vacancies ENABLE ROW LEVEL SECURITY;

-- Index for vacancies
CREATE INDEX IF NOT EXISTS idx_vacancies_position ON vacancies(position);
CREATE INDEX IF NOT EXISTS idx_vacancies_status ON vacancies(status);
CREATE INDEX IF NOT EXISTS idx_vacancies_expiry_date ON vacancies(expiry_date);
CREATE INDEX IF NOT EXISTS idx_vacancies_board_id ON vacancies(board_id);

-- Applicants Table
CREATE TABLE IF NOT EXISTS applicants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vacancy_id UUID REFERENCES vacancies(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  alternative_names TEXT,
  email TEXT NOT NULL,
  telephone TEXT,
  address TEXT,
  date_of_birth TIMESTAMPTZ,
  gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female', 'Other', 'PreferNotToSay')),
  nationality TEXT,
  national_id TEXT,
  highest_qualification TEXT,
  work_experience TEXT,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'Applied' CHECK (status IN ('Applied', 'Screening', 'Interview', 'Selected', 'Rejected', 'Hired', 'Withdrawn')),
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE applicants ENABLE ROW LEVEL SECURITY;

-- Index for applicants
CREATE INDEX IF NOT EXISTS idx_applicants_vacancy_id ON applicants(vacancy_id);
CREATE INDEX IF NOT EXISTS idx_applicants_status ON applicants(status);
CREATE INDEX IF NOT EXISTS idx_applicants_email ON applicants(email);

-- Recruitment Applications Table
CREATE TABLE IF NOT EXISTS recruitment_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id UUID REFERENCES applicants(id) ON DELETE CASCADE,
  vacancy_id UUID REFERENCES vacancies(id) ON DELETE CASCADE,
  application_date TIMESTAMPTZ NOT NULL,
  stage TEXT NOT NULL DEFAULT 'Applied' CHECK (stage IN ('Applied', 'Screening', 'Interview', 'Selected', 'Hired')),
  screening_notes TEXT,
  interview_notes TEXT,
  selection_notes TEXT,
  status TEXT NOT NULL DEFAULT 'InProgress' CHECK (status IN ('InProgress', 'Approved', 'Rejected', 'Hired')),
  approved_by UUID REFERENCES auth.users(id),
  approval_date TIMESTAMPTZ,
  documents JSONB DEFAULT '[]'::jsonb,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE recruitment_applications ENABLE ROW LEVEL SECURITY;

-- Index for recruitment applications
CREATE INDEX IF NOT EXISTS idx_recruitment_applications_applicant_id ON recruitment_applications(applicant_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_applications_vacancy_id ON recruitment_applications(vacancy_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_applications_stage ON recruitment_applications(stage);