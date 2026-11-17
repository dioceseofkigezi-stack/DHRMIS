import { SidebarFrame, DepartmentLink, OverviewLink, WorkspaceHomeLink, type SidebarProps } from "./SidebarShared";

export default function MissionBoardSidebar(props: SidebarProps) {
  return (
    <SidebarFrame {...props} roleLabel="MISSION BOARD">
      <div className="nav-group">
        <OverviewLink onNavigate={props.onNavigate} />
        {props.hasWorkspaceAccess && <>
          <WorkspaceHomeLink workspace="mission" code="MISSION" onNavigate={props.onNavigate} />
          <div className="nav-caption">MISSION WORKSPACE</div>
          <DepartmentLink workspace="mission" path="/people" label="Mission employees" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="mission" path="/assignments" label="Assignments" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="mission" path="/recruitment" label="Recruitment" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="mission" path="/applicants" label="Applicants" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="mission" path="/appointments" label="Appointments" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="mission" path="/leave" label="Leave" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="mission" path="/performance" label="Performance" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="mission" path="/qualifications" label="Qualifications" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="mission" path="/training" label="Training" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="mission" path="/transfers" label="Transfers" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="mission" path="/retirement" label="Retirement" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="mission" path="/early-retirement" label="Early retirement" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="mission" path="/documents" label="Documents" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="mission" path="/organization/institutions" label="Institutions" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="mission" path="/organization" label="Departments" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="mission" path="/organization/positions" label="Positions" onNavigate={props.onNavigate} />
        </>}
      </div>
    </SidebarFrame>
  );
}
