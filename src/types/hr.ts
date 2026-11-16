/**
 * DHRMIS - HR Management Types
 * Leave, Performance, Promotion, Appointments
 */

// ─── Leave Management ─────────────────────────────────────────────────────────

export interface LeaveRecord {
  id: string;
  employeeId: string;
  leaveType:
    | "Annual"
    | "Sick"
    | "Maternity"
    | "Paternity"
    | "Compassionate"
    | "Study"
    | "Sabbatical"
    | "Other";
  period: string;
  entitlementDays: number;
  takenDays: number;
  balanceDays: number;
  status: "Requested" | "Approved" | "Rejected" | "Cancelled" | "Pending";
  approvedBy?: string;
  approvalDate?: Date;
  startDate?: Date;
  endDate?: Date;
  reason?: string;
  documents?: string[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── Performance Appraisal ────────────────────────────────────────────────────

export interface PerformanceAppraisal {
  id: string;
  employeeId: string;
  appraisalPeriod: string;
  objectives: string[];
  kpis: string[];
  supervisorAssessment?: string;
  employeeComments?: string;
  developmentNeeds?: string[];
  recommendations?: string;
  performanceImprovementPlan?: string;
  status: "Draft" | "InProgress" | "Submitted" | "Approved" | "Rejected" | "Completed";
  supervisorId?: string;
  approvedBy?: string;
  approvalDate?: Date;
  effectiveDate?: Date;
  documents?: string[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── Appointments & Promotions ────────────────────────────────────────────────

export interface Appointment {
  id: string;
  employeeId: string;
  previousPosition?: string;
  newPosition: string;
  previousGrade?: string;
  newGrade?: string;
  effectiveDate: Date;
  authority: string;
  referenceNumber?: string;
  appointmentLetterId?: string;
  supportingDocumentId?: string;
  status: "Pending" | "Approved" | "Rejected" | "Completed";
  approvedBy?: string;
  approvalDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Contract Types ────────────────────────────────────────────────────────────

export interface EmploymentContract {
  id: string;
  employeeId: string;
  contractType: "Permanent" | "Temporary" | "Contract" | "Probation" | "Acting" | "FixedTerm";
  salary?: number;
  salaryScale?: string;
  allowances?: string;
  startDate: Date;
  endDate?: Date;
  status: "Active" | "Expired" | "Terminated" | "Pending";
  documentId?: string;
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
}