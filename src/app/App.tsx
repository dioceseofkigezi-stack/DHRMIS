import { lazy, Suspense, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { canAccessModule, modulePages } from "@/app/modules";
import GlobalSearch from "@/components/navigation/GlobalSearch";
import NotificationCenter from "@/components/navigation/NotificationCenter";
import { AccountAvatar } from "@/components/navigation/sibarRoles/SidebarShared";
import { Icon } from "@/components/ui/Icon";
import { ThemeControl } from "@/components/ui/ThemeControl";
import { AppErrorBoundary } from "@/core/errors/AppErrorBoundary";
import { useNetworkStatus } from "@/core/monitoring/useNetworkStatus";
import { useToast } from "@/core/notifications/ToastProvider";
import { supabase } from "@/core/config";
import { useAuth } from "@/modules/core/auth/context";
import FirstLoginPasswordPage from "@/modules/auth/FirstLoginPasswordPage";
import { canAccessWorkspace, getAssignedWorkspace, getWorkspaceFromPath, personnelWorkspaces, roleDisplayName } from "@/core/organizational-scope/workspaces";

const DashboardPage = lazy(() => import("@/app/DashboardPage"));
const ModulePage = lazy(() => import("@/app/ModulePage"));
const EmployeeProfilePage = lazy(() => import("@/modules/human-resources/EmployeeProfilePage"));
const ProfileSettingsPage = lazy(() => import("@/modules/profile/ProfileSettingsPage"));
const DocumentManagerPage = lazy(() => import("@/modules/archive/DocumentManagerPage"));
const DeathRecordsPage = lazy(() => import("@/modules/death/DeathRecordsPage"));
const SessionManagementPage = lazy(() => import("@/modules/admin/SessionManagementPage"));
const UserAdministrationPage = lazy(() => import("@/modules/admin/UserAdministrationPage"));
const ScopeAdministrationPage = lazy(() => import("@/modules/admin/ScopeAdministrationPage"));
const RolePermissionsPage = lazy(() => import("@/modules/admin/RolePermissionsPage"));
const AdminAuditPage = lazy(() => import("@/modules/admin/AdminAuditPage"));
const SecurityEventsPage = lazy(() => import("@/modules/admin/SecurityEventsPage"));
const AdminReportsPage = lazy(() => import("@/modules/admin/AdminReportsPage"));
const SystemMonitoringPage = lazy(() => import("@/modules/admin/SystemMonitoringPage"));
const SuperSystemAdminSidebar = lazy(() => import("@/components/navigation/sibarRoles/SuperSystemAdminSidebar"));
const SecretariatSidebar = lazy(() => import("@/components/navigation/sibarRoles/SecretariatSidebar"));
const MissionBoardSidebar = lazy(() => import("@/components/navigation/sibarRoles/MissionBoardSidebar"));
const EducationBoardSidebar = lazy(() => import("@/components/navigation/sibarRoles/EducationBoardSidebar"));
const HealthBoardSidebar = lazy(() => import("@/components/navigation/sibarRoles/HealthBoardSidebar"));
const LandFinanceBoardSidebar = lazy(() => import("@/components/navigation/sibarRoles/LandFinanceBoardSidebar"));
const PlanningDevelopmentBoardSidebar = lazy(() => import("@/components/navigation/sibarRoles/PlanningDevelopmentBoardSidebar"));
const IctBoardSidebar = lazy(() => import("@/components/navigation/sibarRoles/IctBoardSidebar"));

function LoadingPage() {
  return <div className="screen-state"><span className="loading-spinner" /> Loading workspace…</div>;
}

export default function App() {
  const { session, loading, roles, workspaceDomainCodes, roleUserId, roleLoading, roleError, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const showToast = useToast();
  const online = useNetworkStatus();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("dhrmis-sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });
  const [signingOut, setSigningOut] = useState(false);
  const accountAvatarPath = typeof session?.user.user_metadata?.avatar_path === "string"
    ? session.user.user_metadata.avatar_path
    : "";
  const [accountAvatarUrl, setAccountAvatarUrl] = useState("");

  useEffect(() => {
    let active = true;
    let refreshTimer: number | undefined;
    if (!supabase || !accountAvatarPath) {
      setAccountAvatarUrl("");
      return;
    }

    async function refreshAvatar() {
      const { data, error } = await supabase!.storage.from("profile-photos").createSignedUrl(accountAvatarPath, 60 * 60);
      if (!active) return;
      setAccountAvatarUrl(error ? "" : data.signedUrl);
      refreshTimer = window.setTimeout(() => void refreshAvatar(), 55 * 60 * 1000);
    }

    void refreshAvatar();
    return () => {
      active = false;
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
    };
  }, [accountAvatarPath]);

  if (loading) return <LoadingPage />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (session.user.app_metadata?.must_change_password === true) return <FirstLoginPasswordPage />;
  if (roleLoading || roleUserId !== session.user.id) return <LoadingPage />;
  if (location.pathname === "/users") return <Navigate to={{ pathname: "/admin/users", search: location.search, hash: location.hash }} replace />;

  const isSystemAdmin = roles.includes("SUPER_SYSTEM_ADMIN");
  const assignedWorkspace = getAssignedWorkspace(roles, workspaceDomainCodes);
  const activePage = modulePages.find((page) => page.path === location.pathname);
  const availableWorkspaces = personnelWorkspaces.filter((workspace) => canAccessWorkspace(workspace, roles, workspaceDomainCodes));
  const routeWorkspace = getWorkspaceFromPath(location.pathname, location.search);
  const isWorkspaceRoot = personnelWorkspaces.some((workspace) => location.pathname === `/${workspace.slug}`);
  const employeeProfileMatch = location.pathname.match(/^\/people\/([^/]+)$/);
  const isSpecialPage = location.pathname === "/documents" || location.pathname === "/death" || location.pathname === "/admin/sessions" || location.pathname === "/profile";
  const isKnownPage = location.pathname === "/dashboard" || isWorkspaceRoot || Boolean(activePage || employeeProfileMatch || isSpecialPage);
  const routeWorkspaceAllowed = location.pathname === "/profile" || (isSystemAdmin
    ? !routeWorkspace
    : Boolean(assignedWorkspace && (!routeWorkspace || routeWorkspace.code === assignedWorkspace.code)));
  const routeAllowed = location.pathname === "/dashboard"
    ? (isSystemAdmin ? !routeWorkspace : !assignedWorkspace || Boolean(roleError))
    : isKnownPage && routeWorkspaceAllowed && canAccessModule(location.pathname, roles);
  const selectedWorkspace = isSystemAdmin ? undefined : assignedWorkspace;
  const name = session.user.user_metadata?.full_name || session.user.email || "Account";
  const homePath = assignedWorkspace ? `/${assignedWorkspace.slug}` : "/dashboard";

  if (location.pathname === "/") return <Navigate to={homePath} replace />;
  if (location.pathname === "/dashboard" && assignedWorkspace) return <Navigate to={homePath} replace />;
  if (!routeAllowed) return <Navigate to={homePath} replace />;
  const sidebarProps = {
    accountName: name,
    accountAvatarUrl,
    signingOut,
    sidebarCollapsed,
    onToggleCollapse: () => {
      const nextCollapsed = !sidebarCollapsed;
      setSidebarCollapsed(nextCollapsed);
      try {
        localStorage.setItem("dhrmis-sidebar-collapsed", String(nextCollapsed));
      } catch {
        // Keep the toggle usable when browser storage is unavailable.
      }
    },
    onNavigate: () => setSidebarOpen(false),
    onSignOut: () => void handleSignOut(),
  };

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch {
      showToast("Unable to sign out. Please try again.", "error");
      setSigningOut(false);
    }
  }

  return (
    <div className="app-shell">
      {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar${sidebarOpen ? " sidebar-open" : ""}${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
        <Suspense fallback={null}>
          {roles.includes("SUPER_SYSTEM_ADMIN") ? <SuperSystemAdminSidebar {...sidebarProps} />
            : roles.includes("SECRETARIAT_USER") ? <SecretariatSidebar {...sidebarProps} hasWorkspaceAccess={availableWorkspaces.some((workspace) => workspace.code === "SECRETARIAT")} />
              : roles.includes("MISSION_BOARD_USER") ? <MissionBoardSidebar {...sidebarProps} hasWorkspaceAccess={availableWorkspaces.some((workspace) => workspace.code === "MISSION")} />
                : roles.includes("EDUCATION_BOARD_USER") ? <EducationBoardSidebar {...sidebarProps} hasWorkspaceAccess={availableWorkspaces.some((workspace) => workspace.code === "EDUCATION")} />
                  : roles.includes("HEALTH_BOARD_USER") ? <HealthBoardSidebar {...sidebarProps} hasWorkspaceAccess={availableWorkspaces.some((workspace) => workspace.code === "HEALTH")} />
                    : roles.includes("LAND_FINANCE_BOARD_USER") ? <LandFinanceBoardSidebar {...sidebarProps} hasWorkspaceAccess={availableWorkspaces.some((workspace) => workspace.code === "LAND_FINANCE")} />
                      : roles.includes("PLANNING_DEVELOPMENT_BOARD_USER") ? <PlanningDevelopmentBoardSidebar {...sidebarProps} hasWorkspaceAccess={availableWorkspaces.some((workspace) => workspace.code === "PLANNING_DEVELOPMENT")} />
                        : roles.includes("ICT_BOARD_USER") ? <IctBoardSidebar {...sidebarProps} hasWorkspaceAccess={availableWorkspaces.some((workspace) => workspace.code === "ICT")} />
                          : null}
        </Suspense>
      </aside>
      <main className={`main-area${sidebarCollapsed ? " main-area-collapsed" : ""}`}>
        <header className="topbar">
          <button className="menu-button" aria-label="Open navigation" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(true)}><Icon name="menu" size={21} /></button>
          <div className="breadcrumb"><Link to="/dashboard">Workspace</Link><span className="breadcrumb-separator">/</span><strong>{selectedWorkspace ? `${selectedWorkspace.shortName} · ${location.pathname === `/${selectedWorkspace.slug}` ? "Dashboard" : employeeProfileMatch ? "Employee profile" : location.pathname === "/profile" ? "Account settings" : activePage?.label ?? "Page"}` : location.pathname === "/dashboard" ? "Overview" : employeeProfileMatch ? "Employee profile" : location.pathname === "/profile" ? "Account settings" : activePage?.label ?? "Page"}</strong></div>
          {assignedWorkspace && <GlobalSearch />}
          <span className={`network-status${online ? "" : " network-status-offline"}`} role="status"><Icon name={online ? "wifi" : "offline"} size={14} />{online ? "Online" : "Offline"}</span>
          <ThemeControl />
          {(assignedWorkspace || isSystemAdmin) && <NotificationCenter />}
          <details className="profile-menu">
            <summary aria-label="Open account menu"><AccountAvatar name={name} imageUrl={accountAvatarUrl} /><span className="profile-menu-name">{name}</span></summary>
            <div className="profile-menu-panel"><strong>{name}</strong><small>{session.user.email}</small><small>{roles.map(roleDisplayName).join(", ") || "No active role"}</small></div>
          </details>
          <span className="topbar-date">{new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date())}</span>
        </header>
        {!online && <div className="offline-banner" role="alert"><span><strong>You are offline.</strong> Protected records are not available and changes are not queued. Reconnect before continuing.</span></div>}
        {roleError && !isSystemAdmin && <div className="global-error" role="alert">Your access could not be loaded. Refresh the page or contact your system administrator.</div>}
        <Suspense fallback={<LoadingPage />}>
          <AppErrorBoundary title="This module could not be loaded">
            {!routeWorkspaceAllowed ? <div className="page-content"><div className="empty-state"><h2>{roles.includes("SUPER_SYSTEM_ADMIN") ? "Personnel workspace unavailable" : "Workspace access required"}</h2><Link className="button button-secondary" to="/dashboard">Open your workspaces</Link></div></div> : location.pathname === "/dashboard" ? <DashboardPage workspaces={availableWorkspaces} /> : personnelWorkspaces.some((workspace) => location.pathname === `/${workspace.slug}`) ? <DashboardPage workspace={routeWorkspace} workspaces={availableWorkspaces} /> : location.pathname === "/profile" ? <ProfileSettingsPage avatarUrl={accountAvatarUrl} /> : employeeProfileMatch ? <EmployeeProfilePage employeeId={decodeURIComponent(employeeProfileMatch[1])} /> : location.pathname === "/documents" ? <DocumentManagerPage /> : location.pathname === "/death" ? <DeathRecordsPage /> : location.pathname === "/admin/sessions" ? <SessionManagementPage /> : location.pathname === "/admin/users" ? <UserAdministrationPage /> : location.pathname === "/admin/scopes" ? <ScopeAdministrationPage /> : location.pathname === "/admin/roles" ? <RolePermissionsPage /> : location.pathname === "/audit" ? <AdminAuditPage /> : location.pathname === "/security" ? <SecurityEventsPage /> : location.pathname === "/admin/reports" ? <AdminReportsPage /> : location.pathname === "/admin/monitoring" ? <SystemMonitoringPage /> : <ModulePage />}
          </AppErrorBoundary>
        </Suspense>
      </main>
    </div>
  );
}
