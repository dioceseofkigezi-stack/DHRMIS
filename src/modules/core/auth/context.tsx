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
  roleUserId: string | null;
  roleLoading: boolean;
  roleError: string;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

interface CurrentWorkspaceRecord {
  role_code: string;
  domain_id: string | null;
  domain_code: string | null;
  domain_name: string | null;
  board_id: string | null;
  is_secretariat: boolean | null;
}

interface UserRoleRecord {
  role_code: string;
  isactive: boolean | null;
  issuspended: boolean | null;
  accountexpiry: string | null;
  lockeduntil: string | null;
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
  const [roleUserId, setRoleUserId] = useState<string | null>(null);
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
    async function loadCurrentWorkspace() {
      setRoleError("");
      setRoles([]);
      setPersonnelDomains([]);
      setWorkspaceDomainCodes([]);
      setRoleUserId(null);
      if (!session || !supabase) {
        setRoleLoading(false);
        return;
      }
      const currentSession = session;
      const supabaseClient = supabase;

      setRoleLoading(true);
      async function recoverSystemAdminRole() {
        try {
          const roleResult = await supabaseClient.from("user_roles")
            .select("role_code, isactive, issuspended, accountexpiry, lockeduntil")
            .eq("user_id", currentSession.user.id);
          if (!active || roleResult.error) return false;

          const now = Date.now();
          const activeRoles = ((roleResult.data ?? []) as UserRoleRecord[]).filter((role) =>
            role.isactive === true &&
            role.issuspended !== true &&
            (!role.accountexpiry || Date.parse(role.accountexpiry) > now) &&
            (!role.lockeduntil || Date.parse(role.lockeduntil) <= now),
          );
          if (activeRoles.length !== 1 || activeRoles[0].role_code !== "SUPER_SYSTEM_ADMIN") return false;

          setRoles(["SUPER_SYSTEM_ADMIN"]);
          setPersonnelDomains([]);
          setWorkspaceDomainCodes([]);
          setRoleError("");
          setRoleUserId(currentSession.user.id);
          setRoleLoading(false);
          return true;
        } catch {
          return false;
        }
      }

      try {
        await recordAuthSession(currentSession);
      } catch {
        if (await recoverSystemAdminRole()) return;
        if (active) {
          setRoleError("Your sign-in session could not be recorded. Sign out and contact your system administrator.");
          setRoleLoading(false);
          setRoleUserId(currentSession.user.id);
        }
        return;
      }
      const workspaceResult = await supabaseClient.rpc("get_current_workspace");

      if (!active) return;
      if (workspaceResult.error) {
        if (await recoverSystemAdminRole()) return;
        if (!active) return;
        setRoleError("Unable to load your assigned workspace.");
        setRoleLoading(false);
        setRoleUserId(currentSession.user.id);
        return;
      }

      const workspaces = (workspaceResult.data ?? []) as CurrentWorkspaceRecord[];
      if (workspaces.length === 0 && await recoverSystemAdminRole()) return;
      if (!active) return;
      if (workspaces.length > 1) {
        setRoleError("Your account has more than one active workspace assignment. Contact your system administrator.");
        setRoleLoading(false);
        setRoleUserId(currentSession.user.id);
        return;
      }

      const currentWorkspace = workspaces[0];
      if (currentWorkspace) {
        if (currentWorkspace.role_code !== "SUPER_SYSTEM_ADMIN" &&
            (!currentWorkspace.domain_id || !currentWorkspace.domain_code || currentWorkspace.domain_name === null || currentWorkspace.is_secretariat === null)) {
          setRoleError("Your assigned workspace could not be resolved.");
          setRoleLoading(false);
          setRoleUserId(currentSession.user.id);
          return;
        }
        setRoles([currentWorkspace.role_code]);
        if (currentWorkspace.domain_id && currentWorkspace.domain_code && currentWorkspace.domain_name !== null && currentWorkspace.is_secretariat !== null) {
          const domain: PersonnelDomain = {
            id: currentWorkspace.domain_id,
            code: currentWorkspace.domain_code,
            name: currentWorkspace.domain_name,
            boardId: currentWorkspace.board_id,
            isSecretariat: currentWorkspace.is_secretariat,
          };
          setPersonnelDomains([domain]);
          setWorkspaceDomainCodes([domain.code]);
        }
      }
      setRoleUserId(currentSession.user.id);
      setRoleLoading(false);
    }

    void loadCurrentWorkspace();
    return () => { active = false; };
  }, [session]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    loading,
    roles,
    personnelDomains,
    workspaceDomainCodes,
    roleUserId,
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
  }), [session, loading, roles, personnelDomains, workspaceDomainCodes, roleUserId, roleLoading, roleError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider.");
  return context;
}
