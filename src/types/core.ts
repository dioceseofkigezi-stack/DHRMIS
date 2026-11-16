/**
 * DHRMIS - Diocese of Kigezi HRMIS
 * Core Identity and Organization Types
 */

// ─── Core Identity Types ─────────────────────────────────────────────────────

export type Gender = "Male" | "Female";
export type LifeStatus = "Alive" | "Deceased" | "UnknownNotConfirmed";
export type EmploymentStatus =
  | "Active"
  | "Retired"
  | "Resigned"
  | "Separated"
  | "DeceasedActive"
  | "OnLeave"
  | "Suspended";
export type EmployeeCategory =
  | "Clergy"
  | "Catechist"
  | "LayStaff"
  | "InstitutionalStaff"
  | "Contract"
  | "Volunteer";
export type EmployeeTitle =
  | "Mr"
  | "Mrs"
  | "Ms"
  | "Dr"
  | "Rev"
  | "Rev Can."
  | "Eng"
  | "Ven"
  | "Rt Rev."
  | "Father"
  | "Deacon"
  | "Other";
export type DocumentType =
  | "ID"
  | "Passport"
  | "OrdinationCertificate"
  | "CatechistCommissioning"
  | "AcademicCertificate"
  | "ProfessionalLicence"
  | "TrainingCertificate"
  | "Contract"
  | "AppointmentLetter"
  | "TransferDocument"
  | "PromotionLetter"
  | "LeaveDocument"
  | "DisciplineDocument"
  | "SafeguardingDocument"
  | "RetirementDocument"
  | "SeparationDocument"
  | "NextOfKin"
  | "MarriageCertificate"
  | "Photograph"
  | "Other";
export type DocumentAccess = "Private" | "DiocesanHR" | "BoardLevel" | "PublicView";
export type AuditResult = "Success" | "Failure" | "Warning" | "Skipped";
export type AuditAction =
  | "CREATED" | "UPDATE" | "DELETE_REQUEST" | "APPROVE" | "REJECT" | "TRANSFER"
  | "PROMOTION" | "RETIREMENT" | "EARLY_RETIREMENT" | "DEATH_REPORT" | "DEATH_VERIFY"
  | "DEATH_REVERSE" | "PERMISSION_CHANGE" | "SCOPE_CHANGE" | "DOCUMENT_UPLOAD"
  | "DOCUMENT_DELETE" | "EXPORT" | "MERGE_APPROVE" | "SALARY_CHANGE"
  | "DISCIPLINE_APPROVE" | "SAFEguarding_APPROVE" | "EMPLOYEE_MERGE"
  | "SENSITIVE_DELETION" | "HIGH_VALUE_EXPORT" | "BREAK_GLASS_RELEASE"
  | "BREAK_GLASS_ACTIVATE";

// ─── Organizational Hierarchy ────────────────────────────────────────────────

export type OrganizationLevel = "Archdeaconry" | "Parish" | "LocalChurch";
export type InstitutionType =
  | "PrimarySchool"
  | "SecondarySchool"
  | "TechnicalVocational"
  | "Hospital"
  | "HealthCentre"
  | "MissionStation"
  | "DevelopmentProject"
  | "BusinessUnit"
  | "Office"
  | "DiocesanCentre"
  | "Other";

export type BoardType =
  | "MissionAndEvangelism"
  | "Education"
  | "Health"
  | "PlanningAndDevelopment"
  | "LandAndFinance"
  | "Secretariat"
  | "Clergy"
  | "Catechists"
  | "Safeguarding"
  | "Recruitment"
  | "Payroll"
  | "Pension"
  | "Welfare"
  | "Housing"
  | "LegalAndCompliance"
  | "Communications"
  | "Registry"
  | "ICT";

// ─── Role and Permission Types ────────────────────────────────────────────────

export type RoleLevel =
  | "SUPER_SYSTEM_ADMIN"
  | "SECRETARIAT_USER"
  | "MISSION_BOARD_USER"
  | "EDUCATION_BOARD_USER"
  | "HEALTH_BOARD_USER"
  | "LAND_FINANCE_BOARD_USER"
  | "PLANNING_DEVELOPMENT_BOARD_USER"
  | "ICT_BOARD_USER";

export type PermissionCategory =
  | "employee:read"
  | "employee:create"
  | "employee:update"
  | "employee:delete"
  | "assignment:read"
  | "assignment:create"
  | "assignment:update"
  | "qualification:read"
  | "qualification:create"
  | "training:read"
  | "training:create"
  | "license:read"
  | "license:create"
  | "leave:read"
  | "leave:create"
  | "leave:approve"
  | "performance:read"
  | "performance:create"
  | "promotion:read"
  | "promotion:create"
  | "discipline:read"
  | "discipline:approve"
  | "safeguarding:read"
  | "safeguarding:approve"
  | "death:report"
  | "death:verify"
  | "retirement:read"
  | "retirement:create"
  | "early-retirement:read"
  | "early-retirement:create"
  | "export:read"
  | "export:all"
  | "audit:read"
  | "security:read"
  | "monitoring:read"
  | "admin:user"
  | "admin:role"
  | "admin:config"
  | "admin:break-glass"
  | "document:upload"
  | "document:download"
  | "document:delete"
  | "welfare:read"
  | "welfare:approve"
  | "housing:read"
  | "housing:approve"
  | "succession:read"
  | "recruitment:read"
  | "recruitment:hire";

export type AccessLevel =
  | "Private"
  | "DiocesanHR"
  | "Board"
  | "Archdeaconry"
  | "Parish"
  | "Institution"
  | "DioceseWide"
  | "SuperAdmin";

export interface PermissionConfig {
  id: string;
  code: PermissionCategory;
  description: string;
  category: PermissionCategory;
  level: AccessLevel;
  requiresScope: boolean;
  isGrantable: boolean;
  isSensitive: boolean;
}
