-- DHRMIS Migration 14: Discipline Tables

-- PostgreSQL schema for Supabase backend

-- Disciplinary Cases Table
CREATE TABLE IF NOT EXISTS disciplinary_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number TEXT UNIQUE NOT NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  nature_of_issue TEXT NOT NULL,
  date_opened TIMESTAMPTZ NOT NULL,
  investigation_details TEXT,
  hearing_details TEXT,
  decision TEXT,
  sanction TEXT,
  appeal_details TEXT,
  final_outcome TEXT,
  documents JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'UnderInvestigation', 'HearingScheduled', 'DecisionMade', 'Appealed', 'Closed', 'Reopened')),
  closure_date TIMESTAMPTZ,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE disciplinary_cases ENABLE ROW LEVEL SECURITY;

-- Index for discipline
CREATE INDEX IF NOT EXISTS idx_disciplinary_cases_employee_id ON disciplinary_cases(employee_id);
CREATE INDEX IF NOT EXISTS idx_disciplinary_cases_case_number ON disciplinary_cases(case_number);
CREATE INDEX IF NOT EXISTS idx_disciplinary_cases_status ON disciplinary_cases(status);

-- Safeguarding Cases Table
CREATE TABLE IF NOT EXISTS safeguarding_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number TEXT UNIQUE NOT NULL,
  allegation_type TEXT NOT NULL CHECK (allegation_type IN ('ChildProtection', 'Abuse', 'SexualMisconduct', 'Exploitation', 'Neglect', 'Harassment', 'Other')),
  date_reported TIMESTAMPTZ NOT NULL,
  reporter_id UUID REFERENCES auth.users(id),
  subject_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  affected_person_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  risk_classification TEXT NOT NULL DEFAULT 'Low' CHECK (risk_classification IN ('Low', 'Medium', 'High', 'Critical')),
  immediate_action TEXT,
  investigation_details TEXT,
  referral_details TEXT,
  decision TEXT,
  outcome TEXT,
  restrictions TEXT,
  appeal_review TEXT,
  closure_details TEXT,
  evidence JSONB DEFAULT '[]'::jsonb,
  access_classification TEXT NOT NULL DEFAULT 'Restricted' CHECK (access_classification IN ('Restricted', 'Confidential', 'UltraConfidential')),
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'UnderInvestigation', 'Referred', 'DecisionMade', 'OutcomeReached', 'Reviewed', 'Closed', 'Reopened')),
  closure_date TIMESTAMPTZ,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE safeguarding_cases ENABLE ROW LEVEL SECURITY;

-- Index for safeguarding - highly restricted access
CREATE INDEX IF NOT EXISTS idx_safeguarding_cases_case_number ON safeguarding_cases(case_number);
CREATE INDEX IF NOT EXISTS idx_safeguarding_cases_allegation_type ON safeguarding_cases(allegation_type);
CREATE INDEX IF NOT EXISTS idx_safeguarding_cases_risk ON safeguarding_cases(risk_classification);
CREATE INDEX IF NOT EXISTS idx_safeguarding_cases_status ON safeguarding_cases(status);
CREATE INDEX IF NOT EXISTS idx_safeguarding_cases_subject ON safeguarding_cases(subject_id);
CREATE INDEX IF NOT EXISTS idx_safeguarding_cases_affected ON safeguarding_cases(affected_person_id);

-- Employee Death Records Table
CREATE TABLE IF NOT EXISTS employee_death_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  reported_death_date TIMESTAMPTZ,
  confirmed_death_date TIMESTAMPTZ,
  place_of_death TEXT,
  cause_of_death TEXT,
  death_certificate_reference TEXT,
  supporting_document_id UUID,
  reporter_id UUID REFERENCES auth.users(id) NOT NULL,
  first_verifier_id UUID REFERENCES employees(id) NOT NULL,
  first_verification_date TIMESTAMPTZ,
  second_verifier_id UUID REFERENCES employees(id),
  second_verification_date TIMESTAMPTZ,
  verification_status TEXT NOT NULL DEFAULT 'Pending' CHECK (verification_status IN ('Pending', 'FirstVerification', 'SecondVerification', 'Passed', 'Failed')),
  reversal_status TEXT NOT NULL DEFAULT 'None' CHECK (reversal_status IN ('None', 'Reversible', 'ReversiblePending', 'Reversed', 'Finalized')),
  reversal_reason TEXT,
  approving_authority TEXT,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE employee_death_records ENABLE ROW LEVEL SECURITY;

-- Index for death records - extremely restricted access
CREATE INDEX IF NOT EXISTS idx_employee_death_records_employee_id ON employee_death_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_death_records_verification_status ON employee_death_records(verification_status);
CREATE INDEX IF NOT EXISTS idx_employee_death_records_reversal ON employee_death_records(reversal_status);