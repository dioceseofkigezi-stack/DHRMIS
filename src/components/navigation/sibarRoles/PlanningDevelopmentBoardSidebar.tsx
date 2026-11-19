import { SidebarFrame, DepartmentLink, OverviewLink, type SidebarProps } from "./SidebarShared";

export default function PlanningDevelopmentBoardSidebar(props: SidebarProps) {
  return (
    <SidebarFrame {...props} roleLabel="PLANNING & DEVELOPMENT BOARD">
      <div className="nav-group">
        <OverviewLink onNavigate={props.onNavigate} />
        {props.hasWorkspaceAccess && <>
          <DepartmentLink workspace="planning-development" path="/people" label="Project employees" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="planning-development" path="/assignments" label="Assignments" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="planning-development" path="/recruitment" label="Recruitment" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="planning-development" path="/applicants" label="Applicants" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="planning-development" path="/appointments" label="Appointments" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="planning-development" path="/leave" label="Leave" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="planning-development" path="/performance" label="Performance" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="planning-development" path="/qualifications" label="Qualifications" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="planning-development" path="/training" label="Training" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="planning-development" path="/transfers" label="Transfers" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="planning-development" path="/retirement" label="Retirement" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="planning-development" path="/early-retirement" label="Early retirement" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="planning-development" path="/documents" label="Documents" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="planning-development" path="/organization/institutions" label="Institutions" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="planning-development" path="/organization" label="Departments" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="planning-development" path="/organization/positions" label="Positions" onNavigate={props.onNavigate} />
        </>}
      </div>
    </SidebarFrame>
  );
}
