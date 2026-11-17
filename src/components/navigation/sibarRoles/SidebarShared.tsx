import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { getPathIcon, getWorkspaceIcon, Icon, type SystemIcon } from "@/components/ui/Icon";
import { workspacePath } from "@/core/organizational-scope/workspaces";

export interface SidebarProps {
  accountName: string;
  signingOut: boolean;
  hasWorkspaceAccess?: boolean;
  onNavigate: () => void;
  onSignOut: () => void;
}

export function SidebarFrame({ roleLabel, accountName, signingOut, onNavigate, onSignOut, children }: SidebarProps & {
  roleLabel: string;
  children: ReactNode;
}) {
  return (
    <>
      <Link to="/dashboard" className="brand-lockup sidebar-brand" onClick={onNavigate}>
        <span className="brand-symbol">DK</span><span className="brand-name"><strong>DHRMIS</strong><small>Diocese of Kigezi</small></span>
      </Link>
      <div className="nav-caption">{roleLabel}</div>
      <nav className="module-nav" aria-label={`${roleLabel} navigation`}>
        {children}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-protection"><span className="protection-icon"><Icon name="shield" size={17} /></span><span>Protected workspace<br /><small>Database policies enforce access</small></span></div>
        <div className="account-row"><span className="avatar">{accountName.slice(0, 1).toUpperCase()}</span><span className="account-name"><strong>{accountName}</strong><small>Signed in</small></span></div>
        <button className="button button-secondary sidebar-signout" type="button" onClick={onSignOut} disabled={signingOut}>
          <Icon name="signOut" size={14} />{signingOut ? "Signing out..." : "Sign out"}
        </button>
      </div>
    </>
  );
}

export function SidebarLink({ to, label, icon, onNavigate }: {
  to: string;
  label: string;
  icon: SystemIcon;
  onNavigate: () => void;
}) {
  return (
    <NavLink to={to} end onClick={onNavigate} className={({ isActive }) => `nav-link${isActive ? " nav-link-active" : ""}`}>
      <span className="nav-icon"><Icon name={icon} size={15} /></span><span>{label}</span>
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
