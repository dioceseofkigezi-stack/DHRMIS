import { lazy, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/core/config";
import { canAccessModule, canWriteModule } from "@/app/modules";
import { getWorkspaceIcon, Icon } from "@/components/ui/Icon";
import WorkspaceDashboardCharts, { type WorkspaceAnalyticsRow } from "@/app/WorkspaceDashboardCharts";
import {
  canAccessWorkspace,
  canManageWorkspacePersonnel,
  type PersonnelWorkspace,
  workspacePath,
} from "@/core/organizational-scope/workspaces";
import { useAuth } from "@/modules/core/auth/context";

const SystemAdminDashboard = lazy(() => import("@/modules/admin/SystemAdminDashboard"));

interface Metric {
  label: string;
  table: string;
  value: number | null;
}

const metricPages: Record<string, string> = {
  employees: "/people",
  clergy: "/clergy",
  catechists: "/catechists",
  vacancies: "/recruitment",
  applicants: "/applicants",
  assignments: "/assignments",
  employee_transfers: "/transfers",
  leave_records: "/leave",
  training_records: "/training",
  qualifications: "/qualifications",
  performance_appraisals: "/performance",
  retirements: "/retirement",
  early_retirement_applications: "/early-retirement",
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

  if (managesPersonnel) {
    metrics.push({ label: "Employees", table: "employees" });
    metrics.push({ label: "Active assignments", table: "assignments" });
    metrics.push({ label: "Open vacancies", table: "vacancies" });
    metrics.push({ label: "Applicants", table: "applicants" });
    metrics.push({ label: "Leave records", table: "leave_records" });
    metrics.push({ label: "Training records", table: "training_records" });
    metrics.push({ label: "Qualifications", table: "qualifications" });
    metrics.push({ label: "Performance appraisals", table: "performance_appraisals" });
    metrics.push({ label: "Transfer history", table: "employee_transfers" });
    metrics.push({ label: "Retirement cases", table: "retirements" });
    metrics.push({ label: "Early retirement applications", table: "early_retirement_applications" });
  }

  if (["EDUCATION", "HEALTH"].includes(workspace.code) && canAccessModule("/organization/institutions", roles)) {
    metrics.push({ label: workspace.code === "HEALTH" ? "Health facilities" : "Education institutions", table: "institutions" });
  }
  if (["HEALTH", "ICT"].includes(workspace.code) && canAccessModule("/licences", roles)) {
    metrics.push({ label: workspace.code === "HEALTH" ? "Professional licences" : "Technical certifications", table: "professional_licences" });
  }
  if (workspace.kind === "secretariat") {
    metrics.push({ label: "Priests", table: "clergy" });
    metrics.push({ label: "Catechists", table: "catechists" });
    metrics.push({ label: "Archdeaconries", table: "archdeaconries" });
    metrics.push({ label: "Parishes", table: "parishes" });
    metrics.push({ label: "Local churches", table: "local_churches" });
  }

  return metrics.filter((metric) => canAccessModule(metricPages[metric.table], roles));
}

function WorkspaceCards({ workspaces }: { workspaces: PersonnelWorkspace[] }) {
  return (
    <section className="workspace-card-grid" aria-label="Authorized personnel workspaces">
      {workspaces.map((workspace) => (
        <Link className="workspace-card" to={`/${workspace.slug}`} key={workspace.slug}>
          <span className="workspace-card-icon" aria-hidden="true"><Icon name={getWorkspaceIcon(workspace.code)} size={19} /></span>
          <span className="workspace-card-copy"><strong>{workspace.name}</strong></span>
          <span className="workspace-card-arrow" aria-hidden="true">→</span>
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
  const isPlatformAdmin = roles.includes("SUPER_SYSTEM_ADMIN");
  const hasWorkspaceAccess = workspace ? canAccessWorkspace(workspace, roles, workspaceDomainCodes) : true;
  const activeDomain = workspace ? personnelDomains.find((domain) => domain.code === workspace.code) : undefined;
  const metricDefinitions = useMemo(() => workspace ? metricsForWorkspace(workspace, roles) : [], [workspace, roles]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [workspaceAnalytics, setWorkspaceAnalytics] = useState<WorkspaceAnalyticsRow[] | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(Boolean(workspace));
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadMetrics() {
      if (!workspace || !hasWorkspaceAccess || !activeDomain) {
        setMetrics([]);
        setWorkspaceAnalytics(null);
        setMetricsLoading(false);
        setError("");
        return;
      }
      setMetricsLoading(true);
      if (!supabase) {
        setMetrics(metricDefinitions.map((metric) => ({ ...metric, value: null })));
        setWorkspaceAnalytics(null);
        setMetricsLoading(false);
        setError("Configure Supabase to load live workspace data.");
        return;
      }

      const [results, analyticsResult] = await Promise.all([
        Promise.all(metricDefinitions.map(async (metric) => {
          if (["archdeaconries", "parishes", "local_churches"].includes(metric.table)) {
            const { count, error: queryError } = await supabase!.from(metric.table).select("id", { count: "exact", head: true });
            return { ...metric, value: queryError ? null : count ?? 0, queryError };
          }
          const { data, error: queryError } = await supabase!.rpc("count_personnel_domain_records", {
            target_domain_id: activeDomain.id,
            resource_code: metric.table,
          });
          const parsedCount = Number(data);
          const count = Number.isFinite(parsedCount) ? parsedCount : null;
          return { ...metric, value: queryError ? null : count, queryError };
        })),
        supabase.rpc("personnel_dashboard_analytics", { target_domain_id: activeDomain.id, p_days: 30 }),
      ]);
      if (!active) return;
      const analytics = analyticsResult.error ? null : (analyticsResult.data as WorkspaceAnalyticsRow[] | null) ?? [];
      setMetrics(results.map(({ queryError: _queryError, ...metric }) => metric));
      setWorkspaceAnalytics(analytics);
      setError(results.some((result) => result.queryError) || analyticsResult.error
        ? "Some workspace totals or chart data could not be loaded. Check your access or refresh the page."
        : "");
      setMetricsLoading(false);
    }
    void loadMetrics();
    return () => { active = false; };
  }, [workspace, activeDomain, hasWorkspaceAccess, metricDefinitions]);

  if (workspace && !hasWorkspaceAccess) {
    return <div className="page-content"><div className="empty-state"><h2>Workspace access required</h2></div></div>;
  }

  if (!workspace) {
    if (isPlatformAdmin) {
      return <SystemAdminDashboard />;
    }

    const quickLinks = ["/people", "/leave", "/recruitment", "/applicants", "/assignments", "/documents"];
    const scopedPersonnelRoles = ["SECRETARIAT_USER", "MISSION_BOARD_USER", "EDUCATION_BOARD_USER", "HEALTH_BOARD_USER", "LAND_FINANCE_BOARD_USER", "PLANNING_DEVELOPMENT_BOARD_USER", "ICT_BOARD_USER"];
    const missingPersonnelScope = workspaceDomainCodes.length === 0 && roles.some((role) => scopedPersonnelRoles.includes(role));
    const visibleQuickLinks = missingPersonnelScope ? [] : quickLinks.filter((path) => canAccessModule(path, roles));
    return (
      <div className="page-content">
        <header className="page-heading">
          <h1>Your authorized workspaces</h1>
        </header>
        {workspaces.length > 0 && <WorkspaceCards workspaces={workspaces} />}
        {visibleQuickLinks.length > 0 && <section className="panel dashboard-self-service">
          <div className="workspace-shortcuts">{visibleQuickLinks.map((path) => <Link className="button button-secondary button-small" to={path} key={path}>{path === "/people" ? "Employee directory" : path.slice(1).replaceAll("/", " · ").replaceAll("-", " ")}</Link>)}</div>
        </section>}
        {workspaces.length === 0 && visibleQuickLinks.length === 0 && <div className="empty-state"><h2>No personnel workspace is assigned</h2></div>}
      </div>
    );
  }

  return (
    <div className="page-content">
      <header className="page-heading">
        <h1>{workspace.shortName}</h1>
        {canManageWorkspacePersonnel(workspace, roles) && canWriteModule("/people", roles) && <Link className="button button-primary" to={workspacePath("/people", workspace.slug)}>Add employee</Link>}
      </header>
      {error && <div className="notice notice-warning" role="status">{error}</div>}
      <WorkspaceDashboardCharts workspaceName={workspace.shortName} metrics={metrics} analytics={workspaceAnalytics} loading={metricsLoading} />
    </div>
  );
}
