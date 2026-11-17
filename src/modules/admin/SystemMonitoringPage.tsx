import { useCallback, useEffect, useState } from "react";
import { canAccessModule } from "@/app/modules";
import { Link } from "react-router-dom";
import { Icon } from "@/components/ui/Icon";
import { supabase } from "@/core/config";
import { useNetworkStatus } from "@/core/monitoring/useNetworkStatus";
import { useAuth } from "@/modules/core/auth/context";
import { ADMIN_PAGE_SIZE, AdminNotice, AdminPageHeader, AdminPagination, AdminStatus, adminErrorMessage, formatAdminDate } from "./AdminConsoleShared";

interface FailedActivity {
  id: string;
  created_at: string;
  user_name: string | null;
  user_id: string | null;
  action: string;
  module: string | null;
  result: string;
  context: string | null;
  total_count: number;
}
type CheckState = "checking" | "available" | "unavailable";

export default function SystemMonitoringPage() {
  const { roles, session } = useAuth();
  const canView = canAccessModule("/admin/monitoring", roles);
  const online = useNetworkStatus();
  const [database, setDatabase] = useState<CheckState>("checking");
  const [audit, setAudit] = useState<CheckState>("checking");
  const [openEvents, setOpenEvents] = useState<number | null>(null);
  const [rows, setRows] = useState<FailedActivity[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedSearch(search.trim()); setPage(0); }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadMonitoring = useCallback(async () => {
    if (!canView) { setRows([]); setTotal(0); setLoading(false); return; }
    if (!supabase) {
      setDatabase("unavailable"); setAudit("unavailable"); setOpenEvents(null); setRows([]); setTotal(0);
      setError("The system data service is not configured."); setLoading(false); return;
    }
    setLoading(true); setError("");
    const lastDay = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const safeSearch = debouncedSearch.replace(/[^a-zA-Z0-9@._ -]/g, "");
    let failedQuery = supabase.from("audit_log")
      .select("id,created_at,user_name,user_id,action,module,result,context", { count: "exact" })
      .eq("result", "Failure").gte("created_at", lastDay).order("created_at", { ascending: false });
    if (safeSearch) failedQuery = failedQuery.or(`user_name.ilike.%${safeSearch}%,action.ilike.%${safeSearch}%,module.ilike.%${safeSearch}%,context.ilike.%${safeSearch}%`);
    const [databaseCheck, auditCheck, eventCheck, failedResult] = await Promise.all([
      supabase.from("roles").select("role_code", { count: "exact", head: true }),
      supabase.from("audit_log").select("id", { count: "exact", head: true }).gte("created_at", lastDay),
      supabase.from("security_event").select("id", { count: "exact", head: true }).eq("resolved", false),
      failedQuery.range(page * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE - 1),
    ]);
    setDatabase(databaseCheck.error ? "unavailable" : "available");
    setAudit(auditCheck.error ? "unavailable" : "available");
    setOpenEvents(eventCheck.error ? null : eventCheck.count ?? 0);
    if (failedResult.error) {
      setRows([]); setTotal(0);
      setError(adminErrorMessage(failedResult.error, "Failed system activity could not be loaded."));
    } else {
      const records = (failedResult.data ?? []) as FailedActivity[];
      setRows(records); setTotal(failedResult.count ?? 0);
    }
    if (databaseCheck.error || auditCheck.error || eventCheck.error) setError((current) => current || "One or more system checks could not be completed. Review access and refresh.");
    setCheckedAt(new Date().toISOString());
    setLoading(false);
  }, [canView, debouncedSearch, page]);

  useEffect(() => { void loadMonitoring(); }, [loadMonitoring]);

  if (!canView) return <div className="page-content"><div className="empty-state"><h2>Access restricted</h2><p>System monitoring is available to the Super/System Administrator.</p></div></div>;
  return <div className="page-content admin-console-page">
    <AdminPageHeader title="System health & monitoring" description="Check core platform data services and review failed system activity from the last 24 hours." icon="monitor" actions={<button className="button button-secondary" type="button" onClick={() => void loadMonitoring()} disabled={loading}><Icon name="refresh" size={14} />Run checks</button>} />
    {error && <AdminNotice>{error}</AdminNotice>}
    {!online && <AdminNotice tone="warning">You are offline. Live system checks and log refreshes are unavailable.</AdminNotice>}
    <section className="admin-health-grid" aria-label="Platform service checks">
      <article className="panel admin-health-card"><div><span className="admin-health-symbol"><Icon name="wifi" size={17} /></span><div><p className="eyebrow">NETWORK</p><h2>Browser connection</h2></div></div><AdminStatus tone={online ? "success" : "danger"}>{online ? "Online" : "Offline"}</AdminStatus><small>Client connectivity signal</small></article>
      <article className="panel admin-health-card"><div><span className="admin-health-symbol"><Icon name="shield" size={17} /></span><div><p className="eyebrow">AUTHENTICATION</p><h2>Signed-in session</h2></div></div><AdminStatus tone={session ? "success" : "danger"}>{session ? "Authenticated" : "Unavailable"}</AdminStatus><small>Current platform administrator session</small></article>
      <article className="panel admin-health-card"><div><span className="admin-health-symbol"><Icon name="building" size={17} /></span><div><p className="eyebrow">DATABASE</p><h2>Role catalog access</h2></div></div><AdminStatus tone={database === "available" ? "success" : database === "unavailable" ? "danger" : "neutral"}>{database === "available" ? "Available" : database === "unavailable" ? "Unavailable" : "Checking"}</AdminStatus><small>Read-only database access check</small></article>
      <article className="panel admin-health-card"><div><span className="admin-health-symbol"><Icon name="assignment" size={17} /></span><div><p className="eyebrow">AUDIT</p><h2>Activity logging</h2></div></div><AdminStatus tone={audit === "available" ? "success" : audit === "unavailable" ? "danger" : "neutral"}>{audit === "available" ? "Available" : audit === "unavailable" ? "Unavailable" : "Checking"}</AdminStatus><small>Audit records written in the last 24 hours</small></article>
    </section>
    <section className="admin-monitor-summary"><div><strong>{openEvents === null ? "—" : openEvents.toLocaleString()}</strong><span> unresolved security events</span></div><span>Last check: {checkedAt ? formatAdminDate(checkedAt) : "Not yet run"}</span><Link className="text-link" to="/security">Open security queue <Icon name="arrowRight" size={13} /></Link></section>
    <section className="panel admin-directory-panel" aria-label="Failed platform activity">
      <div className="admin-table-toolbar"><div><p className="eyebrow">ERROR MONITORING</p><strong>{total.toLocaleString()}</strong><span> failed audit actions in the last 24 hours</span></div><label className="search-box"><Icon name="search" size={14} /><input aria-label="Search failed activity" placeholder="Search actor, action or module" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
      {loading ? <div className="admin-table-state" role="status"><span className="loading-spinner" />Loading failed system activity…</div>
        : rows.length === 0 ? <div className="admin-table-state"><strong>No failed audit actions found</strong><span>No matching failures have been recorded during the last 24 hours.</span></div>
          : <div className="table-scroll"><table className="admin-data-table"><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Module</th><th>Result</th><th>Context</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}>
            <td>{formatAdminDate(row.created_at)}</td><td><strong>{row.user_name || "Unknown user"}</strong><small>{row.user_id || "No user ID"}</small></td><td>{row.action}</td><td>{row.module || "System"}</td><td><AdminStatus tone="danger">Failure</AdminStatus></td><td>{row.context || "No additional context"}</td>
          </tr>)}</tbody></table></div>}
      {!loading && <AdminPagination page={page} total={total} onPage={setPage} />}
    </section>
    <div className="admin-access-explainer"><Icon name="shield" size={16} /><span>Monitoring reads platform health checks and administrative logs only. No departmental employee data is queried.</span></div>
  </div>;
}
