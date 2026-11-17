export interface PersonnelWorkspace {
  slug: string;
  code: string;
  name: string;
  shortName: string;
  description: string;
  kind: "secretariat" | "board";
  boardCode?: string;
  roleCode: string;
}

export interface PersonnelDomain {
  id: string;
  code: string;
  name: string;
  boardId: string | null;
  isSecretariat: boolean;
}

export const personnelWorkspaces: PersonnelWorkspace[] = [
  {
    slug: "secretariat",
    code: "SECRETARIAT",
    name: "Diocesan Secretariat / Central Administration",
    shortName: "Secretariat",
    description: "Secretariat personnel and the ecclesiastical structure administered by Central Administration.",
    kind: "secretariat",
    roleCode: "SECRETARIAT_USER",
  },
  {
    slug: "mission",
    code: "MISSION",
    boardCode: "MISSION",
    name: "Mission Board",
    shortName: "Mission",
    description: "Mission personnel, programmes, recruitment and development.",
    kind: "board",
    roleCode: "MISSION_BOARD_USER",
  },
  {
    slug: "education",
    code: "EDUCATION",
    boardCode: "EDUCATION",
    name: "Education Board",
    shortName: "Education",
    description: "Education personnel, institutions, qualifications and staffing needs.",
    kind: "board",
    roleCode: "EDUCATION_BOARD_USER",
  },
  {
    slug: "health",
    code: "HEALTH",
    boardCode: "HEALTH",
    name: "Health Board",
    shortName: "Health",
    description: "Health personnel, facilities, professional licences and staffing levels.",
    kind: "board",
    roleCode: "HEALTH_BOARD_USER",
  },
  {
    slug: "land-finance",
    code: "LAND_FINANCE",
    boardCode: "LAND_FINANCE",
    name: "Land & Finance Board",
    shortName: "Land & Finance",
    description: "Board personnel, finance staffing, vacancies and workforce development.",
    kind: "board",
    roleCode: "LAND_FINANCE_BOARD_USER",
  },
  {
    slug: "planning-development",
    code: "PLANNING_DEVELOPMENT",
    boardCode: "PLANNING_DEVELOPMENT",
    name: "Planning & Development Board",
    shortName: "Planning & Development",
    description: "Project personnel, development programmes, staffing gaps and recruitment.",
    kind: "board",
    roleCode: "PLANNING_DEVELOPMENT_BOARD_USER",
  },
  {
    slug: "ict",
    code: "ICT",
    boardCode: "ICT",
    name: "ICT Board",
    shortName: "ICT",
    description: "ICT Board personnel, technical teams, recruitment and certifications.",
    kind: "board",
    roleCode: "ICT_BOARD_USER",
  },
];

export const businessRoleCodes = personnelWorkspaces.map((workspace) => workspace.roleCode);
export const systemRoleCodes = ["SUPER_SYSTEM_ADMIN"] as const;
const roleLabels: Record<string, string> = {
  SUPER_SYSTEM_ADMIN: "Super/System Administrator",
  SECRETARIAT_USER: "Secretariat / Main Office User",
  MISSION_BOARD_USER: "Mission Board User",
  EDUCATION_BOARD_USER: "Education Board User",
  HEALTH_BOARD_USER: "Health Board User",
  LAND_FINANCE_BOARD_USER: "Land & Finance Board User",
  PLANNING_DEVELOPMENT_BOARD_USER: "Planning & Development Board User",
  ICT_BOARD_USER: "ICT Board User",
};

export function roleDisplayName(roleCode: string) {
  return roleLabels[roleCode] ?? roleCode;
}

export function getWorkspace(slug: string | undefined) {
  return personnelWorkspaces.find((workspace) => workspace.slug === slug);
}

export function canAccessWorkspace(
  workspace: PersonnelWorkspace,
  roles: string[],
  domainCodes: string[],
) {
  if (roles.includes("SUPER_SYSTEM_ADMIN")) return false;
  return roles.includes(workspace.roleCode) && domainCodes.includes(workspace.code);
}

export function getAssignedWorkspace(roles: string[], domainCodes: string[]) {
  return personnelWorkspaces.find((workspace) => canAccessWorkspace(workspace, roles, domainCodes));
}

export function getWorkspaceLandingPath(roles: string[], domainCodes: string[]) {
  const assignedWorkspace = getAssignedWorkspace(roles, domainCodes);
  return assignedWorkspace ? `/${assignedWorkspace.slug}` : "/dashboard";
}

export function canManageWorkspacePersonnel(workspace: PersonnelWorkspace, roles: string[]) {
  return !roles.includes("SUPER_SYSTEM_ADMIN") && roles.includes(workspace.roleCode);
}

export function getWorkspaceNavigation(workspace: PersonnelWorkspace, roles: string[]) {
  if (roles.includes("SUPER_SYSTEM_ADMIN")) return [];

  const common = [
    { label: `${workspace.shortName} employees`, path: "/people" },
    { label: "Assignments", path: "/assignments" },
    { label: "Recruitment", path: "/recruitment" },
    { label: "Applicants", path: "/applicants" },
    { label: "Appointments", path: "/appointments" },
    { label: "Leave", path: "/leave" },
    { label: "Performance", path: "/performance" },
    { label: "Qualifications", path: "/qualifications" },
    { label: "Training", path: "/training" },
    { label: "Transfers", path: "/transfers" },
    { label: "Retirement", path: "/retirement" },
    { label: "Early retirement", path: "/early-retirement" },
    { label: "Documents", path: "/documents" },
  ];

  const domainSpecific = workspace.kind === "secretariat"
    ? [
      { label: "Departments", path: "/organization" },
      { label: "Archdeaconries", path: "/organization/archdeaconries" },
      { label: "Parishes", path: "/organization/parishes" },
      { label: "Local churches", path: "/organization/local-churches" },
    ]
    : [
      { label: "Institutions", path: "/organization/institutions" },
      { label: "Departments", path: "/organization" },
      { label: "Positions", path: "/organization/positions" },
    ];

  if (["HEALTH", "ICT"].includes(workspace.code)) common.push({ label: workspace.code === "ICT" ? "Certifications" : "Professional licences", path: "/licences" });
  if (workspace.code === "LAND_FINANCE") common.push({ label: "Payroll & benefits", path: "/payroll" });

  const allLinks = [...common, ...domainSpecific];
  return allLinks.filter((link) => {
    if (["/organization/archdeaconries", "/organization/parishes", "/organization/local-churches"].includes(link.path)) {
      return roles.includes("SECRETARIAT_USER");
    }
    if (link.path === "/payroll") return roles.includes("LAND_FINANCE_BOARD_USER");
    return roles.includes(workspace.roleCode);
  });
}

export function workspacePath(path: string, slug: string) {
  return `${path}?workspace=${encodeURIComponent(slug)}`;
}

export function getWorkspaceFromPath(pathname: string, search: string) {
  const root = personnelWorkspaces.find((workspace) => pathname === `/${workspace.slug}`);
  if (root) return root;
  const requestedSlug = new URLSearchParams(search).get("workspace") ?? undefined;
  return getWorkspace(requestedSlug);
}

export function getWorkspaceDomain(workspace: PersonnelWorkspace, domains: PersonnelDomain[]) {
  return domains.find((domain) => domain.code === workspace.code);
}
