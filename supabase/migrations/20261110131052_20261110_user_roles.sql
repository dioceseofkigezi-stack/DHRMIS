-- DHRMIS Migration 2: User Roles & Organizational Tables

-- PostgreSQL schema for Supabase backend

-- User Roles Table
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role_code TEXT NOT NULL CHECK (role_code IN (
    'SuperAdministrator', 'SystemAdministrator', 'CentralHR', 'BoardHR',
    'ArchdeaconryAdmin', 'ParishAdmin', 'InstitutionAdmin', 'FinanceOfficer',
    'RegistryOfficer', 'SafeguardingOfficer', 'ICTAdministrator', 'Auditor',
    'Employee', 'ReadOnly'
  )),
  permissions JSONB DEFAULT '[]'::jsonb,
  scopes JSONB DEFAULT '[]'::jsonb,
  isActive BOOLEAN DEFAULT TRUE,
  isSuspended BOOLEAN DEFAULT FALSE,
  isMfaEnabled BOOLEAN DEFAULT FALSE,
  accountExpiry TIMESTAMPTZ,
  loginAttempts INTEGER DEFAULT 0,
  lockedUntil TIMESTAMPTZ,
  lastLoginAt TIMESTAMPTZ,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- User Scopes Table
CREATE TABLE IF NOT EXISTS user_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  scope_id UUID NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('Diocese', 'Archdeaconry', 'Parish', 'Institution', 'Department')),
  scope_name TEXT NOT NULL,
  purpose TEXT,
  expiresAt TIMESTAMPTZ,
  isActive BOOLEAN DEFAULT TRUE,
  isTemporary BOOLEAN DEFAULT FALSE,
  assignedBy UUID REFERENCES auth.users(id),
  assignmentDate TIMESTAMPTZ DEFAULT NOW(),
  deactivationDate TIMESTAMPTZ,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_scopes ENABLE ROW LEVEL SECURITY;

-- User Sessions Table
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  device_info TEXT,
  ip_address TEXT,
  user_agent TEXT,
  scope_ids JSONB DEFAULT '[]'::jsonb,
  isActive BOOLEAN DEFAULT TRUE,
  expiresAt TIMESTAMPTZ NOT NULL,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  lastActivityAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;