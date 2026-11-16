/**
 * DHRMIS - Authentication & Session Types
 * Supabase Auth, MFA, Session Management, Account Security
 */

import { RoleLevel, PermissionCategory } from "@/types";

// ─── Auth Configuration ───────────────────────────────────────────────────────

export interface AuthConfig {
  emailRequired: boolean;
  usernameAllowed: boolean;
  enableMfa: boolean;
  enablePasswordReset: boolean;
  enablePhoneAuth: boolean;
  passwordMinLength: number;
  passwordRequirements: string[];
  sessionExpiryMinutes: number;
  refreshTokenExpiryDays: number;
  accountLockoutThreshold: number;
  accountLockoutDurationMinutes: number;
  breakGlassEnabled: boolean;
  breakGlassExpiryMinutes: number;
}

// ─── User Types ───────────────────────────────────────────────────────────────

export interface DbUser {
  id: string;
  email: string;
  phone?: string;
  user_metadata: {
    fullName: string;
    employeeId?: string;
    role: RoleLevel;
    permissions: PermissionCategory[];
    scopes: string[];
    isActive: boolean;
    isSuspended: boolean;
    isMfaEnabled: boolean;
    mfaSecret?: string;
    mfaRecoveryCodes?: string[];
    accountExpiry?: Date;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
  };
  app_metadata: {
    providers: string[];
    lastLoginAt?: Date;
  };
  aud: string;
  role: string;
  isAnonymous: boolean;
  confirmedAt?: Date;
  lastSignInAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Session Types ────────────────────────────────────────────────────────────

export interface AuthSession {
  id: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  deviceInfo?: string;
  ipAddress?: string;
  userAgent?: string;
  scopeIds?: string[];
  expiresAt: Date;
  createdAt: Date;
  lastActivityAt: Date;
  isActive: boolean;
}

// ─── MFA Types ────────────────────────────────────────────────────────────────

export interface MFAEnrollment {
  id: string;
  userId: string;
  authenticatorType: "totp" | "sms";
  secret: string;
  qrCodeUri?: string;
  backupCodes: string[];
  isVerified: boolean;
  createdAt: Date;
  verifiedAt?: Date;
}

export interface MFAVerifyRequest {
  verificationCode: string;
  password?: string; // For password + MFA
}

export interface MFARecoveryRequest {
  recoveryCode: string;
}

// ─── Account Management Types ─────────────────────────────────────────────────

export interface AccountManager {
  id: string;
  userId: string;
  employeeId?: string;
  email: string;
  phone?: string;
  password?: string;
  role: RoleLevel;
  permissions: PermissionCategory[];
  scopes: string[];
  isActive: boolean;
  isSuspended: boolean;
  isMfaEnabled: boolean;
  accountExpiry?: Date;
  loginAttempts: number;
  lockedUntil?: Date;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Password Management ──────────────────────────────────────────────────────

export interface PasswordResetToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  usedAt?: Date;
  createdAt: Date;
}

export interface PasswordChangeLog {
  id: string;
  userId: string;
  oldPasswordHash?: string;
  newPasswordHash?: string;
  changeMethod: "Manual" | "Reset" | "Mfa";
  ipAddress?: string;
  deviceInfo?: string;
  timestamp: Date;
}

// ─── External Identity Provider ───────────────────────────────────────────────

export type AuthProvider = "email" | "google" | "microsoft" | "github" | "discord" | "twitch" | "apple" | "zoom";

export interface SocialProviderConfig {
  id: string;
  provider: AuthProvider;
  clientId: string;
  clientSecret: string;
  isEnabled: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Session Flow Types ───────────────────────────────────────────────────────

export type LoginStatus =
  | "Pending"
  | "Success"
  | "InvalidCredentials"
  | "AccountLocked"
  | "AccountInactive"
  | "MfaRequired"
  | "MfaVerifyFailed"
  | "AccountInactiveExpired"
  | "BreakGlassRequired"
  | "MfaRecoveryRequired"
  | "SessionExpired"
  | "RateLimited";

export interface LoginRequest {
  identifier: string; // email or phone
  password: string;
  mfaCode?: string;
  rememberDevice?: boolean;
}

export interface LoginResponse {
  user: DbUser;
  session: AuthSession;
  accessToken: string;
  refreshToken: string;
  mfaRequired: boolean;
  mfaEnrollmentId?: string;
  loginStatus: LoginStatus;
}

export interface LogoutResponse {
  success: boolean;
  revokedSessions: string[];
  totalSessionsRevoked: number;
}