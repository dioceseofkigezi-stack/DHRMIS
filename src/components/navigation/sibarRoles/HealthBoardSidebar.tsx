import { SidebarFrame, DepartmentLink, OverviewLink, WorkspaceHomeLink, type SidebarProps } from "./SidebarShared";

export default function HealthBoardSidebar(props: SidebarProps) {
  return (
    <SidebarFrame {...props} roleLabel="HEALTH BOARD">
      <div className="nav-group">
        <OverviewLink onNavigate={props.onNavigate} />
        {props.hasWorkspaceAccess && <>
          <WorkspaceHomeLink workspace="health" code="HEALTH" onNavigate={props.onNavigate} />
          <div className="nav-caption">HEALTH WORKSPACE</div>
          <DepartmentLink workspace="health" path="/people" label="Health employees" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="health" path="/assignments" label="Assignments" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="health" path="/recruitment" label="Recruitment" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="health" path="/applicants" label="Applicants" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="health" path="/appointments" label="Appointments" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="health" path="/leave" label="Leave" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="health" path="/performance" label="Performance" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="health" path="/qualifications" label="Qualifications" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="health" path="/training" label="Training" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="health" path="/licences" label="Professional licences" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="health" path="/transfers" label="Transfers" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="health" path="/retirement" label="Retirement" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="health" path="/early-retirement" label="Early retirement" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="health" path="/documents" label="Documents" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="health" path="/organization/institutions" label="Facilities" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="health" path="/organization" label="Departments" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="health" path="/organization/positions" label="Positions" onNavigate={props.onNavigate} />
        </>}
      </div>
    </SidebarFrame>
  );
}
