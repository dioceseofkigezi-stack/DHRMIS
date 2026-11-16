import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@/components/ui/Icon";
import { supabase } from "@/core/config";
import { auditService } from "@/core/audit/service";
import { canAccessModule } from "@/app/modules";
import { useAuth } from "@/modules/core/auth/context";

interface Employee {
  id: string;
  employee_id: string;
  employee_number: string;
  title: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: string;
  email: string;
  telephone: string | null;
  employee_category: string;
  life_status: string;
  employment_status: string;
  createdAt: string;
}

interface TabSpec { id: string; label: string; accessPath?: string }
interface DataSection { title: string; table: string; columns: string[]; category?: "FAMILY_INFO" | "CHILDREN_DATA" | "BANK_DETAILS" | "PENSION" | "CONFIDENTIAL_DOCUMENT" }
type DataRow = Record<string, unknown>;

const employeeColumns = "id,employee_id,employee_number,title,first_name,middle_name,last_name,gender,email,telephone,employee_category,life_status,employment_status,createdAt";
const tabs: TabSpec[] = [
  { id: "overview", label: "Overview" },
  { id: "employment", label: "Employment", accessPath: "/assignments" },
  { id: "development", label: "Development", accessPath: "/qualifications" },
  { id: "leave", label: "Leave", accessPath: "/leave" },
  { id: "family", label: "Family & next of kin", accessPath: "/family" },
  { id: "finance", label: "Finance & pension", accessPath: "/payroll" },
  { id: "documents", label: "Documents", accessPath: "/documents" },
  { id: "audit", label: "Audit history", accessPath: "/audit" },
];

const sectionsByTab: Record<string, DataSection[]> = {
  employment: [
    { title: "Assignments", table: "assignments", columns: ["assignment_type", "start_date", "end_date", "status", "reference_number", "is_primary"] },
    { title: "Appointments & promotions", table: "appointments", columns: ["previous_position", "new_position", "effective_date", "status", "reference_number"] },
    { title: "Additional offices", table: "employee_roles", columns: ["role", "role_type", "start_date", "end_date", "status"] },
  ],
  development: [
    { title: "Qualifications", table: "qualifications", columns: ["qualification", "course", "institution", "completion_date", "verification_status"] },
    { title: "Training", table: "training_records", columns: ["training_programme", "provider", "date", "renewal_due_date", "outcome"] },
    { title: "Professional licences", table: "professional_licences", columns: ["professional_body", "licence_number", "expiry_date", "status", "verification_status"] },
  ],
  leave: [{ title: "Leave history", table: "leave_records", columns: ["leave_type", "period", "start_date", "end_date", "balance_days", "status"] }],
  family: [
    { title: "Spouse", table: "spouses", columns: ["full_name", "telephone", "occupation", "marriage_status", "marriage_date"], category: "FAMILY_INFO" },
    { title: "Children", table: "children", columns: ["full_name", "date_of_birth", "gender", "school", "education_level", "is_depondant"], category: "CHILDREN_DATA" },
    { title: "Next of kin", table: "next_of_kin", columns: ["full_name", "relationship", "telephone", "priority", "verification_status"], category: "FAMILY_INFO" },
  ],
  finance: [
    { title: "Payroll", table: "payroll_records", columns: ["payroll_period", "basic_salary", "allowances", "deductions", "net_pay", "status"], category: "BANK_DETAILS" },
    { title: "Benefits", table: "benefits", columns: ["benefit_name", "benefit_type", "amount", "effective_date", "is_active"], category: "BANK_DETAILS" },
    { title: "Pension", table: "pension_schemes", columns: ["scheme_name", "membership_number", "pension_status", "employer_contribution", "employee_contribution"], category: "PENSION" },
    { title: "Retirement", table: "retirements", columns: ["retirement_type", "eligible_date", "effective_date", "status"], category: "PENSION" },
  ],
  documents: [{ title: "Documents", table: "documents", columns: ["original_file_name", "document_type", "access_level", "created_at", "expires_at"], category: "CONFIDENTIAL_DOCUMENT" }],
  audit: [{ title: "Audit history", table: "audit_log", columns: ["created_at", "action", "module", "result", "context"] }],
};

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function friendlyError() {
  return "This information could not be loaded. Your access is enforced by the database; contact your administrator if you believe you should have access.";
}

function DataSections({ sections, rows }: { sections: DataSection[]; rows: Record<string, DataRow[]> }) {
  return <div className="profile-sections">{sections.map((section) => {
    const records = rows[section.table] ?? [];
    return <section className="panel profile-data-panel" key={section.table}>
      <div className="profile-panel-heading"><h2>{section.title}</h2><span>{records.length} {records.length === 1 ? "record" : "records"}</span></div>
      {records.length ? <div className="table-scroll"><table><thead><tr>{section.columns.map((column) => <th key={column}>{column.replaceAll("_", " ")}</th>)}</tr></thead><tbody>{records.map((row, index) => <tr key={String(row.id ?? `${section.table}-${index}`)}>{section.columns.map((column) => <td key={column} title={displayValue(row[column])}>{displayValue(row[column])}</td>)}</tr>)}</tbody></table></div> : <p className="profile-empty">No {section.title.toLowerCase()} on record.</p>}
    </section>;
  })}</div>;
}

export default function EmployeeProfilePage({ employeeId }: { employeeId: string }) {
  const { roles, session } = useAuth();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [tab, setTab] = useState("overview");
  const [rows, setRows] = useState<Record<string, DataRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [error, setError] = useState("");
  const canViewEmployee = canAccessModule("/people", roles) || roles.includes("Employee");
  const visibleTabs = useMemo(() => tabs.filter((candidate) => !candidate.accessPath || canAccessModule(candidate.accessPath, roles)), [roles]);

  useEffect(() => {
    let active = true;
    async function loadEmployee() {
      if (!supabase || !canViewEmployee) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      const { data, error: queryError } = await supabase.from("employees").select(employeeColumns).eq("id", employeeId).maybeSingle();
      if (!active) return;
      if (queryError || !data) {
        setError(friendlyError());
        setEmployee(null);
      } else {
        setEmployee(data as Employee);
      }
      setLoading(false);
    }
    void loadEmployee();
    return () => { active = false; };
  }, [employeeId, canViewEmployee]);

  useEffect(() => {
    let active = true;
    async function loadTab() {
      if (!supabase || !employee || tab === "overview") {
        setRows({});
        return;
      }
      const sections = sectionsByTab[tab] ?? [];
      setTabLoading(true);
      setError("");
      try {
        const results = await Promise.all(sections.map(async (section) => {
          if (section.category && session?.user.id) {
            await auditService.logSensitiveRead({
              userId: session.user.id,
              employeeId: employee.id,
              recordType: section.table,
              dataCategory: section.category,
              purpose: `Viewed employee profile: ${section.title}`,
            });
          }
          const columns = ["id", ...section.columns].join(",");
          const { data, error: queryError } = await supabase!.from(section.table).select(columns).eq("employee_id", employee.id).limit(100);
          if (queryError) throw queryError;
          return [section.table, (data ?? []) as unknown as DataRow[]] as const;
        }));
        if (active) setRows(Object.fromEntries(results));
      } catch {
        if (active) {
          setRows({});
          setError(friendlyError());
        }
      } finally {
        if (active) setTabLoading(false);
      }
    }
    void loadTab();
    return () => { active = false; };
  }, [employee, tab, session?.user.id]);

  if (!canViewEmployee) return <div className="page-content"><div className="empty-state"><h2>Access restricted</h2><p>Your account cannot open employee profiles.</p></div></div>;
  if (loading) return <div className="page-content"><div className="table-state">Loading employee profile…</div></div>;
  if (!employee) return <div className="page-content"><div className="empty-state"><h2>Employee record unavailable</h2><p>{error || "This record was not found or is outside your authorized access."}</p><Link className="button button-secondary" to="/people"><Icon name="people" size={14} />Return to people directory</Link></div></div>;

  const fullName = [employee.title, employee.first_name, employee.middle_name, employee.last_name].filter(Boolean).join(" ");
  const sections = sectionsByTab[tab] ?? [];

  return (
    <div className="page-content">
      <nav className="profile-breadcrumb" aria-label="Breadcrumb"><Link to="/dashboard">Workspace</Link><span>/</span><Link to="/people">People directory</Link><span>/</span><span aria-current="page">{employee.employee_number}</span></nav>
      <header className="employee-profile-header">
        <div className="employee-profile-identity">
          <span className="employee-profile-avatar" aria-hidden="true">{employee.first_name.slice(0, 1)}{employee.last_name.slice(0, 1)}</span>
          <div><p className="eyebrow">{employee.employee_category} · {employee.employee_number}</p><h1><Icon name="people" size={22} />{fullName}</h1><p className="muted">{employee.employee_id} · {employee.email}</p></div>
        </div>
        <div className="profile-statuses"><span className="status-pill">{employee.employment_status}</span><span className="status-pill status-pill-neutral">{employee.life_status}</span></div>
      </header>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      <div className="profile-tabs" role="tablist" aria-label="Employee profile sections">
        {visibleTabs.map((candidate) => <button type="button" role="tab" aria-selected={tab === candidate.id} className={tab === candidate.id ? "profile-tab profile-tab-active" : "profile-tab"} key={candidate.id} onClick={() => setTab(candidate.id)}>{candidate.label}</button>)}
      </div>
      {tab === "overview" ? <section className="profile-overview-grid" aria-label="Employee overview">
        <article className="panel profile-summary-card"><p className="eyebrow">PERSONAL CONTACT</p><h2>Contact details</h2><dl><div><dt>Email</dt><dd>{employee.email}</dd></div><div><dt>Telephone</dt><dd>{employee.telephone || "Not recorded"}</dd></div><div><dt>Gender</dt><dd>{employee.gender}</dd></div></dl></article>
        <article className="panel profile-summary-card"><p className="eyebrow">EMPLOYMENT</p><h2>Current status</h2><dl><div><dt>Category</dt><dd>{employee.employee_category}</dd></div><div><dt>Employment</dt><dd>{employee.employment_status}</dd></div><div><dt>Life status</dt><dd>{employee.life_status}</dd></div><div><dt>Record created</dt><dd>{new Date(employee.createdAt).toLocaleDateString()}</dd></div></dl></article>
        {canAccessModule("/assignments", roles) && <article className="panel profile-summary-card profile-summary-wide"><p className="eyebrow">ASSIGNMENT HISTORY</p><h2>Appointments and placements</h2><p className="muted">View current and historical assignments without replacing earlier records.</p><button type="button" className="button button-secondary" onClick={() => setTab("employment")}><Icon name="assignment" size={14} />Open employment history</button></article>}
      </section> : tabLoading ? <div className="table-state">Loading {visibleTabs.find((item) => item.id === tab)?.label.toLowerCase()}…</div> : <DataSections sections={sections} rows={rows} />}
    </div>
  );
}
