import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { getPathIcon, getWorkspaceIcon, Icon, type SystemIcon } from "@/components/ui/Icon";
import { workspacePath } from "@/core/organizational-scope/workspaces";

export interface SidebarProps {
  accountName: string;
  accountAvatarUrl: string;
  signingOut: boolean;
  sidebarCollapsed: boolean;
  onToggleCollapse: () => void;
  hasWorkspaceAccess?: boolean;
  onNavigate: () => void;
  onSignOut: () => void;
}

export function SidebarFrame({ roleLabel, accountName, accountAvatarUrl, signingOut, sidebarCollapsed, onToggleCollapse, onNavigate, onSignOut, children }: SidebarProps & {
  roleLabel: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className="sidebar-header">
        <Link to="/dashboard" className="brand-lockup sidebar-brand" onClick={onNavigate} aria-label="DHRMIS home">
          <img className="brand-symbol" src="/LOGO.PNG" alt="" /><span className="brand-name"><strong>DHRMIS</strong><small>Diocese of Kigezi</small></span>
        </Link>
        <button
          className="sidebar-collapse-toggle"
          type="button"
          aria-label={sidebarCollapsed ? "Show navigation labels" : "Hide navigation labels"}
          aria-expanded={!sidebarCollapsed}
          title={sidebarCollapsed ? "Show navigation labels" : "Hide navigation labels"}
          onClick={onToggleCollapse}
        >
          <Icon name={sidebarCollapsed ? "arrowRight" : "arrowLeft"} size={16} />
        </button>
      </div>
      <div className="nav-caption">{roleLabel}</div>
      <nav className="module-nav" aria-label={`${roleLabel} navigation`}>
        {children}
      </nav>
      <div className="sidebar-bottom">
        <SidebarLink to="/profile" label="Account settings" icon="settings" onNavigate={onNavigate} />
        <div className="account-row"><AccountAvatar name={accountName} imageUrl={accountAvatarUrl} /><span className="account-name"><strong>{accountName}</strong><small>Signed in</small></span></div>
        <button className="button button-secondary sidebar-signout" type="button" aria-label={signingOut ? "Signing out" : "Sign out"} title={signingOut ? "Signing out" : "Sign out"} onClick={onSignOut} disabled={signingOut}>
          <Icon name="signOut" size={14} /><span className="sidebar-signout-label">{signingOut ? "Signing out..." : "Sign out"}</span>
        </button>
      </div>
    </>
  );
}

export function AccountAvatar({ name, imageUrl }: { name: string; imageUrl: string }) {
  return <span className="avatar" aria-hidden="true">
    {imageUrl ? <img src={imageUrl} alt="" /> : name.slice(0, 1).toUpperCase()}
  </span>;
}

export function SidebarLink({ to, label, icon, onNavigate }: {
  to: string;
  label: string;
  icon: SystemIcon;
  onNavigate: () => void;
}) {
  return (
    <NavLink to={to} end onClick={onNavigate} aria-label={label} title={label} className={({ isActive }) => `nav-link${isActive ? " nav-link-active" : ""}`}>
      <span className="nav-icon"><Icon name={icon} size={15} /></span><span className="nav-label">{label}</span>
    </NavLink>
  );
}

export function DepartmentLink({ workspace, path, label, onNavigate }: {
  workspace: string;
  path: string;
  label: string;
  onNavigate: () => void;
}) {
  return <SidebarLink to={workspacePath(path, workspace)} label={label} icon={getPathIcon(path)} onNavigate={onNavigate} />;
}

export function OverviewLink({ onNavigate }: { onNavigate: () => void }) {
  return <SidebarLink to="/dashboard" label="Overview" icon="overview" onNavigate={onNavigate} />;
}

export function WorkspaceHomeLink({ workspace, code, onNavigate }: {
  workspace: string;
  code: string;
  onNavigate: () => void;
}) {
  return <SidebarLink to={`/${workspace}`} label="Workspace dashboard" icon={getWorkspaceIcon(code)} onNavigate={onNavigate} />;
}
