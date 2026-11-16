import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/core/config";
import type { PersonnelDomain } from "@/core/organizational-scope/workspaces";

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  roles: string[];
  personnelDomains: PersonnelDomain[];
  workspaceDomainCodes: string[];
  roleLoading: boolean;
  roleError: string;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [roles, setRoles] = useState<string[]>([]);
  const [personnelDomains, setPersonnelDomains] = useState<PersonnelDomain[]>([]);
  const [workspaceDomainCodes, setWorkspaceDomainCodes] = useState<string[]>([]);
  const [roleLoading, setRoleLoading] = useState(Boolean(supabase));
  const [roleError, setRoleError] = useState("");

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
      setPersonnelDomains([]);
      setWorkspaceDomainCodes([]);
      if (!session || !supabase) {
        setRoleLoading(false);
        return;
      }

      setRoleLoading(true);
      const { data, error } = await supabase
        .from("user_roles")
        .select("role_code, isactive, issuspended, accountexpiry, lockeduntil")
        .eq("user_id", session.user.id);

      if (!active) return;
      if (error) {
        setRoleError("Unable to load your system roles.");
        setRoleLoading(false);
        return;
      }

      const now = Date.now();
      const activeRoles = (data ?? []).filter((role) =>
          role.isactive === true &&
          role.issuspended !== true &&
          (!role.accountexpiry || Date.parse(role.accountexpiry) > now) &&
          (!role.lockeduntil || Date.parse(role.lockeduntil) <= now),
        );
      setRoles(activeRoles.map((role) => role.role_code));

      const [{ data: scopeRows, error: scopeError }, { data: domainRows, error: domainError }] = await Promise.all([
        supabase.from("user_scopes")
          .select("scope_type, scope_id, isactive, expiresat")
          .eq("user_id", session.user.id),
        supabase.from("personnel_domains")
          .select("id, code, name, board_id, is_secretariat")
          .eq("is_active", true),
      ]);
      if (!active) return;
      if (scopeError || domainError) {
        setRoleError("Unable to load your organizational access scopes.");
        setRoleLoading(false);
        return;
      }

      const activeScopes = (scopeRows ?? []).filter((scope) =>
        scope.isactive === true && (!scope.expiresat || Date.parse(scope.expiresat) > now),
      );
      const domains: PersonnelDomain[] = (domainRows ?? []).map((domain) => ({
        id: domain.id,
        code: domain.code,
        name: domain.name,
        boardId: domain.board_id,
        isSecretariat: domain.is_secretariat,
      }));
      setPersonnelDomains(domains);

      const boardScopeIds = new Set(activeScopes.filter((scope) => scope.scope_type === "Board").map((scope) => scope.scope_id));
      const personnelDomainScopeIds = new Set(activeScopes.filter((scope) => scope.scope_type === "PersonnelDomain").map((scope) => scope.scope_id));
      const departmentScopeIds = activeScopes.filter((scope) => scope.scope_type === "Department").map((scope) => scope.scope_id);
      const institutionScopeIds = activeScopes.filter((scope) => scope.scope_type === "Institution").map((scope) => scope.scope_id);
      const legacyBoardIds = new Set<string>();

      if (departmentScopeIds.length || institutionScopeIds.length) {
        const [departmentResult, institutionResult] = await Promise.all([
          departmentScopeIds.length
            ? supabase.from("departments").select("id, board_id").in("id", departmentScopeIds)
            : Promise.resolve({ data: [], error: null }),
          institutionScopeIds.length
            ? supabase.from("institutions").select("id, board_id").in("id", institutionScopeIds)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (!active) return;
        if (departmentResult.error || institutionResult.error) {
          setRoleError("Unable to load your organizational access scopes.");
          setRoleLoading(false);
          return;
        }
        for (const row of [...departmentResult.data ?? [], ...institutionResult.data ?? []]) {
          if (row.board_id) legacyBoardIds.add(row.board_id);
        }
      }

      const domainCodes = domains.filter((domain) =>
        personnelDomainScopeIds.has(domain.id) || Boolean(domain.boardId && (boardScopeIds.has(domain.boardId) || legacyBoardIds.has(domain.boardId))),
      ).map((domain) => domain.code);
      if (activeRoles.some((role) => role.role_code === "SuperAdministrator")) {
        domainCodes.push(...domains.map((domain) => domain.code));
      }
      if (activeRoles.some((role) => ["ArchdeaconryAdmin", "ParishAdmin"].includes(role.role_code)) &&
          activeScopes.some((scope) => ["Archdeaconry", "Parish"].includes(scope.scope_type))) {
        domainCodes.push("SECRETARIAT");
      }
      setWorkspaceDomainCodes([...new Set(domainCodes)]);

      setRoleLoading(false);
    }

    void loadRoles();
    return () => { active = false; };
  }, [session]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    loading,
    roles,
    personnelDomains,
    workspaceDomainCodes,
    roleLoading,
    roleError,
    signIn: async (email, password) => {
      if (!supabase) throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and a publishable or anon client key to .env.");
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    signOut: async () => {
      if (!supabase) return;
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
  }), [session, loading, roles, personnelDomains, workspaceDomainCodes, roleLoading, roleError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider.");
  return context;
}
