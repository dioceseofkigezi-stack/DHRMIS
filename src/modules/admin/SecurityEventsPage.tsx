import { useCallback, useEffect, useState } from "react";
import { canAccessModule } from "@/app/modules";
import ConfirmDialog from "@/components/feedback/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import { supabase } from "@/core/config";
import { useToast } from "@/core/notifications/ToastProvider";
import { useNetworkStatus } from "@/core/monitoring/useNetworkStatus";
import { useAuth } from "@/modules/core/auth/context";
import { ADMIN_PAGE_SIZE, AdminNotice, AdminPageHeader, AdminPagination, AdminStatus, adminErrorMessage, formatAdminDate } from "./AdminConsoleShared";

interface SecurityEventRow {
  id: string;
  created_at: string;
  user_name: string | null;
  user_id: string | null;
  event_type: string;
  severity: string;
  component: string;
  description: string;
  acknowledged: boolean | null;
  acknowledged_by: string | null;
  resolved: boolean | null;
  resolved_at: string | null;
}
type EventAction = "acknowledge" | "resolve" | "reopen";

function eventTone(severity: string): "success" | "warning" | "danger" | "neutral" {
  if (severity === "Critical" || severity === "High") return "danger";
  if (severity === "Medium") return "warning";
  if (severity === "Low") return "success";
  return "neutral";
}

export default function SecurityEventsPage() {
  const { roles, session } = useAuth();
  const canView = canAccessModule("/security", roles);
  const toast = useToast();
  const online = useNetworkStatus();
  const [rows, setRows] = useState<SecurityEventRow[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [severity, setSeverity] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<{ event: SecurityEventRow; action: EventAction } | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedSearch(search.trim()); setPage(0); }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => { setPage(0); }, [severity, stateFilter]);

  const loadEvents = useCallback(async () => {
    if (!canView) { setRows([]); setTotal(0); setLoading(false); return; }
    if (!supabase) { setRows([]); setTotal(0); setError("The system data service is not configured."); setLoading(false); return; }
    setLoading(true);
    setError("");
    let query = supabase.from("security_event")
      .select("id,created_at,user_name,user_id,event_type,severity,component,description,acknowledged,acknowledged_by,resolved,resolved_at", { count: "exact" })
      .order("created_at", { ascending: false });
    if (severity) query = query.eq("severity", severity);
    if (stateFilter === "open") query = query.eq("resolved", false).eq("acknowledged", false);
    if (stateFilter === "acknowledged") query = query.eq("resolved", false).eq("acknowledged", true);
    if (stateFilter === "resolved") query = query.eq("resolved", true);
    const safeSearch = debouncedSearch.replace(/[^a-zA-Z0-9@._ -]/g, "");
    if (safeSearch) query = query.or(`event_type.ilike.%${safeSearch}%,component.ilike.%${safeSearch}%,description.ilike.%${safeSearch}%,user_name.ilike.%${safeSearch}%`);
    const { data, count, error: queryError } = await query.range(page * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE - 1);
    if (queryError) {
      setRows([]); setTotal(0);
      setError(adminErrorMessage(queryError, "Security events could not be loaded."));
    } else {
      setRows((data ?? []) as SecurityEventRow[]);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [canView, debouncedSearch, page, severity, stateFilter]);

  useEffect(() => { void loadEvents(); }, [loadEvents]);

  async function applyAction() {
    if (!pending || !supabase || !online) return;
    setBusy(true); setError("");
    const update = pending.action === "acknowledge"
      ? { acknowledged: true, acknowledged_by: session?.user.id ?? null }
      : pending.action === "resolve"
        ? { acknowledged: true, acknowledged_by: session?.user.id ?? null, resolved: true, resolved_at: new Date().toISOString() }
        : { resolved: false, resolved_at: null };
    const { data, error: updateError } = await supabase.from("security_event").update(update).eq("id", pending.event.id).select("id").maybeSingle();
    if (updateError || !data) {
      setError(adminErrorMessage(updateError, "The security event was not changed. Refresh and try again."));
    } else {
      toast(pending.action === "acknowledge" ? "Security event acknowledged." : pending.action === "resolve" ? "Security event resolved." : "Security event reopened.", "success");
      setPending(null);
      await loadEvents();
    }
    setBusy(false);
  }

  if (!canView) return <div className="page-content"><div className="empty-state"><h2>Access restricted</h2><p>Security events are visible to the Super/System Administrator only.</p></div></div>;
  const confirm = pending?.action === "acknowledge" ? { title: "Acknowledge security event?", label: "Acknowledge", body: "Record that this alert has been reviewed. It will remain open until it is resolved." }
    : pending?.action === "resolve" ? { title: "Resolve security event?", label: "Resolve event", body: "Mark this alert as resolved. This status change will be recorded in the audit trail." }
      : { title: "Reopen security event?", label: "Reopen event", body: "Return this event to the active security queue for further review." };
  return <div className="page-content admin-console-page">
    <AdminPageHeader title="Security events" description="Review system alerts, record acknowledgement, and track resolution status." icon="security" actions={<button className="button button-secondary" type="button" onClick={() => void loadEvents()} disabled={loading}><Icon name="refresh" size={14} />Refresh</button>} />
    {error && <AdminNotice>{error}</AdminNotice>}
    {!online && <AdminNotice tone="warning">You are offline. Security event updates are unavailable.</AdminNotice>}
    <section className="panel admin-directory-panel" aria-label="Security event log">
      <div className="admin-table-toolbar">
        <div><strong>{total.toLocaleString()}</strong><span> security events</span></div>
        <div className="admin-filter-controls">
          <label className="search-box"><Icon name="search" size={14} /><input aria-label="Search security events" placeholder="Search events, component or user" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <label className="admin-filter-label">Severity<select aria-label="Filter by severity" value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="">All severity</option>{["Critical", "High", "Medium", "Low", "Informational"].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="admin-filter-label">State<select aria-label="Filter by event state" value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}><option value="">All states</option><option value="open">Open</option><option value="acknowledged">Acknowledged</option><option value="resolved">Resolved</option></select></label>
        </div>
      </div>
      {loading ? <div className="admin-table-state" role="status"><span className="loading-spinner" />Loading security events…</div>
        : rows.length === 0 ? <div className="admin-table-state"><strong>No matching security events</strong><span>There are no events for the current filters.</span></div>
          : <div className="table-scroll"><table className="admin-data-table"><thead><tr><th>Severity</th><th>Event</th><th>Actor</th><th>Component</th><th>Details</th><th>Created</th><th>Status</th><th>Actions</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}>
            <td><AdminStatus tone={eventTone(row.severity)}>{row.severity}</AdminStatus></td>
            <td><strong>{row.event_type.replaceAll("_", " ")}</strong><small><code>{row.id}</code></small></td>
            <td><strong>{row.user_name || "System / unknown"}</strong><small>{row.user_id || "No account ID"}</small></td>
            <td>{row.component}</td><td className="admin-event-description">{row.description}</td><td>{formatAdminDate(row.created_at)}</td>
            <td>{row.resolved ? <AdminStatus tone="success">Resolved</AdminStatus> : row.acknowledged ? <AdminStatus tone="warning">Acknowledged</AdminStatus> : <AdminStatus tone="danger">Open</AdminStatus>}{row.resolved_at && <small>{formatAdminDate(row.resolved_at)}</small>}</td>
            <td className="admin-row-actions">{row.resolved ? <button className="text-button" type="button" onClick={() => setPending({ event: row, action: "reopen" })} disabled={!online}>Reopen</button> : <>
              {!row.acknowledged && <button className="text-button" type="button" onClick={() => setPending({ event: row, action: "acknowledge" })} disabled={!online}>Acknowledge</button>}
              <button className="text-button" type="button" onClick={() => setPending({ event: row, action: "resolve" })} disabled={!online}>Resolve</button>
            </>}</td>
          </tr>)}</tbody></table></div>}
      {!loading && <AdminPagination page={page} total={total} onPage={setPage} />}
    </section>
    {pending && <ConfirmDialog title={confirm.title} confirmLabel={confirm.label} busy={busy} onCancel={() => setPending(null)} onConfirm={() => void applyAction()}>
      <p>{confirm.body}</p><p className="admin-confirm-detail"><strong>{pending.event.severity} · {pending.event.event_type}</strong><br />{pending.event.description}</p>
    </ConfirmDialog>}
  </div>;
}
