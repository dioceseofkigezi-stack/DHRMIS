/**
 * DHRMIS - Professional Development Types
 * Qualification, Training, Professional Licence
 */

// ─── Qualification ────────────────────────────────────────────────────────────

export interface Qualification {
  id: string;
  employeeId: string;
  qualification: string;
  course: string;
  institution: string;
  location?: string;
  startDate: Date;
  completionDate?: Date;
  award?: string;
  grade?: string;
  certificateNumber?: string;
  verificationStatus: "Pending" | "Verified" | "NotVerified" | "Expired";
  documents?: string[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── Training ─────────────────────────────────────────────────────────────────

export interface TrainingRecord {
  id: string;
  employeeId: string;
  trainingProgramme: string;
  provider: string;
  course?: string;
  date: Date;
  duration?: string;
  certificate?: string;
  required: boolean;
  outcome?: string;
  renewalDueDate?: Date;
  cpdCredits?: number;
  documents?: string[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── Professional Licence ─────────────────────────────────────────────────────

export interface ProfessionalLicence {
  id: string;
  employeeId: string;
  professionalBody: string;
  registrationNumber: string;
  licenceNumber: string;
  issueDate: Date;
  expiryDate: Date;
  status: "Active" | "Expired" | "PendingRenewal" | "Suspended" | "Revoked";
  certificate?: string;
  verificationStatus: "Pending" | "Verified" | "NotVerified";
  renewalDueDate: Date;
  documents?: string[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── CPD / Training Certification ─────────────────────────────────────────────

export interface CPDRecord {
  id: string;
  employeeId: string;
  provider: string;
  activity: string;
  credits: number;
  date: Date;
  category: "Training" | "Conference" | "Workshop" | "Reading" | "Other";
  verificationStatus: "Pending" | "Verified" | "Rejected";
  documents?: string[];
  createdAt: Date;
  updatedAt: Date;
}