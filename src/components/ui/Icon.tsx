import type { ReactNode } from "react";

export type SystemIcon =
  | "overview" | "people" | "clergy" | "assignment" | "transfer" | "leave"
  | "learning" | "training" | "award" | "chart" | "briefcase" | "role"
  | "delegation" | "recruitment" | "applicant" | "application" | "finance"
  | "benefit" | "pension" | "retirement" | "governance" | "security" | "death"
  | "community" | "home" | "succession" | "document" | "building" | "map"
  | "church" | "board" | "layers" | "school" | "monitor" | "medical" | "compass"
  | "settings" | "target" | "folder" | "menu" | "search" | "bell" | "close"
  | "arrowRight" | "plus" | "shield" | "signOut" | "wifi" | "offline"
  | "refresh" | "download" | "edit" | "trash" | "export" | "upload"
  | "check" | "arrowLeft" | "sortUp" | "sortDown"
  | "sun" | "moon" | "monitor";

const shapes: Record<SystemIcon, ReactNode> = {
  overview: <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="5" rx="1.5" /><rect x="13" y="10" width="8" height="11" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /></>,
  people: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  clergy: <><path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-7h6v7M12 4V2M10 6h4" /></>,
  assignment: <><path d="M9 5H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="m8 13 2 2 5-5M8 18h8" /></>,
  transfer: <><path d="M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3" /></>,
  leave: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18M8 15h3" /></>,
  learning: <><path d="m2 10 10-5 10 5-10 5-10-5Z" /><path d="M6 12v5c3.5 3 8.5 3 12 0v-5M22 10v6" /></>,
  training: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /><path d="m9 10 2 2 4-4" /></>,
  award: <><circle cx="12" cy="8" r="6" /><path d="m8.2 13-1.3 8 5.1-3 5.1 3-1.3-8" /></>,
  chart: <><path d="M3 3v18h18M18 17V9M13 17V5M8 17v-3" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" /></>,
  role: <><rect x="3" y="5" width="18" height="15" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M6 16c.7-2 5.3-2 6 0M14 10h4M14 14h4M8 5V3h8v2" /></>,
  delegation: <><circle cx="6" cy="6" r="3" /><circle cx="18" cy="18" r="3" /><path d="M8.5 8.5 15.5 15.5M14 5h5v5M19 5l-6 6" /></>,
  recruitment: <><path d="m3 11 18-5-5 18-4-8-9-5Z" /><path d="m12 16 5-6" /></>,
  applicant: <><circle cx="9" cy="8" r="4" /><path d="M3 21v-2a6 6 0 0 1 12 0v2M19 8v6M22 11h-6" /></>,
  application: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6m-11 5 2 2 4-4" /></>,
  finance: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h3M17 3v4" /></>,
  benefit: <><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" /><path d="M7 12h3l2-3 2 6 2-3h2" /></>,
  pension: <><path d="M3 10h18M5 10V7l7-4 7 4v3M5 20v-7m5 7v-7m4 7v-7m5 7v-7M3 20h18M2 22h20" /></>,
  retirement: <><path d="M3 18h18M5 18a7 7 0 0 1 14 0M12 4v2m-7 1 1.5 1.5M19 7l-1.5 1.5M12 11l3 3" /></>,
  governance: <><path d="m12 3 9 4v5c0 5-3.8 8-9 10-5.2-2-9-5-9-10V7l9-4Z" /><path d="m8 12 2.5 2.5L16 9" /></>,
  security: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 1 1 8 0v3m-4 4v3" /></>,
  death: <><path d="M12 21V9m0 4c-4 0-7-2-7-6 4 0 7 2 7 6Zm0-3c0-4 3-7 7-7 0 4-3 7-7 7Zm-7 8c2-2 4-3 7-3s5 1 7 3" /></>,
  community: <><path d="M16 11c1.7 0 3 1.3 3 3v1h2v-1a5 5 0 0 0-8.5-3.5M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21v-3a6 6 0 0 1 12 0v3H2Z" /></>,
  home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-6v-7h-4v7H4a1 1 0 0 1-1-1V10Z" /></>,
  succession: <><circle cx="6" cy="5" r="2" /><circle cx="18" cy="5" r="2" /><circle cx="12" cy="19" r="2" /><path d="M6 7v4a4 4 0 0 0 4 4h2m6-8v4a4 4 0 0 1-4 4h-2" /></>,
  document: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h8" /></>,
  building: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 21V9h6v12M7 7h2m6 0h2M7 12h2m6 0h2M7 16h2m6 0h2" /></>,
  map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" /><path d="M9 3v15m6-12v15" /></>,
  church: <><path d="M3 21h18M5 21V11l7-4 7 4v10M9 21v-5h6v5M12 7V2m-2 3h4" /></>,
  board: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 9v12M13 13h4m-4 4h4" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
  school: <><path d="m2 9 10-5 10 5-10 5L2 9Z" /><path d="M6 11v5c3.5 3 8.5 3 12 0v-5M22 9v6" /></>,
  monitor: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4M7 9h4m-4 4h2" /></>,
  medical: <><path d="M10 3H6a2 2 0 0 0-2 2v4h6V3Zm4 0h4a2 2 0 0 1 2 2v4h-6V3ZM4 13h6v8H6a2 2 0 0 1-2-2v-6Zm10 0h6v6a2 2 0 0 1-2 2h-4v-8Z" /><path d="M12 10v4m-2-2h4" /></>,
  compass: <><circle cx="12" cy="12" r="10" /><path d="m16.2 7.8-2.7 5.7-5.7 2.7 2.7-5.7 5.7-2.7Z" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.7-1.4-2.4 1.4-1.1a8 8 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.7 1.4 2.4-1.4 1.1a8 8 0 0 1 0 1.9Z" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  folder: <><path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
  close: <><path d="m18 6-12 12M6 6l12 12" /></>,
  arrowRight: <><path d="M5 12h14m-7-7 7 7-7 7" /></>,
  plus: <><path d="M12 5v14m-7-7h14" /></>,
  shield: <><path d="m12 3 9 4v5c0 5-3.8 8-9 10-5.2-2-9-5-9-10V7l9-4Z" /><path d="m9 12 2 2 4-4" /></>,
  signOut: <><path d="M10 17l5-5-5-5m5 5H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
  wifi: <><path d="M5 12.5a11 11 0 0 1 14 0M8.5 16a5.5 5.5 0 0 1 7 0M12 20h.01" /></>,
  offline: <><path d="M3 3l18 18M5 12.5a11 11 0 0 1 5-2.3m4 0a11 11 0 0 1 5 2.3M8.5 16a5.5 5.5 0 0 1 2-1.1m3 0a5.5 5.5 0 0 1 2 1.1M12 20h.01" /></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5m-5 5V3" /></>,
  edit: <><path d="m16 4 4 4M4 20l4-.8L19 8a2.8 2.8 0 0 0-4-4L4 15l-.8 5Z" /></>,
  trash: <><path d="M3 6h18m-2 0-.9 14H5.9L5 6m4 0V4h6v2m-5 4v6m4-6v6" /></>,
  export: <><path d="M12 15V3m-5 5 5-5 5 5M5 13v7h14v-7" /></>,
  upload: <><path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4" /></>,
  check: <><path d="m5 12 4 4L19 6" /></>,
  arrowLeft: <><path d="M19 12H5m7 7-7-7 7-7" /></>,
  sortUp: <><path d="m6 14 6-6 6 6" /></>,
  sortDown: <><path d="m6 10 6 6 6-6" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
  moon: <><path d="M20.9 13A8.9 8.9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" /></>,
};

export const pathIcons: Record<string, SystemIcon> = {
  "/dashboard": "overview",
  "/people": "people", "/clergy": "clergy", "/catechists": "learning",
  "/assignments": "assignment", "/transfers": "transfer", "/leave": "leave",
  "/qualifications": "learning", "/training": "training", "/licences": "award",
  "/performance": "chart", "/appointments": "briefcase", "/roles": "role",
  "/acting-appointments": "role", "/delegations": "delegation", "/recruitment": "recruitment",
  "/applicants": "applicant", "/recruitment/applications": "application",
  "/payroll": "finance", "/benefits": "benefit", "/pension": "pension",
  "/pension/contributions": "finance", "/retirement": "retirement", "/early-retirement": "retirement",
  "/discipline": "governance", "/safeguarding": "security", "/death": "death",
  "/welfare": "community", "/housing": "home", "/succession": "succession",
  "/documents": "document", "/family": "people", "/organization": "building",
  "/organization/archdeaconries": "map",
  "/organization/parishes": "church", "/organization/local-churches": "church",
  "/organization/boards": "board", "/organization/personnel-domains": "layers",
  "/organization/institutions": "school", "/organization/positions": "briefcase",
  "/organization/grades": "chart", "/audit": "assignment", "/security": "security",
  "/settings": "settings", "/admin/users": "people", "/admin/scopes": "target",
  "/admin/roles": "role", "/admin/reports": "chart", "/admin/sessions": "shield",
  "/admin/monitoring": "monitor",
};

const workspaceIcons: Record<string, SystemIcon> = {
  SECRETARIAT: "building",
  MISSION: "compass",
  EDUCATION: "school",
  HEALTH: "medical",
  LAND_FINANCE: "finance",
  PLANNING_DEVELOPMENT: "chart",
  ICT: "monitor",
};

export function getPathIcon(path: string): SystemIcon {
  return pathIcons[path] ?? "folder";
}

export function getWorkspaceIcon(code: string): SystemIcon {
  return workspaceIcons[code] ?? "building";
}

export function getMetricIcon(table: string): SystemIcon {
  const metricIcons: Record<string, SystemIcon> = {
    employees: "people", vacancies: "recruitment", applicants: "applicant",
    leave_records: "leave", institutions: "school", professional_licences: "award",
    security_event: "security", archdeaconries: "map", parishes: "church", local_churches: "church",
  };
  return metricIcons[table] ?? "chart";
}

export function Icon({ name, size = 18, className }: { name: SystemIcon; size?: number; className?: string }) {
  return (
    <svg
      className={className ? `system-icon ${className}` : "system-icon"}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {shapes[name]}
    </svg>
  );
}
