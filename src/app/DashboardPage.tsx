import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getMetricIcon, getPathIcon, getWorkspaceIcon, Icon } from "@/components/ui/Icon";
import { supabase } from "@/core/config";
import { canAccessModule, canWriteModule } from "@/app/modules";
import {
  canAccessWorkspace,
  canManageWorkspacePersonnel,
  getWorkspaceNavigation,
  type PersonnelWorkspace,
  workspacePath,
} from "@/core/organizational-scope/workspaces";
import { useAuth } from "@/modules/core/auth/context";

interface Metric {
  label: string;
  table: string;
  value: number | null;
  hint: string;
}

const metricPages: Record<string, string> = {
  employees: "/people",
  vacancies: "/recruitment",
  applicants: "/applicants",
  leave_records: "/leave",
  institutions: "/organization/institutions",
  professional_licences: "/licences",
  security_event: "/security",
  archdeaconries: "/organization/archdeaconries",
  parishes: "/organization/parishes",
  local_churches: "/organization/local-churches",
};

function metricsForWorkspace(workspace: PersonnelWorkspace, roles: string[]) {
  const metrics: Omit<Metric, "value">[] = [];
  const managesPersonnel = canManageWorkspacePersonnel(workspace, roles);

  if (managesPersonnel || (workspace.kind === "board" && roles.includes("InstitutionAdmin"))) {
    metrics.push({ label: "Employees", table: "employees", hint: "In this personnel scope" });
    metrics.push({ label: "Open vacancies", table: "vacancies", hint: "In this personnel scope" });
    metrics.push({ label: "Applicants", table: "applicants", hint: "For your authorized vacancies" });
    metrics.push({ label: "Leave records", table: "leave_records", hint: "For employees in this scope" });
  }

  if (["EDUCATION", "HEALTH"].includes(workspace.code) && canAccessModule("/organization/institutions", roles)) {
    metrics.push({ label: workspace.code === "HEALTH" ? "Health facilities" : "Education institutions", table: "institutions", hint: "Within this Board" });
  }
  if (["HEALTH", "ICT"].includes(workspace.code) && canAccessModule("/licences", roles)) {
    metrics.push({ label: workspace.code === "HEALTH" ? "Professional licences" : "Technical certifications", table: "professional_licences", hint: "Within this personnel scope" });
  }
  if (workspace.code === "ICT" && roles.includes("ICTAdministrator")) {
    metrics.push({ label: "Unacknowledged security events", table: "security_event", hint: "Visible to your security role" });
  }
  if (workspace.kind === "secretariat" && !managesPersonnel) {
    metrics.push({ label: "Archdeaconries", table: "archdeaconries", hint: "In your ecclesiastical scope" });
    metrics.push({ label: "Parishes", table: "parishes", hint: "In your ecclesiastical scope" });
    metrics.push({ label: "Local churches", table: "local_churches", hint: "In your ecclesiastical scope" });
  }

  return metrics.filter((metric) => canAccessModule(metricPages[metric.table], roles));
}

function WorkspaceCards({ workspaces }: { workspaces: PersonnelWorkspace[] }) {
  return (
    <section className="workspace-card-grid" aria-label="Authorized personnel workspaces">
      {workspaces.map((workspace) => (
        <Link className="workspace-card" to={`/${workspace.slug}`} key={workspace.slug}>
          <span className="workspace-card-icon"><Icon name={getWorkspaceIcon(workspace.code)} size={20} /></span>
          <span className="workspace-card-copy"><strong>{workspace.name}</strong><small>{workspace.description}</small></span>
          <span className="workspace-card-arrow"><Icon name="arrowRight" size={17} /></span>
        </Link>
      ))}
    </section>
  );
}

export default function DashboardPage({ workspace, workspaces = [] }: {
  workspace?: PersonnelWorkspace;
  workspaces?: PersonnelWorkspace[];
}) {
  const { roles, workspaceDomainCodes, personnelDomains } = useAuth();
  const hasWorkspaceAccess = workspace ? canAccessWorkspace(workspace, roles, workspaceDomainCodes) : true;
  const activeDomain = workspace ? personnelDomains.find((domain) => domain.code === workspace.code) : undefined;
  const metricDefinitions = useMemo(() => workspace ? metricsForWorkspace(workspace, roles) : [], [workspace, roles]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadMetrics() {
      if (!workspace || !hasWorkspaceAccess) {
        setMetrics([]);
        setError("");
        return;
      }
      if (!supabase) {
        setMetrics(metricDefinitions.map((metric) => ({ ...metric, value: null })));
        setError("Configure Supabase to load live workspace data.");
        return;
      }

      const results = await Promise.all(metricDefinitions.map(async (metric) => {
        if (activeDomain && canManageWorkspacePersonnel(workspace, roles) && metric.table !== "security_event") {
          const { data, error: queryError } = await supabase!.rpc("count_personnel_domain_records", {
            target_domain_id: activeDomain.id,
            resource_code: metric.table,
          });
          return { ...metric, value: queryError ? null : Number(data ?? 0), queryError };
        }
        const { count, error: queryError } = await supabase!.from(metric.table).select("id", { count: "exact", head: true });
        return { ...metric, value: queryError ? null : count ?? 0, queryError };
      }));
      if (!active) return;
      setMetrics(results.map(({ queryError: _queryError, ...metric }) => metric));
      setError(results.some((result) => result.queryError) ? "Some workspace totals could not be loaded. Check your access or refresh the page." : "");
    }
    void loadMetrics();
    return () => { active = false; };
  }, [workspace, activeDomain?.id, hasWorkspaceAccess, metricDefinitions, roles]);

  if (workspace && !hasWorkspaceAccess) {
    return <div className="page-content"><div className="empty-state"><div className="empty-mark">Restricted</div><h2>Workspace access required</h2><p>Your account does not have an active scope for {workspace.name}.</p></div></div>;
  }

  if (!workspace) {
    const quickLinks = ["/people", "/leave", "/recruitment", "/applicants", "/assignments", "/documents"];
    const scopedPersonnelRoles = ["CentralHR", "BoardHR", "ArchdeaconryAdmin", "ParishAdmin", "InstitutionAdmin", "FinanceOfficer"];
    const missingPersonnelScope = workspaceDomainCodes.length === 0 && roles.some((role) => scopedPersonnelRoles.includes(role));
    const visibleQuickLinks = missingPersonnelScope ? [] : quickLinks.filter((path) => canAccessModule(path, roles));
    return (
      <div className="page-content">
        <header className="page-heading">
          <div><p className="eyebrow">DIOCESE OF KIGEZI</p><h1><Icon name="overview" size={23} />Your authorized workspaces</h1><p className="muted">Open the personnel area assigned to your role and organizational scope.</p></div>
        </header>
        {workspaces.length > 0 && <WorkspaceCards workspaces={workspaces} />}
        {visibleQuickLinks.length > 0 && <section className="panel dashboard-self-service">
          <div className="panel-heading"><div><p className="eyebrow">PERSONAL ACCESS</p><h2>Available records</h2></div></div>
          <div className="workspace-shortcuts">{visibleQuickLinks.map((path) => <Link className="button button-secondary button-small" to={path} key={path}><Icon name={getPathIcon(path)} size={14} />{path === "/people" ? "Employee directory" : path.slice(1).replaceAll("/", " · ").replaceAll("-", " ")}</Link>)}</div>
        </section>}
        {workspaces.length === 0 && visibleQuickLinks.length === 0 && <div className="empty-state"><div className="empty-mark">No workspace</div><h2>No personnel workspace is assigned</h2><p>Ask your administrator to assign an organizational scope to your account.</p></div>}
      </div>
    );
  }

  const quickLinks = getWorkspaceNavigation(workspace, roles).filter((item) => canAccessModule(item.path, roles));

  return (
    <div className="page-content">
      <header className="page-heading">
        <div><p className="eyebrow">{workspace.kind === "secretariat" ? "CENTRAL ADMINISTRATION" : `${workspace.shortName.toUpperCase()} BOARD`}</p><h1><Icon name={getWorkspaceIcon(workspace.code)} size={23} />{workspace.shortName} dashboard</h1><p className="muted">{workspace.description}</p></div>
        {canManageWorkspacePersonnel(workspace, roles) && canWriteModule("/people", roles) && <Link className="button button-primary" to={workspacePath("/people", workspace.slug)}><Icon name="plus" size={15} />Add employee</Link>}
      </header>
      {error && <div className="notice notice-warning" role="status">{error}</div>}
      <section className="metric-grid" aria-label={`${workspace.shortName} totals`}>
        {metrics.map((metric, index) => (
          <article className="metric-card" key={metric.table}>
            <div className={`metric-icon metric-icon-${index % 4}`}><Icon name={getMetricIcon(metric.table)} size={17} /></div>
            <div className="metric-label">{metric.label}</div>
            <div className="metric-value">{metric.value === null ? "—" : metric.value.toLocaleString()}</div>
            <div className="metric-hint">{metric.hint}</div>
          </article>
        ))}
        {metrics.length === 0 && <div className="panel dashboard-note"><p className="eyebrow">SYSTEMS ACCESS</p><h2>{workspace.shortName} operations</h2><p className="muted">This account has access to the workspace without personnel-record permissions.</p></div>}
      </section>
      <div className="dashboard-columns">
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">{workspace.shortName.toUpperCase()}</p><h2>Workspace navigation</h2></div><span className="panel-badge">Scope enforced by database</span></div>
          <div className="quick-link-grid">
            {quickLinks.map((item, index) => (
              <Link className="quick-link" to={workspacePath(item.path, workspace.slug)} key={item.path}>
                <span className={`quick-link-icon quick-link-${index % 6}`}><Icon name={getPathIcon(item.path)} size={18} /></span>
                <span><strong>{item.label}</strong><small>{workspace.shortName} records and workflows</small></span>
                <span className="quick-link-arrow"><Icon name="arrowRight" size={15} /></span>
              </Link>
            ))}
          </div>
        </section>
        <aside className="panel panel-accent">
          <p className="eyebrow">PERSONNEL MANAGEMENT</p>
          <h2>{workspace.shortName} manages its own workforce.</h2>
          <p className="muted">Employee totals, recruitment, leave and development figures are calculated from records visible in your authorized scope.</p>
          {workspace.kind === "secretariat" && <Link className="text-link" to={workspacePath("/organization/archdeaconries", workspace.slug)}>Open ecclesiastical structure <Icon name="arrowRight" size={14} /></Link>}
          {workspace.kind === "board" && <Link className="text-link" to={workspacePath("/organization/institutions", workspace.slug)}>Open Board institutions <Icon name="arrowRight" size={14} /></Link>}
          <div className="access-note"><span className="access-dot" /> Protected by role, personnel domain and organizational scope</div>
        </aside>
      </div>
    </div>
  );
}
