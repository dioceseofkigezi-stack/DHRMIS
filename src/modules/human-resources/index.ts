/**
 * DHRMIS - Human Resources Module - Phase 2 Employee Master
 * Module exports for Employee Master functionality
 */

// ─── Services ────────────────────────────────────────────────────────────────

export * from "@/modules/human-resources/services/employee-service-crud";
export * from "@/modules/human-resources/services/employee-service-search";

// ─── Types ───────────────────────────────────────────────────────────────────

export * from "@/modules/human-resources/types/employee-master";

// ─── Constants ───────────────────────────────────────────────────────────────

export const EMPLOYEE_CATEGORIES = [
  "Clergy",
  "Catechist",
  "LayStaff",
  "InstitutionalStaff",
  "Contract",
  "Volunteer",
];

export const LIFE_STATUSES = ["Alive", "Deceased", "UnknownNotConfirmed"];

export const EMPLOYMENT_STATUSES = [
  "Active",
  "Retired",
  "Resigned",
  "Separated",
  "DeceasedActive",
  "OnLeave",
  "Suspended",
];

export const GENDERS = ["Male", "Female"];

// ─── Module Configuration ────────────────────────────────────────────────────

export interface HumanResourcesConfig {
  enableDuplicateDetection: boolean;
  duplicateDetectionConfig: {
    minimumSimilarityScore: number;
    requireNationalId: boolean;
    enableFuzzyMatching: boolean;
  };
  enableAssignmentManagement: boolean;
  enableDocumentManagement: boolean;
  enableAssignmentHistory: boolean;
}
