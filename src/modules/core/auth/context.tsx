import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/core/config";

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  roles: string[];
  roleLoading: boolean;
  roleError: string;
  mfaChallengeRequired: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const MFA_REQUIRED_ROLES = new Set([
  "SuperAdministrator", "SystemAdministrator", "CentralHR", "BoardHR",
  "ArchdeaconryAdmin", "ParishAdmin", "InstitutionAdmin", "FinanceOfficer",
  "RegistryOfficer", "SafeguardingOfficer", "ICTAdministrator", "Auditor",
]);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [roles, setRoles] = useState<string[]>([]);
  const [roleLoading, setRoleLoading] = useState(Boolean(supabase));
  const [roleError, setRoleError] = useState("");
  const [mfaChallengeRequired, setMfaChallengeRequired] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) console.error("Unable to restore the current session:", error.message);
      setSession(data.session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadRoles() {
      setRoleError("");
      setRoles([]);
      if (!session || !supabase) {
        setRoleLoading(false);
        setMfaChallengeRequired(false);
        return;
      }

      setRoleLoading(true);
      const { data, error } = await supabase
        .from("user_roles")
        .select("role_code, isActive, isSuspended, isMfaEnabled, accountExpiry, lockedUntil")
        .eq("user_id", session.user.id);

      if (!active) return;
      if (error) {
        setRoleError("Unable to load your system roles.");
        setMfaChallengeRequired(false);
        setRoleLoading(false);
        return;
      }

      const now = Date.now();
      const activeRoles = (data ?? []).filter((role) =>
          role.isActive === true &&
          role.isSuspended !== true &&
          (!role.accountExpiry || Date.parse(role.accountExpiry) > now) &&
          (!role.lockedUntil || Date.parse(role.lockedUntil) <= now),
        );
      setRoles(activeRoles.map((role) => role.role_code));
      const requiresMfa = activeRoles.some((role) =>
        role.isMfaEnabled === true || MFA_REQUIRED_ROLES.has(role.role_code),
      );
      if (requiresMfa) {
        const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (!active) return;
        setMfaChallengeRequired(assuranceError ? true : assurance.currentLevel !== "aal2");
      } else {
        setMfaChallengeRequired(false);
      }
      setRoleLoading(false);
    }

    void loadRoles();
    return () => { active = false; };
  }, [session]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    loading,
    roles,
    roleLoading,
    roleError,
    mfaChallengeRequired,
    signIn: async (email, password) => {
      if (!supabase) throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and a publishable or anon client key.");
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    signOut: async () => {
      if (!supabase) return;
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
  }), [session, loading, roles, roleLoading, roleError, mfaChallengeRequired]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider.");
  return context;
}
