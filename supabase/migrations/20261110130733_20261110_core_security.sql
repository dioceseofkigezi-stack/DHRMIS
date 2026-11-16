-- DHRMIS Migration 1: Core Security & Audit Tables

-- PostgreSQL schema for Supabase backend

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Security Events Table
CREATE TABLE IF NOT EXISTS security_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('Critical', 'High', 'Medium', 'Low', 'Informational')),
  component TEXT NOT NULL,
  description TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by UUID REFERENCES auth.users(id),
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE security_event ENABLE ROW LEVEL SECURITY;

-- Audit Log Table
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  module TEXT,
  record_id UUID,
  record_type TEXT,
  employee_id UUID,
  scope_ids JSONB DEFAULT '[]'::jsonb,
  ip_address TEXT,
  device_info TEXT,
  user_agent TEXT,
  result TEXT NOT NULL CHECK (result IN ('Success', 'Failure', 'Warning', 'Skipped')),
  before_values JSONB DEFAULT '{}'::jsonb,
  after_values JSONB DEFAULT '{}'::jsonb,
  purpose TEXT,
  context TEXT,
  session_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Sensitive Read Log Table
CREATE TABLE IF NOT EXISTS sensitive_read_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  employee_id UUID,
  record_id UUID,
  record_type TEXT NOT NULL,
  data_category TEXT NOT NULL CHECK (data_category IN ('NATIONAL_ID', 'BANK_DETAILS', 'FAMILY_INFO', 'CHILDREN_DATA', 'MEDICAL_INFO', 'DISCIPLINE', 'SAFEGUARDING', 'CAUSE_OF_DEATH', 'PENSION', 'CONFIDENTIAL_DOCUMENT')),
  purpose TEXT,
  scope_ids JSONB DEFAULT '[]'::jsonb,
  session_id UUID,
  ip_address TEXT,
  device_info TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sensitive_read_log ENABLE ROW LEVEL SECURITY;