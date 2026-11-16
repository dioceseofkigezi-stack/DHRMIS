/**
 * DHRMIS - Archive Types - Phase 8
 * Central information archive and historical reporting
 */


// ─── Archive Record Types ────────────────────────────────────────────────────

export interface ArchiveRecord {
  id: string;
  employeeId: string;
  archiveType: "Employee" | "Assignment" | "Role" | "Transfer" | "Qualification" | "Training" | "Promotion" | "Contract" | "Retirement" | "Separation" | "Document" | "Approval" | "Audit";
  archivedAt: string;
  archiveReferenceId: string;
  originalOwner: string;
  retrievalStatus: "Pending" | "Retrieved" | "NotRequired";
  remarks?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Historical Reporting Types ─────────────────────────────────────────────

export interface HistoricalReport {
  id: string;
  reportName: string;
  reportType: "EmployeeHistory" | "MinistryHistory" | "TransferHistory" | "PromotionHistory" | "RetirementHistory" | "TurnoverReport" | "WorkforceAnalysis" | "Custom";
  employeeId?: string;
  dateRange: "LastMonth" | "LastQuarter" | "LastYear" | "Custom";
  startDate?: string;
  endDate?: string;
  data: Record<string, unknown>;
  generatedAt: string;
  generatedBy: string;
  status: "Completed" | "InProgress" | "Failed";
  filtersApplied: Record<string, unknown>;
}

// ─── Workforce Analytics Types ─────────────────────────────────────────────

export interface WorkforceSnapshot {
  id: string;
  snapshotDate: string;
  totalEmployees: number;
  byCategory: Record<string, number>;
  byEmploymentStatus: Record<string, number>;
  byLifeStatus: Record<string, number>;
  byBoard: Record<string, number>;
  byArchdeaconry: Record<string, number>;
  byPosition: Record<string, number>;
  turnoverRate: number;
  averageTenure: number;
  newHires: number;
  departures: number;
  createdAt: string;
}

export interface DiversityMetrics {
  totalEmployees: number;
  genderDistribution: Record<string, number>;
  ageDistribution: Record<string, number>;
  employmentStatusDistribution: Record<string, number>;
  categoryDistribution: Record<string, number>;
  inclusionIndex: number;
  lastUpdated: string;
}

// ─── Performance Analytics Types ──────────────────────────────────────────

export interface PerformanceMetric {
  id: string;
  metricName: string;
  value: number;
  target?: number;
  period: string;
  employeeId?: string;
  departmentId?: string;
  boardId?: string;
  measuredAt: string;
}

export interface AnalyticsDashboard {
  id: string;
  dashboardName: string;
  description: string;
  layout: Record<string, string>;
  metrics: PerformanceMetric[];
  filteredBy: {
    employeeId?: string;
    departmentId?: string;
    boardId?: string;
    dateRange: string;
  };
  isPublic: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}