import { useCallback, useEffect, useState } from "react";
import { canAccessModule } from "@/app/modules";
import ConfirmDialog from "@/components/feedback/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import { supabase } from "@/core/config";
import { useToast } from "@/core/notifications/ToastProvider";
import { useNetworkStatus } from "@/core/monitoring/useNetworkStatus";
import { useAuth } from "@/modules/core/auth/context";
import { ADMIN_PAGE_SIZE, AdminNotice, AdminPageHeader, AdminPagination, AdminStatus, adminErrorMessage, formatAdminDate } from "./AdminConsoleShared";

interface ManagedSession {
  id: string;
  user_id: string | null;
  email: string | null;
  full_name: string | null;
  auth_session_id: string | null;
  device_info: string | null;
  ip_address: string | null;
  user_agent: string | null;
  isactive: boolean | null;
  expiresat: string;
  createdat: string | null;
  lastactivityat: string | null;
  total_count: number;
}

function sessionIdFromToken(accessToken: string) {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return "";
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const decoded = JSON.parse(atob(base64)) as Record<string, unknown>;
    return typeof decoded.session_id === "string" ? decoded.session_id : "";
  } catch { return ""; }
}

function sessionIsActive(row: ManagedSession) {
  return row.isactive === true && Date.parse(row.expiresat) > Date.now();
}

export default function SessionManagementPage() {
  const { roles, session } = useAuth();
  const toast = useToast();
  const online = useNetworkStatus();
  const canView = canAccessModule("/admin/sessions", roles);
  const [rows, setRows] = useState<ManagedSession[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<ManagedSession | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedSearch(search.trim()); setPage(0); }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => { setPage(0); }, [statusFilter]);

  const loadSessions = useCallback(async () => {
    if (!canView) { setRows([]); setTotal(0); setLoading(false); return; }
    if (!supabase) { setRows([]); setTotal(0); setError("The system data service is not configured."); setLoading(false); return; }
    setLoading(true); setError("");
    const { data, error: queryError } = await supabase.rpc("admin_list_session_access", {
      search_text: debouncedSearch || null,
      active_filter: statusFilter === "" ? null : statusFilter === "active",
      page_size: ADMIN_PAGE_SIZE,
      page_offset: page * ADMIN_PAGE_SIZE,
    });
    if (queryError) {
      setRows([]); setTotal(0);
      setError(adminErrorMessage(queryError, "Sign-in sessions could not be loaded."));
    } else {
      const sessions = (data ?? []) as ManagedSession[];
      setRows(sessions); setTotal(Number(sessions[0]?.total_count ?? 0));
    }
    setLoading(false);
  }, [canView, debouncedSearch, page, statusFilter]);

  useEffect(() => { void loadSessions(); }, [loadSessions]);

  async function revokeSession() {
    if (!pending || !supabase) return;
    setBusy(true); setError("");
    const { data, error: updateError } = await supabase.from("user_sessions").update({ isactive: false })
      .eq("id", pending.id).eq("isactive", true).select("id").maybeSingle();
    if (updateError || !data) {
      setError(adminErrorMessage(updateError, "The selected session could not be revoked. It may already be inactive."));
      setBusy(false);
      return;
    }
    const isCurrentSession = Boolean(session && pending.user_id === session.user.id
      && pending.auth_session_id === sessionIdFromToken(session.access_token));
    setPending(null);
    if (isCurrentSession) {
      toast("This session was revoked. You are being signed out.", "success");
      await supabase.auth.signOut({ scope: "local" });
      return;
    }
    toast("Session access revoked.", "success");
    await loadSessions();
    setBusy(false);
  }

  if (!canView) return <div className="page-content"><div className="empty-state"><h2>Access restricted</h2><p>Only platform administrators can manage sign-in sessions.</p></div></div>;
  return <div className="page-content admin-console-page">
    <AdminPageHeader title="Sessions & devices" description="Review tracked sign-ins and revoke session access when a device should no longer be trusted." icon="shield" actions={<button className="button button-secondary" type="button" onClick={() => void loadSessions()} disabled={loading}><Icon name="refresh" size={14} />Refresh</button>} />
    {error && <AdminNotice>{error}</AdminNotice>}
    {!online && <AdminNotice tone="warning">You are offline. Session revocation is unavailable until the connection returns.</AdminNotice>}
    <div className="admin-access-explainer"><Icon name="shield" size={16} /><span>Revoked sessions are rejected by database authorization checks. Passwords and access tokens are never displayed here.</span></div>
    <section className="panel admin-directory-panel" aria-label="Sign-in sessions">
      <div className="admin-table-toolbar">
        <div><strong>{total.toLocaleString()}</strong><span> tracked sessions</span></div>
        <div className="admin-filter-controls">
          <label className="search-box"><Icon name="search" size={14} /><input aria-label="Search sessions" placeholder="Search account, device or IP" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <label className="admin-filter-label">Status<select aria-label="Filter session status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All sessions</option><option value="active">Active</option><option value="inactive">Inactive or expired</option></select></label>
        </div>
      </div>
      {loading ? <div className="admin-table-state" role="status"><span className="loading-spinner" />Loading recorded sessions…</div>
        : rows.length === 0 ? <div className="admin-table-state"><strong>No matching sessions</strong><span>Sessions appear after a signed-in account records its device.</span></div>
          : <div className="table-scroll"><table className="admin-data-table"><thead><tr><th>Account</th><th>Device</th><th>IP address</th><th>Created</th><th>Last activity</th><th>Expires</th><th>Status</th><th>Action</th></tr></thead><tbody>{rows.map((row) => {
            const active = sessionIsActive(row);
            return <tr key={row.id}>
              <td><strong>{row.full_name || "Name not provided"}</strong><small>{row.email || row.user_id || "Unknown account"}</small></td>
              <td title={row.user_agent || undefined}>{row.device_info || "Browser session"}<small>{row.user_agent || "Device details not recorded"}</small></td>
              <td>{row.ip_address || "Not recorded"}</td><td>{formatAdminDate(row.createdat)}</td><td>{formatAdminDate(row.lastactivityat)}</td><td>{formatAdminDate(row.expiresat)}</td>
              <td><AdminStatus tone={active ? "success" : "neutral"}>{active ? "Active" : "Inactive"}</AdminStatus></td>
              <td>{active ? <button className="text-button admin-danger-link" type="button" onClick={() => setPending(row)} disabled={!online}>Revoke</button> : "—"}</td>
            </tr>;
          })}</tbody></table></div>}
      {!loading && <AdminPagination page={page} total={total} onPage={setPage} />}
    </section>
    {pending && <ConfirmDialog title="Revoke this session?" confirmLabel="Revoke session" destructive busy={busy} onCancel={() => setPending(null)} onConfirm={() => void revokeSession()}>
      <p>This account will be signed out from the selected device. Its next request will fail the tracked-session check.</p>
      <p className="admin-confirm-detail"><strong>{pending.full_name || pending.email || pending.user_id}</strong><br />{pending.device_info || "Browser session"} · {pending.ip_address || "IP not recorded"}<br />Last activity: {formatAdminDate(pending.lastactivityat)}</p>
    </ConfirmDialog>}
  </div>;
}
