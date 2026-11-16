import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublicKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase =
  supabaseUrl && supabasePublicKey
    ? createClient(supabaseUrl, supabasePublicKey)
    : null;

/**
 * RLS Security Checklist
 *
 * WARNING: The following patterns are NEVER allowed for confidential HR data:
 * - USING (true)
 * - FOR ALL TABLES: "SELECT count(*) > 0 FROM pg_user WHERE usename = current_user"
 * - "WITH CHECK (current_setting('request.jwt.claim')('id') = 'some-user-id')"
 *
 * All policies must:
 * 1. Reference the authenticated user via auth.uid()
 * 2. Check against the user's actual record fields (employee_id, scope, etc.)
 * 3. Use database constraints and transactions for high-risk operations
 * 4. Be reviewed and tested before deployment
 *
 * Example secure policy:
 *   CREATE POLICY "hr_users_read_own_data" ON employees
 *     FOR SELECT USING (auth.uid() = user_id);
 */

export const RLS_ENABLED = true;
export const SERVICE_ROLE_ONLY_TABLES = [
  // Tables that require service-role access
  "audit_logs",
  "sensitive_read_logs",
  "security_events",
  "user_role_assignments",
  "user_scope_assignments",
  "break_glass_access",
  "delegated_access",
  "user_mfa",
  "password_resets",
];

export const CLIENT_ACCESSIBLE_TABLES = [
  // Tables that can be accessed by frontend with RLS
  "employees",
  "assignments",
  "employee_roles",
  "vacancies",
  "applicants",
  "recruitment_applications",
  "leave_records",
  "qualifications",
  "training_records",
  "professional_licences",
  "dietary_restrictions", // hypothetical
  "documents",
  "notifications",
];

// RLS must NOT be disabled on these tables
export const RLS_REQUIRED_TABLES = [
  "employees",
  "assignments",
  "employee_roles",
  "documents",
  "audit_logs",
  "sensitive_read_logs",
  "security_events",
  "leave_records",
  "safeguarding_cases",
  "disciplinary_cases",
  "employee_death_records",
  "retirement",
  "early_retirement_applications",
  "payroll_records",
  "benefit",
  "pension",
  "welfare",
  "housing",
  "qualifications",
  "training_records",
  "professional_licences",
  "performance_appraisals",
  "appointments",
  "promotions",
  "discipline_cases",
  "safeguarding_cases",
  "employee_death_records",
  "next_of_kin",
  "spouse",
  "child",
  "publications",
];
