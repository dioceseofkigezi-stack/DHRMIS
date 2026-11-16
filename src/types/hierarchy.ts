/**
 * DHRMIS - Organizational Hierarchy Types
 * Diocese > Archdeaconry > Parish > LocalChurch
 * Board > Department > Institution > Position
 */

// ─── Church Hierarchy ─────────────────────────────────────────────────────────

export interface Diocese {
  id: string;
  name: string;
  code: string;
  region?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Archdeaconry {
  id: string;
  name: string;
  dioceseId: string;
  region?: string;
  isActive: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Parish {
  id: string;
  name: string;
  archdeaconryId: string;
  region?: string;
  isActive: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface LocalChurch {
  id: string;
  name: string;
  parishId: string;
  region?: string;
  isActive: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Institutional Hierarchy ──────────────────────────────────────────────────

export interface Board {
  id: string;
  code: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  boardId?: string;
  description?: string;
  isSensitive: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Institution {
  id: string;
  code: string;
  name: string;
  institutionTypeId: string;
  boardId?: string;
  departmentId?: string;
  archdeaconryId?: string;
  parishId?: string;
  location?: string;
  isSensitive: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Position {
  id: string;
  code: string;
  title: string;
  boardId?: string;
  departmentId?: string;
  gradeId?: string;
  department?: string;
  board?: string;
  grade?: string;
  description?: string;
  isSupervisory: boolean;
  isSensitive: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Grade {
  id: string;
  code: string;
  title: string;
  boardId?: string;
  departmentId?: string;
  salaryScale?: string;
  description?: string;
  isSensitive: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Assignment / Role Types ──────────────────────────────────────────────────

export interface Assignment {
  id: string;
  employeeId: string;
  boardId?: string;
  departmentId?: string;
  institutionId?: string;
  archdeaconryId?: string;
  parishId?: string;
  localChurchId?: string;
  positionId?: string;
  gradeId?: string;
  supervisorId?: string;
  assignmentType: "Permanent" | "Temporary" | "Acting" | "Probation" | "Contract";
  isPrimary: boolean;
  isAdditional: boolean;
  startDate: Date;
  endDate?: Date;
  status: "Active" | "OnLeave" | "Suspended" | "Completed" | "Terminated";
  referenceNumber?: string;
  supportingDocumentId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmployeeRole {
  id: string;
  employeeId: string;
  role: string;
  roleType: "Position" | "Office" | "Role" | "Coordinator" | "Chaplaincy" | "Committee" | "WorkingGroup" | "BoardMember";
  isPrimary: boolean;
  isAdditional: boolean;
  boardId?: string;
  departmentId?: string;
  institutionId?: string;
  archdeaconryId?: string;
  parishId?: string;
  localChurchId?: string;
  startDate: Date;
  endDate?: Date;
  authority?: string;
  referenceNumber?: string;
  supervisorId?: string;
  status: "Active" | "Completed" | "Terminated";
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActingAppointment {
  id: string;
  employeeId?: string;
  positionId: string;
  actingForPositionId: string;
  actingEmployeeId?: string;
  startDate: Date;
  endDate: Date;
  authority: string;
  referenceNumber?: string;
  supportingDocumentId?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Delegation {
  id: string;
  delegatorId: string;
  delegateId: string;
  permission: string;
  scope: string;
  startDate: Date;
  endDate: Date;
  reason: string;
  approvedBy?: string;
  approvalDate?: Date;
  isExpired: boolean;
  createdAt: Date;
  updatedAt: Date;
  revokedAt?: Date;
  revocationReason?: string;
}