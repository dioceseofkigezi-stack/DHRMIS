import { SidebarFrame, DepartmentLink, OverviewLink, type SidebarProps } from "./SidebarShared";

export default function IctBoardSidebar(props: SidebarProps) {
  return (
    <SidebarFrame {...props} roleLabel="ICT BOARD">
      <div className="nav-group">
        <OverviewLink onNavigate={props.onNavigate} />
        {props.hasWorkspaceAccess && <>
          <DepartmentLink workspace="ict" path="/people" label="ICT employees" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="ict" path="/assignments" label="Assignments" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="ict" path="/recruitment" label="Recruitment" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="ict" path="/applicants" label="Applicants" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="ict" path="/appointments" label="Appointments" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="ict" path="/leave" label="Leave" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="ict" path="/performance" label="Performance" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="ict" path="/qualifications" label="Qualifications" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="ict" path="/training" label="Training" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="ict" path="/licences" label="Technical certifications" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="ict" path="/transfers" label="Transfers" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="ict" path="/retirement" label="Retirement" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="ict" path="/early-retirement" label="Early retirement" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="ict" path="/documents" label="Documents" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="ict" path="/organization/institutions" label="Institutions" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="ict" path="/organization" label="Departments" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="ict" path="/organization/positions" label="Positions" onNavigate={props.onNavigate} />
        </>}
      </div>
    </SidebarFrame>
  );
}
