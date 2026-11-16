/**
 * DHRMIS - Clergy & Ordination Types - Phase 3
 * Priest/Ministry types, ordination records, and ministry history
 */


// ─── Ordination Record Types ──────────────────────────────────────────────────

export interface OrdinationRecord {
  id: string;
  employeeId: string;
  ordinationDate: string;
  ordainingBishop: string;
  ordinationAuthority: string;
  ordinationDiocese: string;
  venue: string;
  certificateDocumentId?: string;
  referenceNumber?: string;
  previousDiocese?: string;
  dateEnteredDiocese: string;
  dateFirstAppointed: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Ministry History Types ─────────────────────────────────────────────────

export interface MinistryService {
  id: string;
  employeeId: string;
  positionTitle: string;
  positionCode?: string;
  boardId?: string;
  departmentId?: string;
  institutionId?: string;
  archdeaconryId?: string;
  parishId?: string;
  localChurchId?: string;
  startDate: string;
  endDate?: string;
  isCurrent: boolean;
  roleType: "Priest" | "Deacon" | "Other";
  assignedBy?: string;
  assignmentDocumentId?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Clergy Profile Types ────────────────────────────────────────────────────

export interface ClergyProfile {
  employeeId: string;
  ordinationRecord?: OrdinationRecord;
  ministryHistory: MinistryService[];
  currentAssignment?: {
    position: string;
    board: string;
    department: string;
    institution: string;
    archdeaconry: string;
    parish: string;
    localChurch: string;
    grade: string;
    startDate: string;
  };
  transferHistory: {
    fromPosition: string;
    toPosition: string;
    effectiveDate: string;
    reason: string;
  }[];
  qualifications: string[];
  training: string[];
  family: {
    spouse?: string;
    children: string[];
    nextOfKin: string[];
  };
  documents: string[];
  createdAt: string;
  updatedAt: string;
}

// ─── Priest Specific Types ───────────────────────────────────────────────────

export interface PriestlyOrdination {
  id: string;
  employeeId: string;
  ordinationDate: string;
  ordainingBishop: string;
  ordinationDiocese: string;
  venue: string;
  certificateReference: string;
  previousDiocese?: string;
  dateEnteredDiocese: string;
  dateFirstAppointed: string;
  yearsOrdained: number;
  yearsServingDiocese: number;
  currentAssignment: {
    position: string;
    parish: string;
    archdeaconry: string;
    startDate: string;
    isActive: boolean;
  };
  ministryRoles: string[];
  family: {
    spouse?: {
      fullName: string;
      marriageDate: string;
    };
    children: string[];
    nextOfKin: string[];
  };
  safeguardingRecords: string[];
  createdAt: string;
  updatedAt: string;
}