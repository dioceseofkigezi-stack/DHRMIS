export interface PersonnelWorkspace {
  slug: string;
  code: string;
  name: string;
  shortName: string;
  description: string;
  kind: "secretariat" | "board";
  boardCode?: string;
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
  },
  {
    slug: "mission",
    code: "MISSION",
    boardCode: "MISSION",
    name: "Mission Board",
    shortName: "Mission",
    description: "Mission personnel, programmes, recruitment and development.",
    kind: "board",
  },
  {
    slug: "education",
    code: "EDUCATION",
    boardCode: "EDUCATION",
    name: "Education Board",
    shortName: "Education",
    description: "Education personnel, institutions, qualifications and staffing needs.",
    kind: "board",
  },
  {
    slug: "health",
    code: "HEALTH",
    boardCode: "HEALTH",
    name: "Health Board",
    shortName: "Health",
    description: "Health personnel, facilities, professional licences and staffing levels.",
    kind: "board",
  },
  {
    slug: "land-finance",
    code: "LAND_FINANCE",
    boardCode: "LAND_FINANCE",
    name: "Land & Finance Board",
    shortName: "Land & Finance",
    description: "Board personnel, finance staffing, vacancies and workforce development.",
    kind: "board",
  },
  {
    slug: "planning-development",
    code: "PLANNING_DEVELOPMENT",
    boardCode: "PLANNING_DEVELOPMENT",
    name: "Planning & Development Board",
    shortName: "Planning & Development",
    description: "Project personnel, development programmes, staffing gaps and recruitment.",
    kind: "board",
  },
  {
    slug: "ict",
    code: "ICT",
    boardCode: "ICT",
    name: "ICT Board",
    shortName: "ICT",
    description: "ICT Board personnel, technical teams, recruitment and certifications.",
    kind: "board",
  },
];

const hrManagementRoles = new Set(["SuperAdministrator", "CentralHR", "BoardHR"]);

export function getWorkspace(slug: string | undefined) {
  return personnelWorkspaces.find((workspace) => workspace.slug === slug);
}

export function canAccessWorkspace(
  workspace: PersonnelWorkspace,
  roles: string[],
  domainCodes: string[],
) {
  if (!domainCodes.includes(workspace.code)) return false;
  if (roles.includes("SuperAdministrator")) return true;
  if (workspace.kind === "secretariat") {
    return roles.some((role) => ["CentralHR", "ArchdeaconryAdmin", "ParishAdmin"].includes(role));
  }
  if (roles.includes("BoardHR")) return true;
  if (roles.includes("InstitutionAdmin")) return true;
  if (workspace.code === "ICT" && roles.includes("ICTAdministrator")) return true;
  return workspace.code === "LAND_FINANCE" && roles.includes("FinanceOfficer");
}

export function canManageWorkspacePersonnel(workspace: PersonnelWorkspace, roles: string[]) {
  if (workspace.kind === "secretariat") return roles.some((role) => ["SuperAdministrator", "CentralHR"].includes(role));
  return roles.some((role) => hrManagementRoles.has(role));
}

export function getWorkspaceNavigation(workspace: PersonnelWorkspace, roles: string[]) {
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

  if (workspace.code === "HEALTH") common.push({ label: "Professional licences", path: "/licences" });
  if (workspace.code === "ICT") common.push({ label: "Security events", path: "/security" });
  if (workspace.code === "LAND_FINANCE" && roles.includes("FinanceOfficer")) common.push({ label: "Payroll & benefits", path: "/payroll" });
  if (roles.includes("SuperAdministrator")) {
    common.push(
      { label: "Personnel domains", path: "/organization/personnel-domains" },
      { label: "User access", path: "/admin/users" },
      { label: "User scopes", path: "/admin/scopes" },
    );
  }

  const allLinks = [...common, ...domainSpecific];
  return allLinks.filter((link) => link.path === "/security"
    ? roles.includes("ICTAdministrator") || roles.includes("SuperAdministrator") || roles.includes("SystemAdministrator")
    : link.path.startsWith("/admin/")
      ? roles.includes("SuperAdministrator")
      : link.path.startsWith("/organization/archdeaconries") || link.path.startsWith("/organization/parishes") || link.path.startsWith("/organization/local-churches")
      ? roles.some((role) => ["SuperAdministrator", "CentralHR", "ArchdeaconryAdmin", "ParishAdmin"].includes(role))
      : link.path === "/organization/institutions" || link.path === "/organization/positions" || link.path === "/organization"
        ? roles.some((role) => ["SuperAdministrator", "CentralHR", "BoardHR", "InstitutionAdmin"].includes(role))
        : link.path === "/recruitment" || link.path === "/applicants"
          ? roles.some((role) => ["SuperAdministrator", "CentralHR", "BoardHR"].includes(role))
          : link.path === "/transfers"
            ? roles.some((role) => ["SuperAdministrator", "CentralHR", "BoardHR"].includes(role))
            : roles.some((role) => ["SuperAdministrator", "CentralHR", "BoardHR", "ArchdeaconryAdmin", "ParishAdmin", "InstitutionAdmin", "FinanceOfficer", "Employee"].includes(role)));
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
