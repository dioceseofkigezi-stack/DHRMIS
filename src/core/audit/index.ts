/**
 * DHRMIS - Audit Index
 * Central export for all audit-related types and services
 */

export * from "./config";
export type * from "@/types/audit";
export * from "./queries";
export * from "./security-queries";
export * from "./summary-reports";
export * from "./service";

import { getAuditLogs, getSensitiveReadLogs } from "./queries";
import { getSecurityEvents } from "./security-queries";
import { getDailyAuditSummary, getModuleActivitySummary, getSensitiveDataAccessReport, getSensitiveReadSummary } from "./summary-reports";
import { auditService, enforceMakerChecker } from "./service";

export const AUDIT = {
  service: auditService,
  getAuditLogs,
  getSensitiveReadLogs,
  getSecurityEvents,
  getDailyAuditSummary,
  getSensitiveReadSummary,
  getModuleActivitySummary,
  getSensitiveDataAccessReport,
  enforceMakerChecker,
};