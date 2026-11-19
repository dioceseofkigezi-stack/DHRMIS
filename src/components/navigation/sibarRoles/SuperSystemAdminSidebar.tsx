import { getPathIcon } from "@/components/ui/Icon";
import { OverviewLink, SidebarFrame, SidebarLink, type SidebarProps } from "./SidebarShared";

export default function SuperSystemAdminSidebar(props: SidebarProps) {
  return (
    <SidebarFrame {...props} roleLabel="SUPER/SYSTEM ADMINISTRATION">
      <div className="nav-group">
        <OverviewLink onNavigate={props.onNavigate} />
      </div>
      <div className="nav-group">
        <SidebarLink to="/admin/users" label="User access" icon={getPathIcon("/admin/users")} onNavigate={props.onNavigate} />
        <SidebarLink to="/admin/roles" label="Roles & permissions" icon={getPathIcon("/admin/roles")} onNavigate={props.onNavigate} />
        <SidebarLink to="/admin/scopes" label="Organizational access" icon={getPathIcon("/admin/scopes")} onNavigate={props.onNavigate} />
        <SidebarLink to="/admin/sessions" label="Sessions & devices" icon="settings" onNavigate={props.onNavigate} />
        <SidebarLink to="/security" label="Security events" icon={getPathIcon("/security")} onNavigate={props.onNavigate} />
        <SidebarLink to="/audit" label="Audit activity" icon={getPathIcon("/audit")} onNavigate={props.onNavigate} />
        <SidebarLink to="/admin/monitoring" label="System health & monitoring" icon={getPathIcon("/admin/monitoring")} onNavigate={props.onNavigate} />
        <SidebarLink to="/admin/reports" label="Administrative reports" icon={getPathIcon("/admin/reports")} onNavigate={props.onNavigate} />
        <SidebarLink to="/settings" label="System configuration" icon={getPathIcon("/settings")} onNavigate={props.onNavigate} />
      </div>
    </SidebarFrame>
  );
}
