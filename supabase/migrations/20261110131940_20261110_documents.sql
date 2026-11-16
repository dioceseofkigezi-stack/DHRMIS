-- DHRMIS Migration 15: Document Management Tables

-- PostgreSQL schema for Supabase backend

-- Documents Table
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  module TEXT NOT NULL, -- The module that owns this document
  document_type TEXT NOT NULL,
  original_file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  storage_path TEXT NOT NULL, -- Supabase Storage path
  checksum TEXT, -- SHA256 checksum for integrity
  version INTEGER DEFAULT 1,
  is_current_version BOOLEAN DEFAULT TRUE,
  access_level TEXT NOT NULL DEFAULT 'Private' CHECK (access_level IN ('Private', 'DiocesanHR', 'BoardLevel', 'PublicView')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Index for documents
CREATE INDEX IF NOT EXISTS idx_documents_employee_id ON documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_documents_module ON documents(module);
CREATE INDEX IF NOT EXISTS idx_documents_access_level ON documents(access_level);
CREATE INDEX IF NOT EXISTS idx_documents_version ON documents(version);

-- Stored Files (Supabase Storage tracking) Table
CREATE TABLE IF NOT EXISTS stored_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  version INTEGER DEFAULT 1,
  presigned_url TEXT,
  expires_at TIMESTAMPTZ,
  download_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);