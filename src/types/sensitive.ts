/**
 * DHRMIS - Sensitive Modules Types
 * Discipline, Safeguarding, Death, Retirement
 */

// ─── Discipline Types ─────────────────────────────────────────────────────────

export interface DisciplinaryCase {
  id: string;
  caseNumber: string;
  employeeId: string;
  natureOfIssue: string;
  dateOpened: Date;
  investigationDetails?: string;
  hearingDetails?: string;
  decision?: string;
  sanction?: string;
  appealDetails?: string;
  finalOutcome?: string;
  documents?: string[];
  status: "Open" | "UnderInvestigation" | "HearingScheduled" | "DecisionMade" | "Appealed" | "Closed" | "Reopened";
  closureDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Safeguarding Types ───────────────────────────────────────────────────────

export interface SafeguardingCase {
  id: string;
  caseNumber: string;
  allegationType:
    | "ChildProtection"
    | "Abuse"
    | "SexualMisconduct"
    | "Exploitation"
    | "Neglect"
    | "Harassment"
    | "Other";
  dateReported: Date;
  reporterId: string;
  subjectId?: string;
  affectedPersonId?: string;
  riskClassification: "Low" | "Medium" | "High" | "Critical";
  immediateAction?: string;
  investigationDetails?: string;
  referralDetails?: string;
  decision?: string;
  outcome?: string;
  restrictions?: string;
  appealReview?: string;
  closureDetails?: string;
  evidence?: string[];
  accessClassification: "Restricted" | "Confidential" | "UltraConfidential";
  status: "Open" | "UnderInvestigation" | "Referred" | "DecisionMade" | "OutcomeReached" | "Reviewed" | "Closed" | "Reopened";
  closureDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Death Record Types ───────────────────────────────────────────────────────

export interface EmployeeDeathRecord {
  id: string;
  employeeId: string;
  reportedDeathDate?: Date;
  confirmedDeathDate?: Date;
  placeOfDeath?: string;
  causeOfDeath?: string;
  deathCertificateReference?: string;
  supportingDocumentId?: string;
  reporterId: string;
  firstVerifierId: string;
  firstVerificationDate?: Date;
  secondVerifierId?: string;
  secondVerificationDate?: Date;
  verificationStatus:
    | "Pending"
    | "FirstVerification"
    | "SecondVerification"
    | "Passed"
    | "Failed";
  reversalStatus:
    | "None"
    | "Reversible"
    | "ReversiblePending"
    | "Reversed"
    | "Finalized";
  reversalReason?: string;
  approvingAuthority?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Retirement Types ─────────────────────────────────────────────────────────

export interface Retirement {
  id: string;
  employeeId: string;
  retirementType: "Normal" | "Early" | "Compassionate" | "ForceRetirement";
  eligibleDate: Date;
  appliedDate?: Date;
  approvedBy?: string;
  approvalDate?: Date;
  status: "Pending" | "Approved" | "Rejected" | "Completed" | "Processing";
  effectiveDate?: Date;
  retirementDocuments?: string[];
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EarlyRetirementApplication {
  id: string;
  employeeId: string;
  applicationDate: Date;
  reason: string;
  eligibleYearsLeft?: number;
  documents?: string[];
  status:
    | "Submitted"
    | "UnderReview"
    | "Recommended"
    | "Approved"
    | "Rejected"
    | "Completed";
  reviewer?: string;
  reviewComments?: string;
  requestedEffectiveDate?: Date;
  finalDecisionDate?: Date;
  approverLevel?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Payroll Types ────────────────────────────────────────────────────────────

export interface PayrollRecord {
  id: string;
  employeeId: string;
  payrollPeriod: string;
  basicSalary: number;
  allowances: number;
  benefits: number;
  deductions: number;
  netPay: number;
  bankAccountId?: string;
  paymentMethod: "BankTransfer" | "Checks" | "Cash";
  status: "Pending" | "Processed" | "Failed" | "Cancelled";
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Benefit {
  id: string;
  employeeId: string;
  benefitName: string;
  benefitType: "Salary" | "Allowance" | "Other";
  amount: number;
  isActive: boolean;
  effectiveDate: Date;
  expiryDate?: Date;
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Pension Types ────────────────────────────────────────────────────────────

export interface PensionScheme {
  id: string;
  employeeId: string;
  schemeName: string;
  membershipNumber?: string;
  employerContribution: number;
  employeeContribution: number;
  retirementEligibilityDate?: Date;
  pensionStatus: "Active" | "Retired" | "Suspended" | "Lapsed";
  documentation?: string[];
  beneficiaryNextOfKinId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PensionContribution {
  id: string;
  employeeId: string;
  period: string;
  employerContribution: number;
  employeeContribution: number;
  totalContribution: number;
  paymentDate?: Date;
  isPaid: boolean;
  documentation?: string[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── Welfare Types ────────────────────────────────────────────────────────────

export interface WelfareRecord {
  id: string;
  employeeId: string;
  membershipType: string;
  contributions?: number;
  benefits: string;
  claims?: string;
  assistance?: string;
  status: "Active" | "Inactive" | "Pending" | "Approved" | "Disbursed" | "Cancelled";
  approvedBy?: string;
  approvalDate?: Date;
  documents?: string[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── Housing / Property Types ─────────────────────────────────────────────────

export interface PropertyAssignment {
  id: string;
  employeeId: string;
  propertyReference: string;
  propertyType: "House" | "Residence" | "Land" | "Other";
  allocationDate?: Date;
  occupancyDate?: Date;
  condition?: string;
  inventory?: string;
  handoverDate?: Date;
  vacatingDate?: Date;
  status: "Allocated" | "Occupied" | "Vacated" | "UnderMaintenance" | "Reserved";
  handoverDocumentId?: string;
  documents?: string[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── Succession Planning ──────────────────────────────────────────────────────

export interface SuccessionRecord {
  id: string;
  employeeId: string;
  positionId: string;
  positionTitle: string;
  currentStatus: "Active" | "Retiring" | "Retired" | "Resigning" | "Terminated";
  estimatedRetirementDate?: Date;
  vacancyId?: string;
  critical: boolean;
  potentialSuccessors: string;
  qualificationRequirements?: string;
  staffingGaps?: string;
  recruitmentRequired: boolean;
  createdAt: Date;
  updatedAt: Date;
}