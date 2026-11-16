/**
 * DHRMIS - Employee Master Types - Phase 2
 * Employee CRUD, duplicate detection, search, and assignment management
 */

import { Employee, EmployeeCategory, LifeStatus, EmploymentStatus, Gender } from "@/types";

// ─── Employee Search & Filter Types ──────────────────────────────────────────

export interface EmployeeSearchFilters {
  employeeId?: string;
  employeeNumber?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  employeeCategory?: EmployeeCategory;
  lifeStatus?: LifeStatus;
  employmentStatus?: EmploymentStatus;
  gender?: Gender;
  archdeaconryId?: string;
  parishId?: string;
  institutionId?: string;
  boardId?: string;
  departmentId?: string;
  position?: string;
  grade?: string;
  isPrimaryAssignment?: boolean;
  hasActiveAssignment?: boolean;
  searchQuery?: string; // free text search
  page?: number;
  pageSize?: number;
}

export interface EmployeeSearchResults {
  data: Employee[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}