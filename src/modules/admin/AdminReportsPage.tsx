import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessModule } from "@/app/modules";
import { supabase } from "@/core/config";
import { csvCell } from "@/core/security/csv";
import { useAuth } from "@/modules/core/auth/context";
import { AdminNotice, AdminPageHeader, AdminStatus } from "./AdminConsoleShared";

interface ReportMetric { key: string; label: string; count: number | null; description: string; category: string }

function startOfDay(value: string) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : undefined;
}

function endOfDay(value: string) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString();
}

function downloadReport(rows: ReportMetric[], fromDate: string, toDate: string) {
  const csv = [
    ["Report", "Count", "Description", "Period start", "Period end"].map(csvCell).join(","),
    ...rows.map((row) => [row.label, row.count ?? "Unavailable", row.description, fromDate || "All time", toDate || "Current"].map(csvCell).join(",")),
  ].join("\r\n");
  const file = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const objectUrl = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `dhrmis-administration-report-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

export default function AdminReportsPage() {
  const { roles } = useAuth();
  const canView = canAccessModule("/admin/reports", roles);
  const [metrics, setMetrics] = useState<ReportMetric[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReport = useCallback(async () => {
    if (!canView) { setMetrics([]); setLoading(false); return; }
    if (!supabase) { setMetrics([]); setError("The system data service is not configured."); setLoading(false); return; }
    if (fromDate && toDate && fromDate > toDate) {
      setError("The report start date must be on or before the end date.");
      setMetrics([]);
      setLoading(false);
      return;
    }
    setLoading(true); setError("");
    const start = startOfDay(fromDate);
    const end = endOfDay(toDate);
    let auditQuery = supabase.from("audit_log").select("id", { count: "exact", head: true });
    let sensitiveQuery = supabase.from("sensitive_read_log").select("id", { count: "exact", head: true });
    if (start) { auditQuery = auditQuery.gte("created_at", start); sensitiveQuery = sensitiveQuery.gte("timestamp", start); }
    if (end) { auditQuery = auditQuery.lt("created_at", end); sensitiveQuery = sensitiveQuery.lt("timestamp", end); }
    const [accounts, activeAccounts, suspendedAccounts, sessions, events, audit, sensitive, configuration] = await Promise.all([
      supabase.from("user_roles").select("id", { count: "exact", head: true }),
      supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("isactive", true).eq("issuspended", false),
      supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("issuspended", true),
      supabase.from("user_sessions").select("id", { count: "exact", head: true }).eq("isactive", true).gt("expiresat", new Date().toISOString()),
      supabase.from("security_event").select("id", { count: "exact", head: true }).eq("resolved", false),
      auditQuery,
      sensitiveQuery,
      supabase.from("system_config").select("id", { count: "exact", head: true }),
    ]);
    const results = [accounts, activeAccounts, suspendedAccounts, sessions, events, audit, sensitive, configuration];
    const count = (result: typeof accounts) => result.error ? null : result.count ?? 0;
    setMetrics([
      { key: "accounts", label: "Managed accounts", count: count(accounts), description: "Accounts with a system role assignment", category: "Accounts" },
      { key: "active", label: "Active accounts", count: count(activeAccounts), description: "Role assignments currently active and not suspended", category: "Accounts" },
      { key: "suspended", label: "Suspended accounts", count: count(suspendedAccounts), description: "Accounts suspended by platform administration", category: "Accounts" },
      { key: "sessions", label: "Active sessions", count: count(sessions), description: "Tracked sessions not yet expired", category: "Security" },
      { key: "events", label: "Open security events", count: count(events), description: "Security alerts awaiting resolution", category: "Security" },
      { key: "audit", label: "Audit records in period", count: count(audit), description: "System activity recorded in the selected period", category: "History" },
      { key: "sensitive", label: "Sensitive reads in period", count: count(sensitive), description: "Sensitive-read events recorded in the selected period", category: "History" },
      { key: "configuration", label: "Configuration entries", count: count(configuration), description: "System configuration values", category: "Technical" },
    ]);
    if (results.some((result) => result.error)) setError("Some report totals could not be loaded. Missing totals are marked unavailable; review database access and refresh.");
    setLoading(false);
  }, [canView, fromDate, toDate]);

  useEffect(() => { void loadReport(); }, [loadReport]);

  const visibleMetrics = useMemo(() => {
    const term = search.trim().toLowerCase();
    return metrics.filter((metric) => !term || metric.label.toLowerCase().includes(term) || metric.category.toLowerCase().includes(term) || metric.description.toLowerCase().includes(term));
  }, [metrics, search]);

  if (!canView) return <div className="page-content"><div className="empty-state"><h2>Access restricted</h2></div></div>;
  return <div className="page-content admin-console-page">
    <AdminPageHeader title="Administrative reports" description="Create summary reports from account, session, security and system activity records." icon="chart" actions={<button className="button button-secondary" type="button" onClick={() => void loadReport()} disabled={loading}>Refresh report</button>} />
    {error && <AdminNotice>{error}</AdminNotice>}
    <section className="panel admin-report-controls">
      <div className="admin-filter-controls">
        <label className="admin-filter-label">From<input type="date" aria-label="Report start date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
        <label className="admin-filter-label">To<input type="date" aria-label="Report end date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
        <label className="search-box"><input aria-label="Search report metrics" placeholder="Search report totals" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <button className="button button-primary" type="button" onClick={() => downloadReport(visibleMetrics, fromDate, toDate)} disabled={loading || visibleMetrics.length === 0}>Download CSV</button>
      </div>
    </section>
    {loading ? <div className="admin-table-state" role="status"><span className="loading-spinner" />Building administrative report…</div>
      : visibleMetrics.length === 0 ? <div className="admin-table-state"><strong>No report totals match</strong></div>
        : <section className="admin-report-grid" aria-label="Administrative report totals">{visibleMetrics.map((metric) => <article className="panel admin-report-card" key={metric.key}>
          <h3>{metric.label}</h3>
          <strong>{metric.count === null ? "Unavailable" : metric.count.toLocaleString()}</strong>
          {metric.count === null && <AdminStatus tone="warning">Check access</AdminStatus>}
        </article>)}</section>}
  </div>;
}
