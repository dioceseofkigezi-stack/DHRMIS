/**
 * DHRMIS - Audit & Logging Types
 * Comprehensive audit trails, sensitive read logging, and security events
 */

import { AuditAction, AuditResult } from "./core";

// ─── Core Audit Types ─────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  userId: string;
  userName?: string | null;
  action: AuditAction;
  module: string;
  recordId?: string;
  recordKey?: Record<string, unknown>;
  recordType?: string;
  employeeId?: string;
  scopeIds?: string[];
  ipAddress?: string;
  deviceInfo?: string;
  userAgent?: string;
  result: AuditResult;
  beforeValues?: Record<string, unknown>;
  afterValues?: Record<string, unknown>;
  purpose?: string;
  context?: string;
  sessionId?: string;
  createdAt: Date;
}

// ─── Sensitive Read Logging ───────────────────────────────────────────────────

export interface SensitiveReadLog {
  id: string;
  userId: string;
  employeeId?: string;
  recordId?: string;
  recordType: string;
  dataCategory:
    | "NATIONAL_ID"
    | "BANK_DETAILS"
    | "FAMILY_INFO"
    | "CHILDREN_DATA"
    | "MEDICAL_INFO"
    | "DISCIPLINE"
    | "SAFEGUARDING"
    | "CAUSE_OF_DEATH"
    | "PENSION"
    | "CONFIDENTIAL_DOCUMENT";
  purpose: string;
  accessedFields?: string[];
  scopeIds?: string[];
  sessionId?: string;
  ipAddress?: string;
  deviceInfo?: string;
  timestamp: Date;
}

// ─── Security Events ──────────────────────────────────────────────────────────

export interface SecurityEvent {
  id: string;
  userId?: string;
  eventType:
    | "FAILED_LOGIN"
    | "BRUTE_FORCE"
    | "ACCOUNT_TAKEOVER"
    | "UNAUTHORIZED_READ"
    | "UNAUTHORIZED_WRITE"
    | "RLS_VIOLATION"
    | "PRIVILEGE_ESCALATION"
    | "BREAK_GLASS_USED"
    | "SUSPICIOUS_DOWNLOAD"
    | "EXTERNAL_IMPORT"
    | "PASSWORD_CHANGE"
    | "SESSION_HIJACK_ATTEMPT"
    | "OTHER";
  severity: "Critical" | "High" | "Medium" | "Low" | "Informational";
  component: string;
  description: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
  timestamp: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  resolved: boolean;
  resolvedAt?: Date;
}

// ─── User Activity Logging ────────────────────────────────────────────────────

export interface UserActivityLog {
  id: string;
  userId: string;
  action: AuditAction;
  module: string;
  recordId?: string;
  employeeId?: string;
  scopeIds?: string[];
  ipAddress?: string;
  deviceInfo?: string;
  result: AuditResult;
  createdAt: Date;
}

// ─── Break-Glass Access ───────────────────────────────────────────────────────

export interface BreakGlassAccess {
  id: string;
  activatedBy: string;
  justification: string;
  activationTime: Date;
  expiryTime: Date;
  scopeIds?: string[];
  sessionIds?: string[];
  isActive: boolean;
  isApproved: boolean;
  createdAt: Date;
  updatedAt: Date;
  releasedBy?: string;
  releasedTime?: Date;
  releaseReason?: string;
}

// ─── Configuration Changes ────────────────────────────────────────────────────

export interface ConfigurationChangeLog {
  id: string;
  adminId: string;
  configKey: string;
  oldValue: string;
  newValue: string;
  description: string;
  timestamp: Date;
  ipAddress?: string;
  deviceInfo?: string;
}
