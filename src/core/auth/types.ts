/**
 * DHRMIS - Authentication & Session Types
 * Supabase Auth, Session Management, Account Security
 */

import { RoleLevel, PermissionCategory } from "@/types";

// ─── Auth Configuration ───────────────────────────────────────────────────────

export interface AuthConfig {
  emailRequired: boolean;
  usernameAllowed: boolean;
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
  changeMethod: "Manual" | "Reset";
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
  | "AccountInactiveExpired"
  | "BreakGlassRequired"
  | "SessionExpired"
  | "RateLimited";

export interface LoginRequest {
  identifier: string; // email or phone
  password: string;
  rememberDevice?: boolean;
}

export interface LoginResponse {
  user: DbUser;
  session: AuthSession;
  accessToken: string;
  refreshToken: string;
  loginStatus: LoginStatus;
}

export interface LogoutResponse {
  success: boolean;
  revokedSessions: string[];
  totalSessionsRevoked: number;
}
