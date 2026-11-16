import { lazy, Suspense, useState } from "react";
import { Link, Navigate, NavLink, useLocation, useNavigate } from "react-router-dom";
import { canAccessModule, moduleGroups, modulePages } from "@/app/modules";
import GlobalSearch from "@/components/navigation/GlobalSearch";
import NotificationCenter from "@/components/navigation/NotificationCenter";
import { AppErrorBoundary } from "@/core/errors/AppErrorBoundary";
import { useNetworkStatus } from "@/core/monitoring/useNetworkStatus";
import { useToast } from "@/core/notifications/ToastProvider";
import { useAuth } from "@/modules/core/auth/context";

const DashboardPage = lazy(() => import("@/app/DashboardPage"));
const ModulePage = lazy(() => import("@/app/ModulePage"));
const EmployeeProfilePage = lazy(() => import("@/modules/human-resources/EmployeeProfilePage"));
const DocumentManagerPage = lazy(() => import("@/modules/archive/DocumentManagerPage"));
const DeathRecordsPage = lazy(() => import("@/modules/death/DeathRecordsPage"));

function LoadingPage() {
  return <div className="screen-state"><span className="loading-spinner" /> Loading workspace…</div>;
}

export default function App() {
  const { session, loading, roles, roleLoading, roleError, mfaChallengeRequired, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const showToast = useToast();
  const online = useNetworkStatus();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  if (loading) return <LoadingPage />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roleLoading) return <LoadingPage />;
  if (mfaChallengeRequired && location.pathname !== "/login") return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (location.pathname === "/") return <Navigate to="/dashboard" replace />;

  const activePage = modulePages.find((page) => page.path === location.pathname);
  const visiblePages = modulePages.filter((page) => canAccessModule(page.path, roles));
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
          <span className="nav-icon" aria-hidden="true">O</span><span>Overview</span>
        </NavLink>
        <nav className="module-nav" aria-label="System modules">
          {moduleGroups.filter((group) => visiblePages.some((page) => page.group === group)).map((group) => (
            <div className="nav-group" key={group}>
              <div className="nav-caption">{group.toUpperCase()}</div>
              {visiblePages.filter((page) => page.group === group).map((page) => (
                <NavLink key={page.path} to={page.path} onClick={() => setSidebarOpen(false)} className={({ isActive }) => `nav-link${isActive ? " nav-link-active" : ""}`}>
                  <span className="nav-icon" aria-hidden="true">{page.label.slice(0, 1)}</span><span>{page.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-protection"><span className="access-dot" /><span>Protected workspace<br /><small>Database policies enforce access</small></span></div>
          <div className="account-row"><span className="avatar">{name.slice(0, 1).toUpperCase()}</span><span className="account-name"><strong>{name}</strong><small>Signed in</small></span></div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <button className="menu-button" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}>Menu</button>
          <div className="breadcrumb"><Link to="/dashboard">Workspace</Link><span className="breadcrumb-separator">/</span><strong>{location.pathname === "/dashboard" ? "Overview" : employeeProfileMatch ? "Employee profile" : activePage?.label ?? "Page"}</strong></div>
          <GlobalSearch />
          <span className={`network-status${online ? "" : " network-status-offline"}`} role="status">{online ? "Online" : "Offline"}</span>
          <NotificationCenter />
          <details className="profile-menu">
            <summary aria-label="Open account menu"><span className="avatar">{name.slice(0, 1).toUpperCase()}</span><span className="profile-menu-name">{name}</span></summary>
            <div className="profile-menu-panel"><strong>{name}</strong><small>{session.user.email}</small><small>{roles.join(", ") || "No active role"}</small><button className="button button-secondary button-small" onClick={() => void handleSignOut()} disabled={signingOut}>{signingOut ? "Signing out…" : "Sign out"}</button></div>
          </details>
          <span className="topbar-date">{new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date())}</span>
        </header>
        {!online && <div className="offline-banner" role="alert"><strong>You are offline.</strong> Protected records are not available and changes are not queued. Reconnect before continuing.</div>}
        {roleError && <div className="global-error" role="alert">Your access could not be loaded. Refresh the page or contact your system administrator.</div>}
        <Suspense fallback={<LoadingPage />}>
          <AppErrorBoundary title="This module could not be loaded">
            {location.pathname === "/dashboard" ? <DashboardPage /> : employeeProfileMatch ? <EmployeeProfilePage employeeId={decodeURIComponent(employeeProfileMatch[1])} /> : location.pathname === "/documents" ? <DocumentManagerPage /> : location.pathname === "/death" ? <DeathRecordsPage /> : <ModulePage />}
          </AppErrorBoundary>
        </Suspense>
      </main>
    </div>
  );
}
