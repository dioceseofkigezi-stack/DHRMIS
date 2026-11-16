/**
 * DHRMIS - Authorization & Security Types
 * Role-based access control, permission management, organizational scopes
 */

import { PermissionCategory, AccessLevel, RoleLevel } from "@/types";

// ─── Organizational Scope ─────────────────────────────────────────────────────

export interface OrganizationalScope {
  id: string;
  scopeType: "Diocese" | "Archdeaconry" | "Parish" | "Institution" | "Department" | "Board";
  scopeId: string;
  scopeName: string;
  hierarchyPath: string; // e.g. "Diocese/Archdeaconry/Parish"
  level: "DioceseWide" | "Board" | "Archdeaconry" | "Parish" | "Institution" | "Private";
  isSensitive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Role & Permission Management ─────────────────────────────────────────────

export interface Role {
  id: string;
  code: RoleLevel;
  name: string;
  description: string;
  level: AccessLevel;
  permissions: PermissionCategory[];
  isDefault: boolean;
  isActive: boolean;
  requiresApproval: boolean;
  isSystemRole: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Permission {
  id: string;
  code: PermissionCategory;
  name: string;
  description: string;
  category: PermissionCategory;
  accessLevel: AccessLevel;
  requiresScope: boolean;
  isGrantable: boolean;
  isSensitive: boolean;
  isHighRisk: boolean;
  isAuditRequired: boolean;
  isMakerCheckerRequired: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Scope Resolution ─────────────────────────────────────────────────────────

export interface ScopeResolution {
  userId: string;
  effectiveScopes: OrganizationalScope[];
  effectivePermissions: PermissionCategory[];
  roleBasedPermissions: PermissionCategory[];
  scopeBasedPermissions: PermissionCategory[];
  effectiveAccessLevel: AccessLevel;
  exactMatchScopes: OrganizationalScope[];
  parentScopes: OrganizationalScope[];
  childScopes: OrganizationalScope[];
  scopeHierarchy: string[];
  canAccess: (recordScope: string) => boolean;
  canPerform: (permission: PermissionCategory) => boolean;
  canAccessRecord: (record: { scope?: string; employeeId?: string; archdeaconryId?: string; parishId?: string; institutionId?: string }) => boolean;
}

// ─── Permission Checking ──────────────────────────────────────────────────────

export interface PermissionCheck {
  userId: string;
  requiredPermission: PermissionCategory;
  userRole: RoleLevel;
  userScopes: OrganizationalScope[];
  userPermissions: PermissionCategory[];
  canAccess: boolean;
  reason?: "RoleMissing" | "ScopeMissing" | "PermissionMissing" | "SensitiveAccess" | "Success";
  requiredScope?: string;
  effectivePermissions?: PermissionCategory[];
}

// ─── User & Role Assignment ───────────────────────────────────────────────────

export interface UserRole {
  id: string;
  userId: string;
  roleCode: RoleLevel;
  assignedBy: string;
  assignmentDate: Date;
  activationDate?: Date;
  deactivationDate?: Date;
  isActive: boolean;
  secretariatApproval?: boolean;
  boardApproval?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserScope {
  id: string;
  userId: string;
  scopeId: string;
  assignedBy: string;
  scopeType: "Diocese" | "Archdeaconry" | "Parish" | "Institution" | "Department";
  scopeName: string;
  purpose: string;
  expiresAt?: Date;
  isActive: boolean;
  assignmentDate: Date;
  deactivationDate?: Date;
  isTemporary: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Role Hierarchy ───────────────────────────────────────────────────────────

export interface RoleHierarchy {
  id: string;
  parentRole: RoleLevel;
  childRole: RoleLevel;
  inherits: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Role Assignment Workflow ─────────────────────────────────────────────────

export interface RoleAssignmentRequest {
  id: string;
  assignedBy: string;
  assignedToUser: string;
  assignedToEmployee?: string;
  proposedRole: RoleLevel;
  proposedScopes: string[];
  justification: string;
  status: "Pending" | "Approved" | "Rejected" | "Withdrawn";
  approver?: string;
  approvalDate?: Date;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Delegated Access ─────────────────────────────────────────────────────────

export interface DelegatedAccess {
  id: string;
  delegatorId: string;
  delegatorEmployee?: string;
  delegateId: string;
  delegateEmployee?: string;
  permission: PermissionCategory;
  scope: string;
  startEffectiveDate: Date;
  endEffectiveDate: Date;
  reason: string;
  status: "Active" | "Expired" | "Revoked" | "Pending";
  approvedBy?: string;
  approvalDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  revokedAt?: Date;
  revocationReason?: string;
}

// ─── Account Status ───────────────────────────────────────────────────────────

export type AccountStatus = "Active" | "Inactive" | "Suspended" | "Locked" | "Expired" | "Pending";

export interface AccountAudit {
  id: string;
  userId: string;
  action: "Create" | "Activate" | "Suspend" | "Reactivate" | "Lock" | "Unlock" | "Deactivate" | "Delete" | "Expire";
  changeBy: string;
  changeTime: Date;
  reason?: string;
  ipAddress?: string;
  deviceInfo?: string;
  previousStatus: AccountStatus;
  newStatus: AccountStatus;
}