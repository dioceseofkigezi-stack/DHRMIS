import { getPathIcon } from "@/components/ui/Icon";
import { OverviewLink, SidebarFrame, SidebarLink, type SidebarProps } from "./SidebarShared";

export default function SuperSystemAdminSidebar(props: SidebarProps) {
  return (
    <SidebarFrame {...props} roleLabel="SUPER/SYSTEM ADMINISTRATION">
      <div className="nav-group">
        <OverviewLink onNavigate={props.onNavigate} />
      </div>
      <div className="nav-group">
        <div className="nav-caption">SYSTEM FUNCTIONS</div>
        <SidebarLink to="/admin/users" label="Users, roles & permissions" icon={getPathIcon("/admin/users")} onNavigate={props.onNavigate} />
        <SidebarLink to="/admin/scopes" label="User scopes" icon={getPathIcon("/admin/scopes")} onNavigate={props.onNavigate} />
        <SidebarLink to="/admin/sessions" label="Session management" icon="settings" onNavigate={props.onNavigate} />
        <SidebarLink to="/security" label="Security events" icon={getPathIcon("/security")} onNavigate={props.onNavigate} />
        <SidebarLink to="/audit" label="Audit logs" icon={getPathIcon("/audit")} onNavigate={props.onNavigate} />
        <SidebarLink to="/settings" label="System configuration" icon={getPathIcon("/settings")} onNavigate={props.onNavigate} />
      </div>
    </SidebarFrame>
  );
}
