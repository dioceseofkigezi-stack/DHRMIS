import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@/components/ui/Icon";
import { supabase } from "@/core/config";
import { useNetworkStatus } from "@/core/monitoring/useNetworkStatus";
import { AdminNotice, formatAdminDate } from "./AdminConsoleShared";

interface AdminSummary {
  accounts: number | null;
  activeAccounts: number | null;
  activeSessions: number | null;
  openSecurityEvents: number | null;
  auditLastDay: number | null;
  health: "checking" | "available" | "degraded";
  recentActivity: { id: string; created_at: string; user_name: string | null; action: string; module: string | null; result: string }[];
}

const initialSummary: AdminSummary = {
  accounts: null,
  activeAccounts: null,
  activeSessions: null,
  openSecurityEvents: null,
  auditLastDay: null,
  health: "checking",
  recentActivity: [],
};

const links = [
  ["/admin/users", "User access", "Manage account roles, activation, suspension and password recovery.", "people"],
  ["/admin/roles", "Roles & permissions", "Review the current role catalog and permission assignments.", "role"],
  ["/admin/scopes", "Organizational access", "Review role-derived scope assignments and their status.", "target"],
  ["/admin/sessions", "Sessions & devices", "Inspect recorded devices and revoke active sessions.", "shield"],
  ["/security", "Security events", "Review and resolve system security alerts.", "security"],
  ["/audit", "Audit activity", "Review administrative activity and sensitive-read records.", "assignment"],
  ["/admin/monitoring", "System health & monitoring", "Check core services and investigate failed system activity.", "monitor"],
  ["/settings", "System configuration", "Manage configuration values protected by database policies.", "settings"],
  ["/admin/reports", "Administrative reports", "View account, session, security and audit summaries.", "chart"],
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
    const [accounts, activeAccounts, activeSessions, openEvents, recentAudit, roleHealth] = await Promise.all([
      supabase.from("user_roles").select("id", { count: "exact", head: true }),
      supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("isactive", true).eq("issuspended", false),
      supabase.from("user_sessions").select("id", { count: "exact", head: true }).eq("isactive", true).gt("expiresat", new Date().toISOString()),
      supabase.from("security_event").select("id", { count: "exact", head: true }).eq("resolved", false),
      supabase.from("audit_log").select("id,created_at,user_name,action,module,result", { count: "exact" }).gte("created_at", dayAgo).order("created_at", { ascending: false }).limit(6),
      supabase.from("roles").select("role_code", { count: "exact", head: true }),
    ]);
    setSummary({
      accounts: accounts.error ? null : accounts.count ?? 0,
      activeAccounts: activeAccounts.error ? null : activeAccounts.count ?? 0,
      activeSessions: activeSessions.error ? null : activeSessions.count ?? 0,
      openSecurityEvents: openEvents.error ? null : openEvents.count ?? 0,
      auditLastDay: recentAudit.error ? null : recentAudit.count ?? 0,
      health: roleHealth.error ? "degraded" : "available",
      recentActivity: recentAudit.error ? [] : (recentAudit.data ?? []),
    });
    const failures = [accounts, activeAccounts, activeSessions, openEvents, recentAudit, roleHealth].filter((result) => result.error);
    if (failures.length) setError("Some administration data could not be loaded. Refresh to try again; database policies still control each request.");
    setLoading(false);
  }, []);

  useEffect(() => { void loadSummary(); }, [loadSummary]);

  const metrics = [
    { label: "Managed accounts", value: summary.accounts, hint: `${metricLabel(summary.activeAccounts)} currently active`, icon: "people" },
    { label: "Active sessions", value: summary.activeSessions, hint: "Tracked devices not yet expired", icon: "shield" },
    { label: "Open security events", value: summary.openSecurityEvents, hint: "Unresolved system alerts", icon: "security" },
    { label: "Audit activity · 24 hours", value: summary.auditLastDay, hint: "Recorded system changes", icon: "assignment" },
  ] as const;

  return <div className="page-content admin-dashboard">
    <header className="page-heading admin-page-heading">
      <div><p className="eyebrow">SYSTEM CONTROL CENTER</p><h1><Icon name="overview" size={23} />Super/System Administration</h1><p className="muted">Manage accounts, access, platform security and technical configuration.</p></div>
      <div className="admin-heading-actions">
        <span className={`admin-health-pill admin-health-${summary.health}`}><span />{summary.health === "checking" ? "Checking services" : summary.health === "available" ? "Data service available" : "Service check failed"}</span>
        <button className="button button-secondary" type="button" onClick={() => void loadSummary()} disabled={loading}><Icon name="refresh" size={14} />Refresh</button>
      </div>
    </header>
    {!online && <AdminNotice tone="warning">You are offline. Administration changes are unavailable until the connection returns.</AdminNotice>}
    {error && <AdminNotice>{error}</AdminNotice>}
    <section className="admin-metric-grid" aria-label="System administration metrics">
      {metrics.map((metric, index) => <article className="admin-metric-card" key={metric.label}>
        <span className={`admin-metric-icon admin-metric-icon-${index}`}><Icon name={metric.icon} size={18} /></span>
        <div><span>{metric.label}</span><strong>{loading ? "…" : metricLabel(metric.value)}</strong><small>{metric.hint}</small></div>
      </article>)}
    </section>
    <div className="admin-dashboard-grid">
      <section className="panel admin-function-panel">
        <div className="panel-heading"><div><p className="eyebrow">PLATFORM OPERATIONS</p><h2>Administration functions</h2></div><span className="panel-badge">System role only</span></div>
        <div className="admin-function-grid">{links.map(([path, title, description, icon]) => <Link className="admin-function-card" to={path} key={path}>
          <span className="admin-function-icon"><Icon name={icon} size={18} /></span><span><strong>{title}</strong><small>{description}</small></span><Icon name="arrowRight" size={15} />
        </Link>)}</div>
      </section>
      <aside className="panel admin-recent-panel">
        <div className="panel-heading"><div><p className="eyebrow">SYSTEM HISTORY</p><h2>Recent activity</h2></div><Link className="text-link" to="/audit">View all <Icon name="arrowRight" size={13} /></Link></div>
        {loading ? <p className="muted" role="status">Loading recent activity…</p> : summary.recentActivity.length === 0 ? <div className="admin-inline-empty"><strong>No recent audit entries</strong><span>System activity will appear here when recorded.</span></div> : <ul className="admin-activity-list">{summary.recentActivity.map((item) => <li key={item.id}>
          <span className={`admin-activity-dot admin-activity-${item.result.toLowerCase()}`} />
          <span><strong>{item.action.replaceAll("_", " ")}</strong><small>{item.user_name || "Unknown user"} · {item.module || "System"}</small></span>
          <time dateTime={item.created_at}>{formatAdminDate(item.created_at)}</time>
        </li>)}</ul>}
        {error && summary.recentActivity.length === 0 && !loading && <p className="admin-muted-state">Recent activity is unavailable.</p>}
      </aside>
    </div>
    <section className="admin-capability-note" aria-label="Backup and recovery status">
      <span><Icon name="shield" size={18} /></span><div><strong>Backup and recovery status</strong><p>No backup-status source is configured in this DHRMIS deployment. Backup operations are not available from this workspace.</p></div>
    </section>
  </div>;
}
