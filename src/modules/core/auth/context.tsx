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

function sessionIdFromToken(accessToken: string) {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return "";
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const claims = JSON.parse(atob(base64)) as Record<string, unknown>;
    return typeof claims.session_id === "string" ? claims.session_id : "";
  } catch {
    return "";
  }
}

async function recordAuthSession(session: Session) {
  if (!supabase) throw new Error("The authentication service is not configured.");
  const authSessionId = sessionIdFromToken(session.access_token);
  if (!authSessionId) throw new Error("The authentication session identifier is missing.");
  const expiresAt = session.expires_at
    ? new Date(session.expires_at * 1000).toISOString()
    : new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const agent = typeof navigator === "undefined" ? "DHRMIS client" : navigator.userAgent.slice(0, 1000);
  const { error } = await supabase.from("user_sessions").upsert({
    user_id: session.user.id,
    auth_session_id: authSessionId,
    device_info: "DHRMIS web session",
    user_agent: agent,
    scope_ids: [],
    isactive: true,
    expiresat: expiresAt,
    lastactivityat: new Date().toISOString(),
  }, { onConflict: "auth_session_id" });
  if (error) throw error;
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
      try {
        await recordAuthSession(session);
      } catch {
        if (active) {
          setRoleError("Your sign-in session could not be recorded. Sign out and contact your system administrator.");
          setRoleLoading(false);
        }
        return;
      }
      const roleResult = await supabase.from("user_roles")
        .select("role_code, isactive, issuspended, accountexpiry, lockeduntil")
        .eq("user_id", session.user.id);

      if (!active) return;
      if (roleResult.error) {
        setRoleError("Unable to load your system roles.");
        setRoleLoading(false);
        return;
      }

      const now = Date.now();
      const activeRoles = (roleResult.data ?? []).filter((role) =>
        role.isactive === true &&
        role.issuspended !== true &&
        (!role.accountexpiry || Date.parse(role.accountexpiry) > now) &&
        (!role.lockeduntil || Date.parse(role.lockeduntil) <= now),
      );
      setRoles(activeRoles.map((role) => role.role_code));

      if (activeRoles.some((role) => role.role_code === "SUPER_SYSTEM_ADMIN")) {
        setPersonnelDomains([]);
        setWorkspaceDomainCodes([]);
        setRoleLoading(false);
        return;
      }

      const [scopeResult, domainResult] = await Promise.all([
        supabase.from("user_scopes")
          .select("scope_type, scope_id, isactive, expiresat")
          .eq("user_id", session.user.id),
        supabase.from("personnel_domains")
          .select("id, code, name, board_id, is_secretariat")
          .eq("is_active", true),
      ]);

      if (!active) return;
      if (scopeResult.error || domainResult.error) {
        setRoleError("Unable to load your organizational access scopes.");
        setRoleLoading(false);
        return;
      }

      const activeScopes = (scopeResult.data ?? []).filter((scope) =>
        scope.isactive === true && (!scope.expiresat || Date.parse(scope.expiresat) > now),
      );
      const domains: PersonnelDomain[] = (domainResult.data ?? []).map((domain) => ({
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
      const { data } = await supabase.auth.getSession();
      const current = data.session;
      if (current) {
        const authSessionId = sessionIdFromToken(current.access_token);
        if (authSessionId) {
          await supabase.from("user_sessions").update({ isactive: false })
            .eq("user_id", current.user.id)
            .eq("auth_session_id", authSessionId)
            .eq("isactive", true);
        }
      }
      const { error } = await supabase.auth.signOut({ scope: "local" });
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
