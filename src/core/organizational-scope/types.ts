/**
 * DHRMIS - Organizational Scope Types
 * Archdeaconry > Parish > LocalChurch (within the Diocese of Kigezi)
 * Board > Department > Institution > Position
 */


// ─── Church Hierarchy ─────────────────────────────────────────────────────────

export interface Archdeaconry {
  id: string;
  name: string;
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

// ─── Institution Hierarchy ────────────────────────────────────────────────────

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

// ─── Scope Resolution ─────────────────────────────────────────────────────────

export interface ScopeNode {
  id: string;
  name: string;
  code: string;
  level: "Archdeaconry" | "Parish" | "LocalChurch" | "Board" | "Department" | "Institution";
  parentId?: string;
  parentLevel?: string;
  path: string;
  isSensitive: boolean;
  isActive: boolean;
  depth: number;
}

export interface ScopeResult {
  userId: string;
  effectiveScopes: ScopeNode[];
  effectiveAccessLevel: "Private" | "Institution" | "Parish" | "Archdeaconry" | "Board" | "DioceseWide" | "SuperAdmin";
  canAccess: (nodeLevel: string, nodeId: string) => boolean;
  canAccessWithOverride?: (userId: string, nodeLevel: string, nodeId: string) => boolean;
  hierarchy: ScopeNode[][];
}

// ─── Hierarchy Relationships ──────────────────────────────────────────────────

export interface HierarchyRelationship {
  id: string;
  parentId: string;
  childId: string;
  parentLevel: "Archdeaconry" | "Parish" | "LocalChurch" | "Board" | "Department" | "Institution";
  childLevel: "Archdeaconry" | "Parish" | "LocalChurch" | "Board" | "Department" | "Institution";
  relationshipType: "Contains" | "LocatedIn" | "BelongsTo" | "ReportsTo";
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Configuration ────────────────────────────────────────────────────────────

export interface OrganizationalConfig {
  id: string;
  archdeaconries: string[]; // Archdeaconry IDs
  parishes: string[]; // Parish IDs
  localChurches: string[]; // Local Church IDs
  boards: string[]; // Board IDs
  departments: string[]; // Department IDs
  institutions: string[]; // Institution IDs
  defaultArchdeaconryId?: string;
  defaultParishId?: string;
  defaultLocalChurchId?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
