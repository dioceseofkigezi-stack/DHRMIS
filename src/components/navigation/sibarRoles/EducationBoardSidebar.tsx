import { SidebarFrame, DepartmentLink, OverviewLink, WorkspaceHomeLink, type SidebarProps } from "./SidebarShared";

export default function EducationBoardSidebar(props: SidebarProps) {
  return (
    <SidebarFrame {...props} roleLabel="EDUCATION BOARD">
      <div className="nav-group">
        <OverviewLink onNavigate={props.onNavigate} />
        {props.hasWorkspaceAccess && <>
          <WorkspaceHomeLink workspace="education" code="EDUCATION" onNavigate={props.onNavigate} />
          <div className="nav-caption">EDUCATION WORKSPACE</div>
          <DepartmentLink workspace="education" path="/people" label="Education employees" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="education" path="/assignments" label="Assignments" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="education" path="/recruitment" label="Recruitment" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="education" path="/applicants" label="Applicants" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="education" path="/appointments" label="Appointments" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="education" path="/leave" label="Leave" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="education" path="/performance" label="Performance" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="education" path="/qualifications" label="Qualifications" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="education" path="/training" label="Training" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="education" path="/transfers" label="Transfers" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="education" path="/retirement" label="Retirement" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="education" path="/early-retirement" label="Early retirement" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="education" path="/documents" label="Documents" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="education" path="/organization/institutions" label="Institutions" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="education" path="/organization" label="Departments" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="education" path="/organization/positions" label="Positions" onNavigate={props.onNavigate} />
        </>}
      </div>
    </SidebarFrame>
  );
}
