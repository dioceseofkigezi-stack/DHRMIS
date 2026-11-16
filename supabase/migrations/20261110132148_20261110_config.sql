-- DHRMIS Migration 19: System Configuration Tables

-- PostgreSQL schema for Supabase backend

-- System Config Table
CREATE TABLE IF NOT EXISTS system_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key TEXT UNIQUE NOT NULL,
  config_value TEXT NOT NULL,
  config_section TEXT NOT NULL DEFAULT 'general',
  description TEXT,
  is_sensitive BOOLEAN DEFAULT FALSE,
  is_valid BOOLEAN DEFAULT TRUE,
  last_modified_by UUID REFERENCES auth.users(id),
  last_modified_at TIMESTAMPTZ DEFAULT NOW(),
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

-- Index for system config
CREATE INDEX IF NOT EXISTS idx_system_config_key ON system_config(config_key);
CREATE INDEX IF NOT EXISTS idx_system_config_section ON system_config(config_section);