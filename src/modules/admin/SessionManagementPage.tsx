import { useCallback, useEffect, useState } from "react";
import { canAccessModule } from "@/app/modules";
import { Icon } from "@/components/ui/Icon";
import { supabase } from "@/core/config";
import { useToast } from "@/core/notifications/ToastProvider";
import { useAuth } from "@/modules/core/auth/context";

interface ManagedSession {
  id: string;
  user_id: string | null;
  auth_session_id: string | null;
  device_info: string | null;
  ip_address: string | null;
  user_agent: string | null;
  isactive: boolean | null;
  expiresat: string;
  createdat: string | null;
  lastactivityat: string | null;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function getSessionId(accessToken: string) {
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

export default function SessionManagementPage() {
  const { roles, session } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<ManagedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState("");
  const [error, setError] = useState("");
  const canView = canAccessModule("/admin/sessions", roles);

  const loadSessions = useCallback(async () => {
    if (!supabase || !canView) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const { data, error: queryError } = await supabase
      .from("user_sessions")
      .select("id,user_id,auth_session_id,device_info,ip_address,user_agent,isactive,expiresat,createdat,lastactivityat")
      .order("createdat", { ascending: false });
    if (queryError) {
      setError("Sign-in sessions could not be loaded. Check your access and try again.");
      setRows([]);
    } else {
      setRows((data ?? []) as ManagedSession[]);
    }
    setLoading(false);
  }, [canView]);

  useEffect(() => { void loadSessions(); }, [loadSessions]);

  async function revoke(row: ManagedSession) {
    if (!supabase || !row.isactive || revoking) return;
    setRevoking(row.id);
    setError("");
    const { data, error: updateError } = await supabase
      .from("user_sessions")
      .update({ isactive: false })
      .eq("id", row.id)
      .eq("isactive", true)
      .select("id")
      .maybeSingle();
    if (updateError || !data) {
      setError("The selected session could not be revoked. It may already be inactive.");
      setRevoking("");
      return;
    }
    const isCurrentSession = Boolean(session && row.user_id === session.user.id
      && row.auth_session_id !== null
      && row.auth_session_id === getSessionId(session.access_token));
    if (isCurrentSession) {
      await supabase.auth.signOut({ scope: "local" });
      return;
    }
    toast("Session access revoked.", "success");
    setRows((current) => current.map((item) => item.id === row.id ? { ...item, isactive: false } : item));
    setRevoking("");
  }

  if (!canView) return <div className="page-content"><div className="empty-state"><h2>Access restricted</h2><p>Only platform administrators can manage sign-in sessions.</p></div></div>;

  return (
    <div className="page-content">
      <header className="page-heading">
        <div><p className="eyebrow">PLATFORM ADMINISTRATION</p><h1><Icon name="shield" size={23} />Session management</h1><p className="muted">Review recorded sign-ins and revoke access. Revoked sessions are denied by database policies.</p></div>
        <button className="button button-secondary" type="button" onClick={() => void loadSessions()} disabled={loading}><Icon name="refresh" size={14} />Refresh</button>
      </header>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      <section className="panel">
        {loading ? <p className="muted" role="status">Loading sessions…</p> : rows.length === 0 ? <div className="empty-state"><h2>No recorded sessions</h2><p>Sessions appear here after their signed-in accounts refresh their access.</p></div> : <div className="table-scroll"><table>
          <thead><tr><th>Account ID</th><th>Device</th><th>IP address</th><th>Created</th><th>Last activity</th><th>Expires</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>{rows.map((row) => {
            const active = row.isactive === true && Date.parse(row.expiresat) > Date.now();
            return <tr key={row.id}>
              <td><code>{row.user_id ?? "Unknown"}</code></td>
              <td title={row.user_agent ?? undefined}>{row.device_info || "Browser session"}</td>
              <td>{row.ip_address || "Not recorded"}</td>
              <td>{formatDate(row.createdat)}</td>
              <td>{formatDate(row.lastactivityat)}</td>
              <td>{formatDate(row.expiresat)}</td>
              <td><span className={`panel-badge${active ? "" : " panel-badge-muted"}`}>{active ? "Active" : "Inactive"}</span></td>
              <td>{active ? <button className="text-button" type="button" onClick={() => void revoke(row)} disabled={Boolean(revoking)}><Icon name="shield" size={13} />{revoking === row.id ? "Revoking…" : "Revoke"}</button> : "—"}</td>
            </tr>;
          })}</tbody>
        </table></div>}
      </section>
    </div>
  );
}
