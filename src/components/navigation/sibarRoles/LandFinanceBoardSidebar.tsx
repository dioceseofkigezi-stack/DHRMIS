import { SidebarFrame, DepartmentLink, OverviewLink, WorkspaceHomeLink, type SidebarProps } from "./SidebarShared";

export default function LandFinanceBoardSidebar(props: SidebarProps) {
  return (
    <SidebarFrame {...props} roleLabel="LAND & FINANCE BOARD">
      <div className="nav-group">
        <OverviewLink onNavigate={props.onNavigate} />
        {props.hasWorkspaceAccess && <>
          <WorkspaceHomeLink workspace="land-finance" code="LAND_FINANCE" onNavigate={props.onNavigate} />
          <div className="nav-caption">LAND & FINANCE WORKSPACE</div>
          <DepartmentLink workspace="land-finance" path="/people" label="Board employees" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="land-finance" path="/assignments" label="Assignments" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="land-finance" path="/recruitment" label="Recruitment" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="land-finance" path="/applicants" label="Applicants" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="land-finance" path="/appointments" label="Appointments" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="land-finance" path="/leave" label="Leave" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="land-finance" path="/performance" label="Performance" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="land-finance" path="/qualifications" label="Qualifications" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="land-finance" path="/training" label="Training" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="land-finance" path="/transfers" label="Transfers" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="land-finance" path="/retirement" label="Retirement" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="land-finance" path="/early-retirement" label="Early retirement" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="land-finance" path="/documents" label="Documents" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="land-finance" path="/payroll" label="Payroll & benefits" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="land-finance" path="/organization/institutions" label="Institutions" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="land-finance" path="/organization" label="Departments" onNavigate={props.onNavigate} />
          <DepartmentLink workspace="land-finance" path="/organization/positions" label="Positions" onNavigate={props.onNavigate} />
        </>}
      </div>
    </SidebarFrame>
  );
}
