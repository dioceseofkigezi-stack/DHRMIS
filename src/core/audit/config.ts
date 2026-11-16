/**
 * DHRMIS - Audit Configuration & Policy
 * Audit configuration, maker-checker rules, and sensitive data handling
 */

import type { AuditAction, SensitiveReadLog } from "@/types";

export interface AuditConfig {
  enableAuditLog: boolean;
  enableSensitiveReadLogging: boolean;
  enableSecurityEventLogging: boolean;
  enablePerformanceLogging: boolean;
  maxRetentionDays: number;
  sensitiveDataCategories: SensitiveReadLog["dataCategory"][];
  requireMakerChecker: AuditAction[];
  sensitiveActions: AuditAction[];
  highRiskActions: AuditAction[];
  requireApproval: string[];
  maxAuditRetentionDays: number;
  retentionPolicy: "day" | "week" | "month" | "quarter" | "year";
}

export const AUDIT_CONFIG: AuditConfig = {
  enableAuditLog: true,
  enableSensitiveReadLogging: true,
  enableSecurityEventLogging: true,
  enablePerformanceLogging: true,
  maxRetentionDays: 730,
  sensitiveDataCategories: [
    "NATIONAL_ID",
    "BANK_DETAILS",
    "FAMILY_INFO",
    "CHILDREN_DATA",
    "MEDICAL_INFO",
    "DISCIPLINE",
    "SAFEGUARDING",
    "CAUSE_OF_DEATH",
    "PENSION",
    "CONFIDENTIAL_DOCUMENT",
  ],
  requireMakerChecker: [
    "DEATH_VERIFY",
    "DEATH_REVERSE",
    "RETIREMENT",
    "EARLY_RETIREMENT",
    "SALARY_CHANGE",
    "PROMOTION",
    "DISCIPLINE_APPROVE",
    "SAFEguarding_APPROVE",
    "MERGE_APPROVE",
    "PERMISSION_CHANGE",
    "EMPLOYEE_MERGE",
    "SENSITIVE_DELETION",
    "HIGH_VALUE_EXPORT",
    "BREAK_GLASS_RELEASE",
  ],
  sensitiveActions: [
    "CREATED",
    "UPDATE",
    "DELETE_REQUEST",
    "APPROVE",
    "REJECT",
    "TRANSFER",
    "PROMOTION",
    "RETIREMENT",
    "EARLY_RETIREMENT",
    "DEATH_REPORT",
    "DEATH_VERIFY",
    "DEATH_REVERSE",
    "PERMISSION_CHANGE",
    "SCOPE_CHANGE",
    "DOCUMENT_UPLOAD",
    "DOCUMENT_DELETE",
    "EXPORT",
    "MERGE_APPROVE",
  ],
  highRiskActions: [
    "DEATH_VERIFY",
    "DEATH_REVERSE",
    "RETIREMENT",
    "EARLY_RETIREMENT",
    "PROMOTION",
    "DISCIPLINE_APPROVE",
    "SAFEguarding_APPROVE",
    "PERMISSION_CHANGE",
    "SCOPE_CHANGE",
    "EMPLOYEE_MERGE",
    "SENSITIVE_DELETION",
    "BREAK_GLASS_ACTIVATE",
  ],
  requireApproval: [
    "RETIREMENT",
    "EARLY_RETIREMENT",
    "DEATH_VERIFY",
    "DEATH_REVERSE",
    "DISCIPLINE_APPROVE",
    "SAFEguarding_APPROVE",
    "EMPLOYEE_MERGE",
    "PERMISSION_CHANGE",
    "SENSITIVE_DELETION",
    "HIGH_VALUE_EXPORT",
  ],
  maxAuditRetentionDays: 730,
  retentionPolicy: "year",
};
