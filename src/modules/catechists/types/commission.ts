/**
 * DHRMIS - Catechist Types - Phase 3
 * Catechist commissioning, service history, and ministry records
 */


// ─── Catechist Commission Types ───────────────────────────────────────────────

export interface CatechistCommission {
  id: string;
  employeeId: string;
  commissionDate: string;
  commissioningAuthority: string;
  commissioningDiocese: string;
  certificateReference?: string;
  previousStatus?: string;
  dateEnteredDiocese: string;
  dateFirstCommissioned: string;
  isActive: boolean;
  commissionType: "Commissioned" | "Recognised" | "Licensed" | "Other";
  documents: string[];
  createdAt: string;
  updatedAt: string;
}

// ─── Catechist Service Record ───────────────────────────────────────────────

export interface CatechistServiceRecord {
  id: string;
  employeeId: string;
  positionTitle: string;
  positionCode?: string;
  archdeaconryId?: string;
  parishId?: string;
  localChurchId?: string;
  startDate: string;
  endDate?: string;
  isCurrent: boolean;
  commissionedDate?: string;
  documents: string[];
  createdAt: string;
  updatedAt: string;
}

// ─── Catechist Profile ───────────────────────────────────────────────────────

export interface CatechistProfile {
  employeeId: string;
  commissionRecord: CatechistCommission;
  serviceHistory: CatechistServiceRecord[];
  currentAssignment?: {
    position: string;
    archdeaconry: string;
    parish: string;
    localChurch: string;
    startDate: string;
    isActive: boolean;
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
    spouse?: {
      fullName: string;
    };
    children: string[];
    nextOfKin: string[];
  };
  documents: string[];
  createdAt: string;
  updatedAt: string;
}