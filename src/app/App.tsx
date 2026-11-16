import { lazy, Suspense, useState } from "react";
import { Link, Navigate, NavLink, useLocation, useNavigate } from "react-router-dom";
import { canAccessModule, moduleGroups, modulePages } from "@/app/modules";
import GlobalSearch from "@/components/navigation/GlobalSearch";
import NotificationCenter from "@/components/navigation/NotificationCenter";
import { getPathIcon, getWorkspaceIcon, Icon } from "@/components/ui/Icon";
import { AppErrorBoundary } from "@/core/errors/AppErrorBoundary";
import { useNetworkStatus } from "@/core/monitoring/useNetworkStatus";
import { useToast } from "@/core/notifications/ToastProvider";
import { useAuth } from "@/modules/core/auth/context";
import { canAccessWorkspace, getWorkspaceFromPath, getWorkspaceNavigation, personnelWorkspaces, workspacePath } from "@/core/organizational-scope/workspaces";
import MfaRequiredPage from "@/modules/auth/MfaRequiredPage";

const DashboardPage = lazy(() => import("@/app/DashboardPage"));
const ModulePage = lazy(() => import("@/app/ModulePage"));
const EmployeeProfilePage = lazy(() => import("@/modules/human-resources/EmployeeProfilePage"));
const DocumentManagerPage = lazy(() => import("@/modules/archive/DocumentManagerPage"));
const DeathRecordsPage = lazy(() => import("@/modules/death/DeathRecordsPage"));
const SessionManagementPage = lazy(() => import("@/modules/admin/SessionManagementPage"));

function LoadingPage() {
  return <div className="screen-state"><span className="loading-spinner" /> Loading workspace…</div>;
}

function sessionAal(accessToken: string) {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return "";
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const claims = JSON.parse(atob(base64)) as Record<string, unknown>;
    return typeof claims.aal === "string" ? claims.aal : "";
  } catch {
    return "";
  }
}

export default function App() {
  const { session, loading, roles, workspaceDomainCodes, roleLoading, roleError, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const showToast = useToast();
  const online = useNetworkStatus();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  if (loading) return <LoadingPage />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roleLoading) return <LoadingPage />;
  if (roles.length > 0 && sessionAal(session.access_token) !== "aal2") return <MfaRequiredPage />;
  if (location.pathname === "/") return <Navigate to="/dashboard" replace />;

  const activePage = modulePages.find((page) => page.path === location.pathname);
  const availableWorkspaces = personnelWorkspaces.filter((workspace) => canAccessWorkspace(workspace, roles, workspaceDomainCodes));
  const routeWorkspace = getWorkspaceFromPath(location.pathname, location.search);
  const routeWorkspaceAllowed = !routeWorkspace || availableWorkspaces.some((workspace) => workspace.code === routeWorkspace.code);
  const selectedWorkspace = location.pathname === "/dashboard"
    ? undefined
    : routeWorkspace
      ? routeWorkspaceAllowed ? routeWorkspace : undefined
      : availableWorkspaces.length === 1 ? availableWorkspaces[0] : undefined;
  const workspaceNav = selectedWorkspace ? getWorkspaceNavigation(selectedWorkspace, roles) : [];
  const scopeRequiredRoles = ["SECRETARIAT_USER", "MISSION_BOARD_USER", "EDUCATION_BOARD_USER", "HEALTH_BOARD_USER", "LAND_FINANCE_BOARD_USER", "PLANNING_DEVELOPMENT_BOARD_USER", "ICT_BOARD_USER"];
  const missingPersonnelScope = workspaceDomainCodes.length === 0 && roles.some((role) => scopeRequiredRoles.includes(role));
  const visiblePages = modulePages.filter((page) => canAccessModule(page.path, roles) && (!missingPersonnelScope || ["/audit", "/security", "/settings"].includes(page.path)));
  const name = session.user.user_metadata?.full_name || session.user.email || "Account";
  const employeeProfileMatch = location.pathname.match(/^\/people\/([^/]+)$/);

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
      <aside className={`sidebar${sidebarOpen ? " sidebar-open" : ""}`}>
        <Link to="/dashboard" className="brand-lockup sidebar-brand" onClick={() => setSidebarOpen(false)}>
          <span className="brand-symbol">DK</span><span className="brand-name"><strong>DHRMIS</strong><small>Diocese of Kigezi</small></span>
        </Link>
        <div className="nav-caption">WORKSPACE</div>
        <NavLink to="/dashboard" onClick={() => setSidebarOpen(false)} className={({ isActive }) => `nav-link${isActive ? " nav-link-active" : ""}`}>
          <span className="nav-icon"><Icon name="overview" size={15} /></span><span>Overview</span>
        </NavLink>
        <nav className="module-nav" aria-label={selectedWorkspace ? `${selectedWorkspace.shortName} workspace navigation` : "System modules"}>
          {availableWorkspaces.length > 0 && <div className="nav-group">
            <div className="nav-caption">PERSONNEL WORKSPACES</div>
            {availableWorkspaces.map((workspace) => (
              <NavLink key={workspace.slug} to={`/${workspace.slug}`} onClick={() => setSidebarOpen(false)} className={({ isActive }) => `nav-link${isActive ? " nav-link-active" : ""}`}>
                <span className="nav-icon"><Icon name={getWorkspaceIcon(workspace.code)} size={15} /></span><span>{workspace.shortName}</span>
              </NavLink>
            ))}
          </div>}
          {selectedWorkspace && <div className="nav-group">
            <div className="nav-caption">{selectedWorkspace.shortName.toUpperCase()} WORKSPACE</div>
            {workspaceNav.map((item) => (
              <NavLink key={`${selectedWorkspace.slug}-${item.path}`} to={workspacePath(item.path, selectedWorkspace.slug)} onClick={() => setSidebarOpen(false)} className={({ isActive }) => `nav-link${isActive ? " nav-link-active" : ""}`}>
                <span className="nav-icon"><Icon name={getPathIcon(item.path)} size={15} /></span><span>{item.label}</span>
              </NavLink>
            ))}
          </div>}
          {availableWorkspaces.length > 0 && visiblePages.some((page) => page.group === "Administration") && <div className="nav-group">
            <div className="nav-caption">ADMINISTRATION</div>
            {visiblePages.filter((page) => page.group === "Administration").map((page) => (
              <NavLink key={page.path} to={page.path} onClick={() => setSidebarOpen(false)} className={({ isActive }) => `nav-link${isActive ? " nav-link-active" : ""}`}>
                <span className="nav-icon"><Icon name={getPathIcon(page.path)} size={15} /></span><span>{page.label}</span>
              </NavLink>
            ))}
          </div>}
          {availableWorkspaces.length === 0 && moduleGroups.filter((group) => visiblePages.some((page) => page.group === group)).map((group) => (
            <div className="nav-group" key={group}>
              <div className="nav-caption">{group.toUpperCase()}</div>
              {visiblePages.filter((page) => page.group === group).map((page) => (
                <NavLink key={page.path} to={page.path} onClick={() => setSidebarOpen(false)} className={({ isActive }) => `nav-link${isActive ? " nav-link-active" : ""}`}>
                  <span className="nav-icon"><Icon name={getPathIcon(page.path)} size={15} /></span><span>{page.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-protection"><span className="protection-icon"><Icon name="shield" size={17} /></span><span>Protected workspace<br /><small>Database policies enforce access</small></span></div>
          <div className="account-row"><span className="avatar">{name.slice(0, 1).toUpperCase()}</span><span className="account-name"><strong>{name}</strong><small>Signed in</small></span></div>
          <button className="button button-secondary sidebar-signout" type="button" onClick={() => void handleSignOut()} disabled={signingOut}>
            <Icon name="signOut" size={14} />{signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <button className="menu-button" aria-label="Open navigation" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(true)}><Icon name="menu" size={21} /></button>
          <div className="breadcrumb"><Link to="/dashboard">Workspace</Link><span className="breadcrumb-separator">/</span><strong>{selectedWorkspace ? `${selectedWorkspace.shortName} · ${location.pathname === `/${selectedWorkspace.slug}` ? "Dashboard" : employeeProfileMatch ? "Employee profile" : activePage?.label ?? "Page"}` : location.pathname === "/dashboard" ? "Overview" : employeeProfileMatch ? "Employee profile" : activePage?.label ?? "Page"}</strong></div>
          <GlobalSearch />
          <span className={`network-status${online ? "" : " network-status-offline"}`} role="status"><Icon name={online ? "wifi" : "offline"} size={14} />{online ? "Online" : "Offline"}</span>
          <NotificationCenter />
          <details className="profile-menu">
            <summary aria-label="Open account menu"><span className="avatar">{name.slice(0, 1).toUpperCase()}</span><span className="profile-menu-name">{name}</span></summary>
            <div className="profile-menu-panel"><strong>{name}</strong><small>{session.user.email}</small><small>{roles.join(", ") || "No active role"}</small></div>
          </details>
          <span className="topbar-date">{new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date())}</span>
        </header>
        {!online && <div className="offline-banner" role="alert"><Icon name="offline" size={16} /><span><strong>You are offline.</strong> Protected records are not available and changes are not queued. Reconnect before continuing.</span></div>}
        {roleError && <div className="global-error" role="alert">Your access could not be loaded. Refresh the page or contact your system administrator.</div>}
        <Suspense fallback={<LoadingPage />}>
          <AppErrorBoundary title="This module could not be loaded">
            {!routeWorkspaceAllowed ? <div className="page-content"><div className="empty-state"><div className="empty-mark">Restricted</div><h2>Workspace access required</h2><p>Your account does not have an active scope for this department.</p><Link className="button button-secondary" to="/dashboard">Open your workspaces</Link></div></div> : location.pathname === "/dashboard" ? <DashboardPage workspaces={availableWorkspaces} /> : personnelWorkspaces.some((workspace) => location.pathname === `/${workspace.slug}`) ? <DashboardPage workspace={routeWorkspace} workspaces={availableWorkspaces} /> : employeeProfileMatch ? <EmployeeProfilePage employeeId={decodeURIComponent(employeeProfileMatch[1])} /> : location.pathname === "/documents" ? <DocumentManagerPage /> : location.pathname === "/death" ? <DeathRecordsPage /> : location.pathname === "/admin/sessions" ? <SessionManagementPage /> : <ModulePage />}
          </AppErrorBoundary>
        </Suspense>
      </main>
    </div>
  );
}
