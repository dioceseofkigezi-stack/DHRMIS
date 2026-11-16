/**
 * DHRMIS - System Monitoring & Analytics Types
 * Performance metrics, uptime tracking, error monitoring
 */

// ─── System Health & Status ───────────────────────────────────────────────────

export interface SystemStatus {
  id: string;
  component: "Database" | "Auth" | "Storage" | "API" | "BackgroundJobs" | "Email" | "Queue" | "Search" | "Other";
  status: "Operational" | "Degraded" | "Down" | "Maintenance";
  responseTimeMs?: number;
  errorRate?: number;
  lastChecked: Date;
  message?: string;
}

// ─── Performance Metrics ──────────────────────────────────────────────────────

export interface SystemMetric {
  id: string;
  metricName: string;
  metricType: "counter" | "gauge" | "histogram" | "distribution";
  value: number;
  unit?: string;
  period?: string;
  recordedAt: Date;
  source: "Application" | "Database" | "Infra" | "User";
}

// ─── Performance Reporting ────────────────────────────────────────────────────

export interface PerformanceReport {
  id: string;
  metricName: string;
  period: "last_hour" | "24_hours" | "7_days" | "30_days" | "custom";
  startDate?: Date;
  endDate?: Date;
  average?: number;
  min?: number;
  max?: number;
  p95?: number;
  p99?: number;
  totalCount: number;
  recordedAt: Date;
  // Rollup data
  breakdown?: Record<string, number>; // e.g. by endpoint, by module
}

// ─── Error Monitoring ─────────────────────────────────────────────────────────

export interface SystemError {
  id: string;
  errorId: string;
  timestamp: Date;
  severity: "Critical" | "High" | "Medium" | "Low" | "Informational";
  component: string;
  endpoint?: string;
  errorType: string;
  message: string;
  correlationId?: string;
  affectedTransaction?: string;
  frequency: number;
  firstOccurrence: Date;
  lastOccurrence: Date;
  status: "Open" | "Investigating" | "Resolved" | "Closed";
  assignedAdmin?: string;
  resolutionNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ErrorTrend {
  date: string; // YYYY-MM-DD
  component: string;
  severity: "Critical" | "High" | "Medium" | "Low" | "Informational";
  count: number;
  resolvedCount: number;
  openCount: number;
}

// ─── Uptime & Incident Tracking ───────────────────────────────────────────────

export interface UptimeEvent {
  id: string;
  eventName:
    | "PlannedMaintenance"
    | "ApplicationOutage"
    | "DatabaseOutage"
    | "InfrastructureOutage"
    | "NetworkOutage"
    | "ThirdPartyOutage";
  startDate: Date;
  endDate?: Date;
  durationHours: number;
  description: string;
  status: "Planned" | "Active" | "Closed";
  affectedComponents?: string[];
  impact?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UptimeReport {
  id: string;
  period: "last_hour" | "24_hours" | "7_days" | "30_days";
  startDate?: Date;
  endDate?: Date;
  totalHours: number;
  uptimeHours: number;
  downtimeHours: number;
  availabilityPercentage: number;
  incidents: number;
  plannedMaintenanceHours: number;
  unplannedDowntimeHours: number;
  createdAt: Date;
}

// ─── Administrator Alert Types ────────────────────────────────────────────────

export interface Alert {
  id: string;
  alertType:
    | "SYSTEM_OUTAGE"
    | "DATABASE_FAILURE"
    | "BACKUP_FAILURE"
    | "STORAGE_CAPACITY"
    | "AUTHENTICATION_FAILURES"
    | "SUSPICIOUS_ACTIVITY"
    | "API_ERRORS"
    | "SECURITY_EVENTS"
    | "FAILED_JOBS"
    | "RLS_SECURITY"
    | "CRITICAL_ERROR";
  severity: "Critical" | "High" | "Medium" | "Low" | "Informational";
  title: string;
  message: string;
  relatedEntity?: string;
  resolved: boolean;
  acknowledgementRequired: boolean;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  createdAt: Date;
  resolvedAt?: Date;
}

// ─── Active Sessions & User Status ────────────────────────────────────────────

export interface ActiveSession {
  id: string;
  userId: string;
  deviceInfo?: string;
  ipAddress?: string;
  userAgent?: string;
  scopeIds?: string[];
  isActive: boolean;
  expiresAt: Date;
  createdAt: Date;
  lastActivityAt?: Date;
}

export interface UserStatus {
  id: string;
  userId: string;
  role: string;
  isActive: boolean;
  isSuspended: boolean;
  isActiveSession: boolean;
  lastLoginAt?: Date;
  loginCount: number;
  failedLoginCount: number;
  totalSessions: number;
  scopes: string[];
  auditLogsToday: number;
  sensitiveReadsToday: number;
  lastActiveAt?: Date;
}

// ─── Capacity & Resource Metrics ──────────────────────────────────────────────

export interface CapacityMetric {
  id: string;
  metricName: string;
  currentValue: number;
  totalCapacity: number;
  unit: string;
  metricType: "storage" | "memory" | "connections" | "connections" | "cpu" | "queue";
  lastUpdated: Date;
  status: "Healthy" | "Warning" | "Critical";
}

export interface StorageMetrics {
  id: string;
  storageType: "Database" | "DocumentStorage" | "Backups";
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  usedPercent: number;
  lastUpdated: Date;
}

// ─── Rate Limiting & Usage ────────────────────────────────────────────────────

export interface RateLimitStatus {
  id: string;
  clientIdentifier: string;
  endpoint: string;
  limit: number;
  remaining: number;
  resetAt: Date;
  exceeded: boolean;
  timestamp: Date;
}