/**
 * DHRMIS - Personal Records Types
 * Employee, Family, Spouse, Child, NextOfKin
 */

import { Gender, LifeStatus, EmploymentStatus, EmployeeCategory, DocumentAccess } from "./core";

// ─── Core Employee Type ───────────────────────────────────────────────────────

export interface Employee {
  id: string;
  employeeId: string; // Permanent unique ID
  employeeNumber: string;
  title: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  alternativeNames?: string;
  gender: Gender;
  dateOfBirth?: Date;
  placeOfBirth?: string;
  nationality?: string;
  nationalId?: string;
  passportNumber?: string;
  telephone?: string;
  email: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactTelephone?: string;
  emergencyContactRelationship?: string;
  employeeCategory: EmployeeCategory;
  lifeStatus: LifeStatus;
  dateOfDeath?: Date;
  dateOfSeparation?: Date;
  employmentStatus: EmploymentStatus;
  photoId?: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date;
}

// ─── Personal Details (Embedded/Reference) ────────────────────────────────────

export interface PersonalDetail {
  id: string;
  employeeId: string;
  title: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  alternativeNames?: string;
  gender: Gender;
  dateOfBirth?: Date;
  placeOfBirth?: string;
  nationality?: string;
  nationalId?: string;
  passportNumber?: string;
  telephone?: string;
  email: string;
  address?: string;
  isSensitive: boolean; // Enhances access restrictions
  createdAt: Date;
  updatedAt: Date;
}

// ─── Family Relationships ─────────────────────────────────────────────────────

export interface Spouse {
  id: string;
  employeeId: string;
  fullName: string;
  dateOfBirth?: Date;
  identification?: string;
  telephone?: string;
  email?: string;
  occupation?: string;
  employerBusiness?: string;
  address?: string;
  marriageDate?: Date;
  marriageStatus: "Married" | "Single" | "Divorced" | "Widowed" | "Separated";
  marriageDocumentId?: string;
  isEmergencyContact: boolean;
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Child {
  id: string;
  employeeId: string;
  fullName: string;
  dateOfBirth: Date;
  gender: Gender;
  relationship: string;
  identification?: string;
  birthCertificateNumber?: string;
  school?: string;
  educationLevel?: string;
  isDependant: boolean;
  isSensitive: boolean; // Enhanced access restrictions
  documents?: string[];
  dateAdded: Date;
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NextOfKin {
  id: string;
  employeeId: string;
  fullName: string;
  relationship: string;
  telephone?: string;
  address?: string;
  email?: string;
  identification?: string;
  priority: number;
  isEmergencyContact: boolean;
  isBeneficiaryContact: boolean;
  effectiveDate?: Date;
  verificationStatus: "Pending" | "Verified" | "Expired";
  verificationDate?: Date;
  verifiedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
}

// ─── Publications/Documentation ────────────────────────────────────────────────

export interface Publication {
  id: string;
  employeeId: string;
  publicationType: "Ordination" | "Catechist" | "Academic" | "Professional" | "Training" | "Other";
  title: string;
  issuingBody: string;
  year: number;
  documentId?: string;
  documentAccess: DocumentAccess;
  createdAt: Date;
  updatedAt: Date;
}