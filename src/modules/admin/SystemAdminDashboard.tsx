import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/core/config";
import { useNetworkStatus } from "@/core/monitoring/useNetworkStatus";
import { AdminNotice, formatAdminDate } from "./AdminConsoleShared";
import AdminDashboardCharts, { type DashboardHourlyActivity } from "./AdminDashboardCharts";

interface AdminSummary {
  accounts: number | null;
  activeAccounts: number | null;
  suspendedAccounts: number | null;
  activeSessions: number | null;
  openSecurityEvents: number | null;
  auditLastDay: number | null;
  hourlyActivity: DashboardHourlyActivity[] | null;
  health: "checking" | "available" | "degraded";
  recentActivity: { id: string; created_at: string; user_name: string | null; action: string; module: string | null; result: string }[];
}

const initialSummary: AdminSummary = {
  accounts: null,
  activeAccounts: null,
  suspendedAccounts: null,
  activeSessions: null,
  openSecurityEvents: null,
  auditLastDay: null,
  hourlyActivity: null,
  health: "checking",
  recentActivity: [],
};

const links = [
  ["/admin/users", "User access"],
  ["/admin/roles", "Roles & permissions"],
  ["/admin/scopes", "Organizational access"],
  ["/admin/sessions", "Sessions & devices"],
  ["/security", "Security events"],
  ["/audit", "Audit activity"],
  ["/admin/monitoring", "System health & monitoring"],
  ["/settings", "System configuration"],
  ["/admin/reports", "Administrative reports"],
] as const;

function metricLabel(value: number | null) {
  return value === null ? "—" : value.toLocaleString();
}

export default function SystemAdminDashboard() {
  const online = useNetworkStatus();
  const [summary, setSummary] = useState(initialSummary);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSummary = useCallback(async () => {
    if (!supabase) {
      setSummary({ ...initialSummary, health: "degraded" });
      setError("The system data service is not configured.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [accounts, activeAccounts, suspendedAccounts, activeSessions, openEvents, recentAudit, roleHealth, activity] = await Promise.all([
      supabase.from("user_roles").select("id", { count: "exact", head: true }),
      supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("isactive", true).eq("issuspended", false),
      supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("issuspended", true),
      supabase.from("user_sessions").select("id", { count: "exact", head: true }).eq("isactive", true).gt("expiresat", new Date().toISOString()),
      supabase.from("security_event").select("id", { count: "exact", head: true }).eq("resolved", false),
      supabase.from("audit_log").select("id,created_at,user_name,action,module,result", { count: "exact" }).gte("created_at", dayAgo).order("created_at", { ascending: false }).limit(6),
      supabase.from("roles").select("role_code", { count: "exact", head: true }),
      supabase.rpc("admin_dashboard_activity", { p_days: 30 }),
    ]);
    setSummary({
      accounts: accounts.error ? null : accounts.count ?? 0,
      activeAccounts: activeAccounts.error ? null : activeAccounts.count ?? 0,
      suspendedAccounts: suspendedAccounts.error ? null : suspendedAccounts.count ?? 0,
      activeSessions: activeSessions.error ? null : activeSessions.count ?? 0,
      openSecurityEvents: openEvents.error ? null : openEvents.count ?? 0,
      auditLastDay: recentAudit.error ? null : recentAudit.count ?? 0,
      hourlyActivity: activity.error ? null : (activity.data as DashboardHourlyActivity[] | null) ?? [],
      health: roleHealth.error ? "degraded" : "available",
      recentActivity: recentAudit.error ? [] : (recentAudit.data ?? []),
    });
    const failures = [accounts, activeAccounts, suspendedAccounts, activeSessions, openEvents, recentAudit, roleHealth, activity].filter((result) => result.error);
    if (failures.length) setError("Some administration data could not be loaded. Refresh to try again; database policies still control each request.");
    setLoading(false);
  }, []);

  useEffect(() => { void loadSummary(); }, [loadSummary]);

  const metrics = [
    { label: "Managed accounts", value: summary.accounts },
    { label: "Active sessions", value: summary.activeSessions },
    { label: "Open security events", value: summary.openSecurityEvents },
    { label: "Audit activity · 24 hours", value: summary.auditLastDay },
  ] as const;

  return <div className="page-content admin-dashboard">
    <header className="page-heading admin-page-heading">
      <h1>Super/System Administration</h1>
      <div className="admin-heading-actions">
        <span className={`admin-health-pill admin-health-${summary.health}`}><span />{summary.health === "checking" ? "Checking services" : summary.health === "available" ? "Data service available" : "Service check failed"}</span>
        <button className="button button-secondary" type="button" onClick={() => void loadSummary()} disabled={loading}>Refresh</button>
      </div>
    </header>
    {!online && <AdminNotice tone="warning">You are offline. Administration changes are unavailable until the connection returns.</AdminNotice>}
    {error && <AdminNotice>{error}</AdminNotice>}
    <section className="admin-metric-grid" aria-label="System administration metrics">
      {metrics.map((metric) => <article className="admin-metric-card" key={metric.label}>
        <div><span>{metric.label}</span><strong>{loading ? "…" : metricLabel(metric.value)}</strong></div>
      </article>)}
    </section>
    <AdminDashboardCharts
      accounts={summary.accounts}
      activeAccounts={summary.activeAccounts}
      suspendedAccounts={summary.suspendedAccounts}
      hourlyActivity={summary.hourlyActivity}
      loading={loading}
    />
    <div className="admin-dashboard-grid">
      <section className="panel admin-function-panel">
        <h2>Administration</h2>
        <div className="admin-function-grid">{links.map(([path, title]) => <Link className="admin-function-card" to={path} key={path}>
          <span><strong>{title}</strong></span>
        </Link>)}</div>
      </section>
      <aside className="panel admin-recent-panel">
        <div className="panel-heading"><h2>Recent activity</h2><Link className="text-link" to="/audit">View all</Link></div>
        {loading ? <p className="muted" role="status">Loading…</p> : summary.recentActivity.length === 0 ? <div className="admin-inline-empty"><strong>No recent audit entries</strong></div> : <ul className="admin-activity-list">{summary.recentActivity.map((item) => <li key={item.id}>
          <span className={`admin-activity-dot admin-activity-${item.result.toLowerCase()}`} />
          <span><strong>{item.action.replaceAll("_", " ")}</strong><small>{item.user_name || "Unknown user"} · {item.module || "System"}</small></span>
          <time dateTime={item.created_at}>{formatAdminDate(item.created_at)}</time>
        </li>)}</ul>}
        {error && summary.recentActivity.length === 0 && !loading && <p className="admin-muted-state">Recent activity is unavailable.</p>}
      </aside>
    </div>
  </div>;
}
