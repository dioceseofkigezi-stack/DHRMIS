-- DHRMIS Migration 3: Organizational Hierarchy Tables

-- PostgreSQL schema for Supabase backend

-- Diocese Table
CREATE TABLE IF NOT EXISTS dioceses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  region TEXT,
  isActive BOOLEAN DEFAULT TRUE,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE dioceses ENABLE ROW LEVEL SECURITY;

-- Archdeaconry Table
CREATE TABLE IF NOT EXISTS archdeaconries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  diocese_id UUID REFERENCES dioceses(id) ON DELETE CASCADE,
  region TEXT,
  order_num INTEGER DEFAULT 0,
  isActive BOOLEAN DEFAULT TRUE,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE archdeaconries ENABLE ROW LEVEL SECURITY;

-- Parish Table
CREATE TABLE IF NOT EXISTS parishes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  archdeaconry_id UUID REFERENCES archdeaconries(id) ON DELETE CASCADE,
  region TEXT,
  isActive BOOLEAN DEFAULT TRUE,
  order_num INTEGER DEFAULT 0,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE parishes ENABLE ROW LEVEL SECURITY;

-- Local Church Table
CREATE TABLE IF NOT EXISTS local_churches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  parish_id UUID REFERENCES parishes(id) ON DELETE CASCADE,
  isSensitive BOOLEAN DEFAULT FALSE,
  isActive BOOLEAN DEFAULT TRUE,
  order_num INTEGER DEFAULT 0,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE local_churches ENABLE ROW LEVEL SECURITY;

-- Board Table
CREATE TABLE IF NOT EXISTS boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  isActive BOOLEAN DEFAULT TRUE,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE boards ENABLE ROW LEVEL SECURITY;

-- Department Table
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  board_id UUID REFERENCES boards(id) ON DELETE SET NULL,
  isSensitive BOOLEAN DEFAULT FALSE,
  isActive BOOLEAN DEFAULT TRUE,
  description TEXT,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

-- Institution Table
CREATE TABLE IF NOT EXISTS institutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  institution_type TEXT NOT NULL CHECK (institution_type IN (
    'PrimarySchool', 'SecondarySchool', 'TechnicalVocational', 'Hospital',
    'HealthCentre', 'MissionStation', 'DevelopmentProject', 'BusinessUnit',
    'Office', 'DiocesanCentre', 'Other'
  )),
  board_id UUID REFERENCES boards(id) ON DELETE SET NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  archdeaconry_id UUID REFERENCES archdeaconries(id) ON DELETE SET NULL,
  parish_id UUID REFERENCES parishes(id) ON DELETE SET NULL,
  location TEXT,
  isSensitive BOOLEAN DEFAULT TRUE,
  isActive BOOLEAN DEFAULT TRUE,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;

-- Grade Table
CREATE TABLE IF NOT EXISTS grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  board_id UUID REFERENCES boards(id) ON DELETE SET NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  salary_scale TEXT,
  description TEXT,
  isSensitive BOOLEAN DEFAULT FALSE,
  isActive BOOLEAN DEFAULT TRUE,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE grades ENABLE ROW LEVEL SECURITY;

-- Position Table
CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  board_id UUID REFERENCES boards(id) ON DELETE SET NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  grade_id UUID REFERENCES grades(id) ON DELETE SET NULL,
  isSupervisory BOOLEAN DEFAULT FALSE,
  isSensitive BOOLEAN DEFAULT FALSE,
  isActive BOOLEAN DEFAULT TRUE,
  description TEXT,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE positions ENABLE ROW LEVEL SECURITY;