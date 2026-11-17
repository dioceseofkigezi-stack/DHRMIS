import { SidebarFrame, DepartmentLink, OverviewLink, WorkspaceHomeLink, type SidebarProps } from "./SidebarShared";

export default function SecretariatSidebar(props: SidebarProps) {
  return (
    <SidebarFrame {...props} roleLabel="SECRETARIAT / MAIN OFFICE">
      <div className="nav-group">
        <OverviewLink onNavigate={props.onNavigate} />
        {props.hasWorkspaceAccess && <>
          <WorkspaceHomeLink workspace="secretariat" code="SECRETARIAT" onNavigate={props.onNavigate} />
          <div className="nav-caption">SECRETARIAT WORKSPACE</div>
          <DepartmentLink workspace="secretariat" path="/people" label="Secretariat employees" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="secretariat" path="/clergy" label="Clergy" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="secretariat" path="/catechists" label="Catechists" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="secretariat" path="/assignments" label="Assignments" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="secretariat" path="/recruitment" label="Recruitment" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="secretariat" path="/applicants" label="Applicants" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="secretariat" path="/appointments" label="Appointments" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="secretariat" path="/leave" label="Leave" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="secretariat" path="/performance" label="Performance" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="secretariat" path="/qualifications" label="Qualifications" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="secretariat" path="/training" label="Training" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="secretariat" path="/transfers" label="Transfers" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="secretariat" path="/retirement" label="Retirement" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="secretariat" path="/early-retirement" label="Early retirement" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="secretariat" path="/documents" label="Documents" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="secretariat" path="/organization" label="Departments" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="secretariat" path="/organization/archdeaconries" label="Archdeaconries" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="secretariat" path="/organization/parishes" label="Parishes" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="secretariat" path="/organization/local-churches" label="Local churches" onNavigate={props.onNavigate} />
        </>}
      </div>
    </SidebarFrame>
  );
}
