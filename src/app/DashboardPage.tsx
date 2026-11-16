import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/core/config";
import { canAccessModule, canWriteModule, modulePages } from "@/app/modules";
import { useAuth } from "@/modules/core/auth/context";

interface Metric {
  label: string;
  table: string;
  value: number | null;
  hint: string;
}

const initialMetrics: Metric[] = [
  { label: "People", table: "employees", value: null, hint: "In the employee register" },
  { label: "Open vacancies", table: "vacancies", value: null, hint: "Across diocesan teams" },
  { label: "Applicants", table: "applicants", value: null, hint: "In recruitment" },
  { label: "Leave requests", table: "leave_records", value: null, hint: "Awaiting or in progress" },
];

export default function DashboardPage() {
  const { roles } = useAuth();
  const [metrics, setMetrics] = useState(initialMetrics);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadMetrics() {
      const client = supabase;
      if (!client) {
        setError("Configure Supabase to load live system data.");
        return;
      }
      const metricPages: Record<string, string> = {
        employees: "/people",
        vacancies: "/recruitment",
        applicants: "/applicants",
        leave_records: "/leave",
      };
      const availableMetrics = initialMetrics.filter((metric) => canAccessModule(metricPages[metric.table], roles));
      const results = await Promise.all(availableMetrics.map(async (metric) => {
        const { count, error: queryError } = await client.from(metric.table).select("id", { count: "exact", head: true });
        return { ...metric, value: queryError ? null : count ?? 0, queryError };
      }));
      if (!active) return;
      const failed = results.filter((result) => result.queryError);
      setMetrics(results.map(({ queryError: _queryError, ...metric }) => metric));
      if (failed.length) setError(`Some totals could not be loaded: ${failed.map((result) => `${result.label} (${result.queryError?.message})`).join("; ")}`);
    }
    void loadMetrics();
    return () => { active = false; };
  }, [roles]);

  const quickLinks = modulePages.filter((page) =>
    ["/people", "/leave", "/recruitment", "/applicants", "/assignments", "/documents"].includes(page.path) &&
    canAccessModule(page.path, roles),
  );

  return (
    <div className="page-content">
      <header className="page-heading">
        <div><p className="eyebrow">OVERVIEW</p><h1>Good day</h1><p className="muted">Your diocesan people and operations at a glance.</p></div>
        {canWriteModule("/people", roles) && <Link className="button button-primary" to="/people">Add a person <span aria-hidden="true">＋</span></Link>}
      </header>
      {error && <div className="notice notice-warning" role="status">{error}</div>}
      <section className="metric-grid" aria-label="System totals">
        {metrics.map((metric, index) => (
          <article className="metric-card" key={metric.table}>
            <div className={`metric-icon metric-icon-${index}`} aria-hidden="true">{["P", "V", "A", "L"][index]}</div>
            <div className="metric-label">{metric.label}</div>
            <div className="metric-value">{metric.value === null ? "—" : metric.value.toLocaleString()}</div>
            <div className="metric-hint">{metric.hint}</div>
          </article>
        ))}
      </section>
      <div className="dashboard-columns">
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">WORKSPACE</p><h2>Quick access</h2></div><span className="panel-badge">System modules</span></div>
          <div className="quick-link-grid">
            {quickLinks.map((page, index) => (
              <Link className="quick-link" to={page.path} key={page.path}>
                <span className={`quick-link-icon quick-link-${index}`}>{page.label.slice(0, 1)}</span>
                <span><strong>{page.label}</strong><small>{page.description}</small></span>
                <span className="quick-link-arrow" aria-hidden="true">↗</span>
              </Link>
            ))}
          </div>
        </section>
        <aside className="panel panel-accent">
          <p className="eyebrow">DIOCESE OF KIGEZI</p>
          <h2>One workspace for your people.</h2>
          <p className="muted">Manage employee records and diocesan workflows in one place. Access to sensitive information is controlled by your account and database policies.</p>
          <Link className="text-link" to="/organization">Explore organization <span aria-hidden="true">→</span></Link>
          <div className="access-note"><span className="access-dot" /> Protected by your diocesan access permissions</div>
        </aside>
      </div>
    </div>
  );
}
