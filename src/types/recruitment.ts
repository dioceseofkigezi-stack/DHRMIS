/**
 * DHRMIS - Recruitment, Archive, Notifications, and API Types
 */
import type { Gender } from "./core";

// ─── Vacancy & Recruitment ────────────────────────────────────────────────────

export interface Vacancy {
  id: string;
  vacancyCode: string;
  boardId?: string;
  departmentId?: string;
  institutionId?: string;
  position: string;
  grade?: string;
  location?: string;
  positionType: "Permanent" | "Temporary" | "Contract" | "Acting";
  reportingTo?: string;
  vacancies: number;
  salaryRange?: string;
  requirements?: string;
  status: "Open" | "Closed" | "Filled" | "OnHold" | "Draft";
  advertisement?: string;
  createdAt: Date;
  updatedAt: Date;
  expiryDate?: Date;
}

export interface Applicant {
  id: string;
  vacancyId?: string;
  fullName: string;
  alternativeNames?: string;
  email: string;
  telephone?: string;
  address?: string;
  dateOfBirth?: Date;
  gender: Gender;
  nationality?: string;
  nationalId?: string;
  highestQualification?: string;
  workExperience?: string;
  source: string;
  status: "Applied" | "Screening" | "Interview" | "Selected" | "Rejected" | "Hired" | "Withdrawn";
  createdAt: Date;
  updatedAt: Date;
}

export interface RecruitmentApplication {
  id: string;
  applicantId: string;
  vacancyId: string;
  applicationDate: Date;
  stage: "Applied" | "Screening" | "Interview" | "Selected" | "Hired";
  screeningNotes?: string;
  interviewNotes?: string;
  selectionNotes?: string;
  status: "InProgress" | "Approved" | "Rejected" | "Hired";
  approvedBy?: string;
  approvalDate?: Date;
  documents?: string[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── Archive / Central Information Archive ─────────────────────────────────────

export interface ArchiveRecord {
  id: string;
  employeeId: string;
  archiveType: "Employee" | "Assignment" | "Role" | "Transfer" | "Qualification" | "Training" | "Promotion" | "Contract" | "Retirement" | "Separation" | "Document" | "Approval" | "Audit";
  archivedAt: Date;
  archiveReferenceId: string;
  originalOwner: string;
  retrievalStatus: "Pending" | "Retrieved" | "NotRequired";
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Notification Types ───────────────────────────────────────────────────────

export interface Notification {
  id: string;
  userId?: string;
  employeeId?: string;
  type:
    | "RetirementAlert"
    | "LicenseExpiry"
    | "TrainingExpiry"
    | "LeaveDecision"
    | "TransferApproval"
    | "EarlyRetirementDecision"
    | "AppointmentDecision"
    | "SecurityAlert"
    | "SystemAlert"
    | "IncidentReport"
    | "Other";
  title: string;
  message: string;
  isRead: boolean;
  isSilent: boolean;
  relevantScopeIds?: string[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── Pagination & API Result Types ────────────────────────────────────────────

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface SearchResult<T> {
  results: T[];
  total: number;
  query: string;
  filters?: Record<string, unknown>;
  matchScore?: boolean;
}