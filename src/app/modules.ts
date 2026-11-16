export type FieldKind = "text" | "email" | "number" | "date" | "textarea" | "json" | "select" | "checkbox" | "employee";

export interface FieldConfig {
  name: string;
  label: string;
  kind?: FieldKind;
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

export interface ModuleConfig {
  path: string;
  label: string;
  group: string;
  description: string;
  table?: string;
  titleField?: string;
  searchColumn?: string;
  columns?: string[];
  fields?: FieldConfig[];
  defaultValues?: Record<string, unknown>;
  filter?: { column: string; value: string };
  readOnly?: boolean;
  singleRecord?: boolean;
  allowDelete?: boolean;
  readAuditCategory?: string;
}

const employeeFields: FieldConfig[] = [
  { name: "employee_id", label: "Employee ID", required: true },
  { name: "employee_number", label: "Employee number", required: true },
  { name: "title", label: "Title", required: true, kind: "select", options: ["Mr", "Mrs", "Ms", "Dr", "Rev", "Rev Can.", "Eng", "Ven", "Rt Rev.", "Father", "Deacon", "Other"] },
  { name: "first_name", label: "First name", required: true },
  { name: "middle_name", label: "Middle name" },
  { name: "last_name", label: "Last name", required: true },
  { name: "gender", label: "Gender", required: true, kind: "select", options: ["Male", "Female"] },
  { name: "email", label: "Email", required: true, kind: "email" },
  { name: "telephone", label: "Telephone" },
  { name: "employee_category", label: "Category", required: true, kind: "select", options: ["Clergy", "Catechist", "LayStaff", "InstitutionalStaff", "Contract", "Volunteer"] },
];

export const modulePages: ModuleConfig[] = [
  { path: "/people", label: "People directory", group: "People", description: "Search and manage employee records visible in your personnel scope.", table: "employees", titleField: "first_name", columns: ["employee_number", "first_name", "last_name", "employee_category", "email", "employment_status"], fields: employeeFields },
  { path: "/clergy", label: "Clergy", group: "People", description: "Clergy records in the diocesan employee register.", table: "employees", titleField: "first_name", columns: ["employee_number", "first_name", "last_name", "email", "employment_status"], fields: employeeFields.filter((field) => field.name !== "employee_category"), defaultValues: { employee_category: "Clergy" }, filter: { column: "employee_category", value: "Clergy" } },
  { path: "/catechists", label: "Catechists", group: "People", description: "Catechist records in the diocesan employee register.", table: "employees", titleField: "first_name", columns: ["employee_number", "first_name", "last_name", "email", "employment_status"], fields: employeeFields.filter((field) => field.name !== "employee_category"), defaultValues: { employee_category: "Catechist" }, filter: { column: "employee_category", value: "Catechist" } },
  { path: "/assignments", label: "Assignments", group: "People", description: "Manage effective-dated placements in this personnel domain.", table: "assignments", titleField: "assignment_type", columns: ["employee_id", "personnel_domain_id", "department_id", "institution_id", "position_id", "assignment_type", "start_date", "end_date", "status"], defaultValues: { is_primary: true }, fields: [
    { name: "employee_id", label: "Employee", kind: "employee", required: true },
    { name: "department_id", label: "Department ID" }, { name: "institution_id", label: "Institution ID" },
    { name: "archdeaconry_id", label: "Archdeaconry ID" }, { name: "parish_id", label: "Parish ID" },
    { name: "local_church_id", label: "Local church ID" }, { name: "position_id", label: "Position ID" },
    { name: "grade_id", label: "Grade ID" }, { name: "supervisor_id", label: "Supervisor employee ID" },
    { name: "assignment_type", label: "Assignment type", kind: "select", options: ["Permanent", "Temporary", "Acting", "Probation", "Contract"], required: true },
    { name: "start_date", label: "Start date", kind: "date", required: true },
    { name: "end_date", label: "End date", kind: "date" },
    { name: "status", label: "Status", kind: "select", options: ["Active", "OnLeave", "Suspended", "Completed", "Terminated"] },
    { name: "authority", label: "Authority" }, { name: "reference_number", label: "Reference number" },
    { name: "supporting_document_id", label: "Supporting document ID" },
    { name: "is_primary", label: "Primary assignment", kind: "checkbox" }, { name: "is_additional", label: "Additional assignment", kind: "checkbox" },
  ] },
  { path: "/transfers", label: "Employee transfers", group: "People", description: "Request and approve inter-domain transfers while retaining both assignment records.", table: "employee_transfers", titleField: "reason", columns: ["employee_id", "previous_domain_id", "new_domain_id", "effective_date", "status", "reference_number"], fields: [
    { name: "previous_assignment_id", label: "Previous assignment ID", required: true },
    { name: "new_domain_id", label: "Receiving personnel domain ID", required: true, placeholder: "Copy the ID from Personnel domains" },
    { name: "effective_date", label: "Effective date", kind: "date", required: true },
    { name: "reason", label: "Reason", kind: "textarea", required: true },
    { name: "authority", label: "Authority" }, { name: "reference_number", label: "Reference number" },
    { name: "assignment_type", label: "New assignment type", kind: "select", options: ["Permanent", "Temporary", "Acting", "Probation", "Contract"] },
    { name: "department_id", label: "New department ID" }, { name: "institution_id", label: "New institution ID" },
    { name: "position_id", label: "New position ID" }, { name: "grade_id", label: "New grade ID" },
    { name: "supervisor_id", label: "New supervisor employee ID" },
  ] },
  { path: "/leave", label: "Leave management", group: "People", description: "Review leave requests, balances and decisions.", table: "leave_records", titleField: "leave_type", columns: ["employee_id", "leave_type", "start_date", "end_date", "balance_days", "status"], fields: [
    { name: "employee_id", label: "Employee", kind: "employee", required: true },
    { name: "leave_type", label: "Leave type", kind: "select", options: ["Annual", "Sick", "Maternity", "Paternity", "Compassionate", "Study", "Sabbatical", "Other"], required: true },
    { name: "period", label: "Leave period", placeholder: "e.g. 2026" },
    { name: "entitlement_days", label: "Entitled days", kind: "number" },
    { name: "taken_days", label: "Days taken", kind: "number" },
    { name: "balance_days", label: "Balance days", kind: "number" },
    { name: "start_date", label: "Start date", kind: "date" },
    { name: "end_date", label: "End date", kind: "date" },
    { name: "status", label: "Status", kind: "select", options: ["Requested", "Approved", "Rejected", "Cancelled", "Pending"] },
    { name: "reason", label: "Reason", kind: "textarea" },
  ] },
  { path: "/qualifications", label: "Qualifications", group: "Development", description: "Record and verify academic and professional qualifications.", table: "qualifications", titleField: "qualification", columns: ["employee_id", "qualification", "course", "institution", "completion_date", "verification_status"], fields: [
    { name: "employee_id", label: "Employee", kind: "employee", required: true }, { name: "qualification", label: "Qualification", required: true },
    { name: "course", label: "Course", required: true }, { name: "institution", label: "Institution", required: true },
    { name: "location", label: "Location" }, { name: "start_date", label: "Start date", kind: "date", required: true },
    { name: "completion_date", label: "Completion date", kind: "date" }, { name: "award", label: "Award" },
    { name: "verification_status", label: "Verification", kind: "select", options: ["Pending", "Verified", "NotVerified", "Expired"] },
  ] },
  { path: "/training", label: "Training", group: "Development", description: "Track staff development, course completion and renewals.", table: "training_records", titleField: "training_programme", columns: ["employee_id", "training_programme", "provider", "date", "renewal_due_date"], fields: [
    { name: "employee_id", label: "Employee", kind: "employee", required: true }, { name: "training_programme", label: "Programme", required: true },
    { name: "provider", label: "Provider", required: true }, { name: "course", label: "Course" },
    { name: "date", label: "Training date", kind: "date", required: true }, { name: "duration", label: "Duration" },
    { name: "certificate", label: "Certificate" }, { name: "renewal_due_date", label: "Renewal due", kind: "date" },
  ] },
  { path: "/licences", label: "Professional licences", group: "Development", description: "Monitor professional registrations and renewal dates.", table: "professional_licences", titleField: "professional_body", columns: ["employee_id", "professional_body", "licence_number", "expiry_date", "status"], fields: [
    { name: "employee_id", label: "Employee", kind: "employee", required: true }, { name: "professional_body", label: "Professional body", required: true },
    { name: "registration_number", label: "Registration number", required: true }, { name: "licence_number", label: "Licence number", required: true },
    { name: "issue_date", label: "Issue date", kind: "date", required: true }, { name: "expiry_date", label: "Expiry date", kind: "date", required: true },
    { name: "renewal_due_date", label: "Renewal due", kind: "date", required: true },
    { name: "status", label: "Status", kind: "select", options: ["Active", "Expired", "PendingRenewal", "Suspended", "Revoked"] },
  ] },
  { path: "/performance", label: "Performance", group: "Development", description: "Manage appraisal cycles, assessments and recommendations.", table: "performance_appraisals", titleField: "appraisal_period", columns: ["employee_id", "appraisal_period", "status", "effective_date"], fields: [
    { name: "employee_id", label: "Employee", kind: "employee", required: true }, { name: "appraisal_period", label: "Appraisal period", required: true },
    { name: "supervisor_assessment", label: "Supervisor assessment", kind: "textarea" }, { name: "employee_comments", label: "Employee comments", kind: "textarea" },
    { name: "recommendations", label: "Recommendations", kind: "textarea" },
    { name: "status", label: "Status", kind: "select", options: ["Draft", "InProgress", "Submitted", "Approved", "Rejected", "Completed"] },
    { name: "effective_date", label: "Effective date", kind: "date" },
  ] },
  { path: "/appointments", label: "Appointments & promotions", group: "Development", description: "Record appointments, promotions and effective dates.", table: "appointments", titleField: "new_position", columns: ["employee_id", "previous_position", "new_position", "effective_date", "status"], fields: [
    { name: "employee_id", label: "Employee", kind: "employee", required: true }, { name: "previous_position", label: "Previous position" },
    { name: "new_position", label: "New position", required: true }, { name: "effective_date", label: "Effective date", kind: "date", required: true },
    { name: "authority", label: "Appointing authority", required: true }, { name: "reference_number", label: "Reference number" },
    { name: "status", label: "Status", kind: "select", options: ["Pending", "Approved", "Rejected", "Completed"] },
  ] },
  { path: "/roles", label: "Employee roles", group: "People", description: "Manage formal staff roles, committees and diocesan offices.", table: "employee_roles", titleField: "role", columns: ["employee_id", "role", "role_type", "start_date", "status"], fields: [
    { name: "employee_id", label: "Employee", kind: "employee", required: true }, { name: "role", label: "Role", required: true },
    { name: "role_type", label: "Role type", kind: "select", options: ["Position", "Office", "Role", "Coordinator", "Chaplaincy", "Committee", "WorkingGroup", "BoardMember"], required: true },
    { name: "start_date", label: "Start date", kind: "date", required: true }, { name: "end_date", label: "End date", kind: "date" },
    { name: "authority", label: "Authority" }, { name: "reference_number", label: "Reference number" },
    { name: "status", label: "Status", kind: "select", options: ["Active", "Completed", "Terminated"] },
  ] },
  { path: "/acting-appointments", label: "Acting appointments", group: "People", description: "Track temporary acting roles and their authorization.", table: "acting_appointments", titleField: "authority", columns: ["employee_id", "start_date", "end_date", "authority", "is_active"], fields: [
    { name: "employee_id", label: "Acting employee", kind: "employee" }, { name: "acting_for_employee_id", label: "Employee being covered", kind: "employee" },
    { name: "acting_for_position_id", label: "Position ID" }, { name: "start_date", label: "Start date", kind: "date", required: true },
    { name: "end_date", label: "End date", kind: "date", required: true }, { name: "authority", label: "Authority", required: true },
    { name: "reference_number", label: "Reference number" }, { name: "is_active", label: "Active", kind: "checkbox" },
  ] },
  { path: "/delegations", label: "Delegations", group: "Administration", description: "Manage temporary delegated permissions and scope.", table: "delegations", titleField: "permission", columns: ["delegator_id", "delegate_id", "permission", "start_date", "end_date", "is_expired"], fields: [
    { name: "delegator_id", label: "Delegator employee ID", required: true }, { name: "delegate_id", label: "Delegate employee ID", required: true },
    { name: "permission", label: "Permission", required: true }, { name: "scope", label: "Scope", required: true },
    { name: "start_date", label: "Start date", kind: "date", required: true }, { name: "end_date", label: "End date", kind: "date", required: true },
    { name: "reason", label: "Reason", kind: "textarea" },
  ] },
  { path: "/recruitment", label: "Vacancies", group: "Operations", description: "Create vacancies and monitor recruitment activity.", table: "vacancies", titleField: "position", columns: ["vacancy_code", "position", "position_type", "vacancies", "status", "expiry_date"], fields: [
    { name: "vacancy_code", label: "Vacancy code", required: true }, { name: "position", label: "Position", required: true },
    { name: "department_id", label: "Department ID" }, { name: "institution_id", label: "Institution ID" },
    { name: "grade_id", label: "Grade ID" },
    { name: "position_type", label: "Position type", kind: "select", options: ["Permanent", "Temporary", "Contract", "Acting"] },
    { name: "location", label: "Location" }, { name: "vacancies", label: "Number of vacancies", kind: "number" },
    { name: "salary_range", label: "Salary range" }, { name: "requirements", label: "Requirements", kind: "textarea" },
    { name: "status", label: "Status", kind: "select", options: ["Open", "Closed", "Filled", "OnHold", "Draft"] },
    { name: "expiry_date", label: "Closing date", kind: "date" },
  ] },
  { path: "/applicants", label: "Applicants", group: "Operations", description: "Review applicant records and recruitment stages for your vacancies.", table: "applicants", titleField: "full_name", columns: ["full_name", "email", "telephone", "highest_qualification", "status"], fields: [
    { name: "vacancy_id", label: "Vacancy ID", required: true },
    { name: "full_name", label: "Full name", required: true }, { name: "email", label: "Email", kind: "email", required: true },
    { name: "gender", label: "Gender", kind: "select", options: ["Male", "Female"], required: true },
    { name: "telephone", label: "Telephone" }, { name: "address", label: "Address", kind: "textarea" },
    { name: "highest_qualification", label: "Highest qualification" }, { name: "work_experience", label: "Work experience", kind: "textarea" },
    { name: "status", label: "Status", kind: "select", options: ["Applied", "Screening", "Interview", "Selected", "Rejected", "Hired", "Withdrawn"] },
  ] },
  { path: "/recruitment/applications", label: "Applications", group: "Operations", description: "Track applications through screening, interview and selection.", table: "recruitment_applications", titleField: "stage", columns: ["applicant_id", "vacancy_id", "application_date", "stage", "status"], allowDelete: true, fields: [
    { name: "applicant_id", label: "Applicant record ID", required: true }, { name: "vacancy_id", label: "Vacancy record ID", required: true },
    { name: "application_date", label: "Application date", kind: "date", required: true },
    { name: "stage", label: "Stage", kind: "select", options: ["Applied", "Screening", "Interview", "Selected", "Hired"] },
    { name: "screening_notes", label: "Screening notes", kind: "textarea" }, { name: "interview_notes", label: "Interview notes", kind: "textarea" },
    { name: "selection_notes", label: "Selection notes", kind: "textarea" },
    { name: "status", label: "Status", kind: "select", options: ["InProgress", "Approved", "Rejected", "Hired"] },
  ] },
  { path: "/payroll", label: "Payroll & benefits", group: "Finance", description: "Manage payroll periods, payment records and benefits.", table: "payroll_records", titleField: "payroll_period", columns: ["employee_id", "payroll_period", "basic_salary", "net_pay", "payment_method", "status"], readAuditCategory: "BANK_DETAILS", fields: [
    { name: "employee_id", label: "Employee", kind: "employee", required: true }, { name: "payroll_period", label: "Payroll period", required: true },
    { name: "basic_salary", label: "Basic salary", kind: "number" }, { name: "allowances", label: "Allowances", kind: "number" },
    { name: "benefits", label: "Benefits", kind: "number" }, { name: "deductions", label: "Deductions", kind: "number" },
    { name: "net_pay", label: "Net pay", kind: "number" },
    { name: "payment_method", label: "Payment method", kind: "select", options: ["BankTransfer", "Checks", "Cash"] },
    { name: "status", label: "Status", kind: "select", options: ["Pending", "Processed", "Failed", "Cancelled"] },
  ] },
  { path: "/benefits", label: "Employee benefits", group: "Finance", description: "Manage allowances and other employee benefits.", table: "benefits", titleField: "benefit_name", columns: ["employee_id", "benefit_name", "benefit_type", "amount", "effective_date", "is_active"], defaultValues: { is_active: true }, fields: [
    { name: "employee_id", label: "Employee", kind: "employee", required: true }, { name: "benefit_name", label: "Benefit", required: true },
    { name: "benefit_type", label: "Benefit type", kind: "select", options: ["Salary", "Allowance", "Other"] },
    { name: "amount", label: "Amount", kind: "number" }, { name: "effective_date", label: "Effective date", kind: "date", required: true },
    { name: "expiry_date", label: "Expiry date", kind: "date" }, { name: "remarks", label: "Remarks", kind: "textarea" },
    { name: "is_active", label: "Active", kind: "checkbox" },
  ] },
  { path: "/pension", label: "Pension", group: "Finance", description: "Track pension scheme membership and contributions.", table: "pension_schemes", titleField: "scheme_name", columns: ["employee_id", "scheme_name", "membership_number", "employer_contribution", "employee_contribution", "pension_status"], readAuditCategory: "PENSION", fields: [
    { name: "employee_id", label: "Employee", kind: "employee", required: true }, { name: "scheme_name", label: "Scheme", required: true },
    { name: "membership_number", label: "Membership number" }, { name: "employer_contribution", label: "Employer contribution", kind: "number" },
    { name: "employee_contribution", label: "Employee contribution", kind: "number" },
    { name: "retirement_eligibility_date", label: "Eligibility date", kind: "date" },
    { name: "pension_status", label: "Status", kind: "select", options: ["Active", "Retired", "Suspended", "Lapsed"] },
  ] },
  { path: "/pension/contributions", label: "Pension contributions", group: "Finance", description: "Record employer and employee pension contributions by period.", table: "pension_contributions", titleField: "period", columns: ["employee_id", "period", "employer_contribution", "employee_contribution", "total_contribution", "is_paid"], fields: [
    { name: "employee_id", label: "Employee", kind: "employee", required: true }, { name: "period", label: "Contribution period", required: true },
    { name: "employer_contribution", label: "Employer contribution", kind: "number" },
    { name: "employee_contribution", label: "Employee contribution", kind: "number" },
    { name: "total_contribution", label: "Total contribution", kind: "number" },
    { name: "payment_date", label: "Payment date", kind: "date" }, { name: "is_paid", label: "Paid", kind: "checkbox" },
  ] },
  { path: "/retirement", label: "Retirement", group: "Finance", description: "Manage retirement eligibility, applications and decisions.", table: "retirements", titleField: "retirement_type", columns: ["employee_id", "retirement_type", "eligible_date", "effective_date", "status"], readAuditCategory: "PENSION", fields: [
    { name: "employee_id", label: "Employee", kind: "employee", required: true },
    { name: "retirement_type", label: "Retirement type", kind: "select", options: ["Normal", "Early", "Compassionate", "ForceRetirement"], required: true },
    { name: "eligible_date", label: "Eligible date", kind: "date", required: true },
    { name: "applied_date", label: "Applied date", kind: "date" }, { name: "effective_date", label: "Effective date", kind: "date" },
    { name: "status", label: "Status", kind: "select", options: ["Pending", "Approved", "Rejected", "Completed", "Processing"] },
    { name: "remarks", label: "Remarks", kind: "textarea" },
  ] },
  { path: "/early-retirement", label: "Early retirement", group: "Finance", description: "Review early retirement applications and decisions.", table: "early_retirement_applications", titleField: "status", columns: ["employee_id", "application_date", "eligible_years_left", "status", "requested_effective_date"], readAuditCategory: "PENSION", fields: [
    { name: "employee_id", label: "Employee", kind: "employee", required: true }, { name: "application_date", label: "Application date", kind: "date", required: true },
    { name: "reason", label: "Reason", kind: "textarea" }, { name: "eligible_years_left", label: "Years remaining", kind: "number" },
    { name: "status", label: "Status", kind: "select", options: ["Submitted", "UnderReview", "Recommended", "Approved", "Rejected", "Completed"] },
    { name: "review_comments", label: "Review comments", kind: "textarea" },
    { name: "requested_effective_date", label: "Requested effective date", kind: "date" },
  ] },
  { path: "/discipline", label: "Discipline", group: "Governance", description: "Manage disciplinary cases and their review status.", table: "disciplinary_cases", titleField: "case_number", columns: ["case_number", "employee_id", "nature_of_issue", "date_opened", "status"], readAuditCategory: "DISCIPLINE", fields: [
    { name: "case_number", label: "Case number", required: true }, { name: "employee_id", label: "Employee", kind: "employee", required: true },
    { name: "nature_of_issue", label: "Nature of issue", required: true }, { name: "date_opened", label: "Date opened", kind: "date", required: true },
    { name: "investigation_details", label: "Investigation details", kind: "textarea" },
    { name: "decision", label: "Decision", kind: "textarea" }, { name: "sanction", label: "Sanction" },
    { name: "status", label: "Status", kind: "select", options: ["Open", "UnderInvestigation", "HearingScheduled", "DecisionMade", "Appealed", "Closed", "Reopened"] },
  ] },
  { path: "/safeguarding", label: "Safeguarding", group: "Governance", description: "Restricted case management. Database policies determine your access.", table: "safeguarding_cases", titleField: "case_number", columns: ["case_number", "allegation_type", "date_reported", "risk_classification", "status"], readAuditCategory: "SAFEGUARDING", fields: [
    { name: "case_number", label: "Case number", required: true },
    { name: "allegation_type", label: "Allegation type", kind: "select", options: ["ChildProtection", "Abuse", "SexualMisconduct", "Exploitation", "Neglect", "Harassment", "Other"], required: true },
    { name: "date_reported", label: "Date reported", kind: "date", required: true },
    { name: "risk_classification", label: "Risk", kind: "select", options: ["Low", "Medium", "High", "Critical"] },
    { name: "immediate_action", label: "Immediate action", kind: "textarea" },
    { name: "status", label: "Status", kind: "select", options: ["Open", "UnderInvestigation", "Referred", "DecisionMade", "OutcomeReached", "Reviewed", "Closed", "Reopened"] },
  ] },
  { path: "/death", label: "Death records", group: "Governance", description: "Record and verify employee death notifications.", table: "employee_death_records", titleField: "verification_status", columns: ["employee_id", "reported_death_date", "confirmed_death_date", "verification_status", "reversal_status"], readAuditCategory: "CAUSE_OF_DEATH", readOnly: true },
  { path: "/welfare", label: "Welfare", group: "Community", description: "Manage welfare membership, assistance and claims.", table: "welfare_records", titleField: "membership_type", columns: ["employee_id", "membership_type", "contributions", "status"], fields: [
    { name: "employee_id", label: "Employee", kind: "employee", required: true }, { name: "membership_type", label: "Membership type", required: true },
    { name: "contributions", label: "Contributions", kind: "number" }, { name: "benefits", label: "Benefits", kind: "textarea" },
    { name: "claims", label: "Claims", kind: "textarea" }, { name: "assistance", label: "Assistance", kind: "textarea" },
    { name: "status", label: "Status", kind: "select", options: ["Active", "Inactive", "Pending", "Approved", "Disbursed", "Cancelled"] },
  ] },
  { path: "/housing", label: "Housing & property", group: "Community", description: "Track property allocations and employee occupancy.", table: "property_assignments", titleField: "property_reference", columns: ["employee_id", "property_reference", "property_type", "allocation_date", "status"], fields: [
    { name: "employee_id", label: "Employee", kind: "employee", required: true }, { name: "property_reference", label: "Property reference", required: true },
    { name: "property_type", label: "Property type", kind: "select", options: ["House", "Residence", "Land", "Other"], required: true },
    { name: "allocation_date", label: "Allocation date", kind: "date" }, { name: "occupancy_date", label: "Occupancy date", kind: "date" },
    { name: "condition", label: "Condition" }, { name: "status", label: "Status", kind: "select", options: ["Allocated", "Occupied", "Vacated", "UnderMaintenance", "Reserved"] },
  ] },
  { path: "/succession", label: "Succession planning", group: "Community", description: "Identify critical positions, potential successors and staffing gaps.", table: "succession_records", titleField: "position_title", columns: ["position_title", "employee_id", "current_status", "estimated_retirement_date", "critical", "recruitment_required"], fields: [
    { name: "employee_id", label: "Current employee", kind: "employee", required: true }, { name: "position_title", label: "Position", required: true },
    { name: "current_status", label: "Current status", kind: "select", options: ["Active", "Retiring", "Retired", "Resigning", "Terminated"] },
    { name: "estimated_retirement_date", label: "Estimated retirement", kind: "date" },
    { name: "potential_successors", label: "Potential successors", kind: "textarea" }, { name: "qualification_requirements", label: "Qualification requirements", kind: "textarea" },
    { name: "staffing_gaps", label: "Staffing gaps", kind: "textarea" }, { name: "critical", label: "Critical position", kind: "checkbox" },
    { name: "recruitment_required", label: "Recruitment required", kind: "checkbox" },
  ] },
  { path: "/documents", label: "Documents & archive", group: "Administration", description: "Manage document registry metadata and archived records.", table: "documents", titleField: "original_file_name", columns: ["original_file_name", "module", "document_type", "access_level", "created_at"], readAuditCategory: "CONFIDENTIAL_DOCUMENT", fields: [
    { name: "employee_id", label: "Employee", kind: "employee" }, { name: "module", label: "Module", required: true },
    { name: "document_type", label: "Document type", required: true }, { name: "original_file_name", label: "File name", required: true },
    { name: "file_size", label: "File size (bytes)", kind: "number", required: true }, { name: "mime_type", label: "MIME type", required: true },
    { name: "storage_path", label: "Storage path", required: true },
    { name: "access_level", label: "Access level", kind: "select", options: ["Private", "DiocesanHR", "BoardLevel", "PublicView"] },
  ] },
  { path: "/family", label: "Family & next of kin", group: "People", description: "Restricted family and emergency contact information.", table: "next_of_kin", titleField: "full_name", columns: ["employee_id", "full_name", "relationship", "telephone", "verification_status"], readAuditCategory: "FAMILY_INFO", fields: [
    { name: "employee_id", label: "Employee", kind: "employee", required: true }, { name: "full_name", label: "Full name", required: true },
    { name: "relationship", label: "Relationship", required: true }, { name: "telephone", label: "Telephone" },
    { name: "email", label: "Email", kind: "email" }, { name: "address", label: "Address", kind: "textarea" },
    { name: "priority", label: "Priority", kind: "number" },
    { name: "verification_status", label: "Verification", kind: "select", options: ["Pending", "Verified", "Expired"] },
    { name: "is_emergency_contact", label: "Emergency contact", kind: "checkbox" },
    { name: "is_beneficiary_contact", label: "Beneficiary contact", kind: "checkbox" },
  ] },
  { path: "/organization", label: "Departments", group: "Administration", description: "Manage diocesan departments and their access classification.", table: "departments", titleField: "name", columns: ["code", "name", "description", "isactive"], fields: [
    { name: "code", label: "Department code", required: true }, { name: "name", label: "Department name", required: true },
    { name: "description", label: "Description", kind: "textarea" }, { name: "issensitive", label: "Sensitive department", kind: "checkbox" },
    { name: "isactive", label: "Active", kind: "checkbox" },
  ] },
  { path: "/organization/dioceses", label: "Diocese profile", group: "Administration", description: "Manage the identity and regional details for this Diocese.", table: "dioceses", titleField: "name", columns: ["code", "name", "region", "isactive"], singleRecord: true, fields: [
    { name: "name", label: "Name", required: true }, { name: "code", label: "Code", required: true },
    { name: "region", label: "Region" }, { name: "isactive", label: "Active", kind: "checkbox" },
  ] },
  { path: "/organization/archdeaconries", label: "Archdeaconries", group: "Administration", description: "Manage archdeaconries within the diocesan structure.", table: "archdeaconries", titleField: "name", columns: ["name", "diocese_id", "region", "order_num", "isactive"], fields: [
    { name: "name", label: "Name", required: true }, { name: "diocese_id", label: "Diocese ID", required: true },
    { name: "region", label: "Region" }, { name: "order_num", label: "Display order", kind: "number" },
    { name: "isactive", label: "Active", kind: "checkbox" },
  ] },
  { path: "/organization/parishes", label: "Parishes", group: "Administration", description: "Manage parishes within their archdeaconries.", table: "parishes", titleField: "name", columns: ["name", "archdeaconry_id", "region", "order_num", "isactive"], fields: [
    { name: "name", label: "Name", required: true }, { name: "archdeaconry_id", label: "Archdeaconry ID", required: true },
    { name: "region", label: "Region" }, { name: "order_num", label: "Display order", kind: "number" },
    { name: "isactive", label: "Active", kind: "checkbox" },
  ] },
  { path: "/organization/local-churches", label: "Local churches", group: "Administration", description: "Manage local churches and parish relationships.", table: "local_churches", titleField: "name", columns: ["name", "parish_id", "order_num", "isactive"], fields: [
    { name: "name", label: "Name", required: true }, { name: "parish_id", label: "Parish ID", required: true },
    { name: "order_num", label: "Display order", kind: "number" }, { name: "isactive", label: "Active", kind: "checkbox" },
    { name: "issensitive", label: "Sensitive", kind: "checkbox" },
  ] },
  { path: "/organization/boards", label: "Boards", group: "Administration", description: "Manage diocesan boards and their remit.", table: "boards", titleField: "name", columns: ["code", "name", "description", "isactive"], fields: [
    { name: "code", label: "Code", required: true }, { name: "name", label: "Name", required: true },
    { name: "description", label: "Description", kind: "textarea" }, { name: "isactive", label: "Active", kind: "checkbox" },
  ] },
  { path: "/organization/personnel-domains", label: "Personnel domains", group: "Administration", description: "Review normalized personnel-management domains and their Board owners.", table: "personnel_domains", titleField: "name", columns: ["code", "name", "board_id", "is_secretariat", "is_active"], readOnly: true },
  { path: "/organization/institutions", label: "Institutions", group: "Administration", description: "Manage schools, health facilities and diocesan institutions.", table: "institutions", titleField: "name", columns: ["code", "name", "institution_type", "location", "isactive"], fields: [
    { name: "code", label: "Code", required: true }, { name: "name", label: "Name", required: true },
    { name: "institution_type", label: "Institution type", kind: "select", options: ["PrimarySchool", "SecondarySchool", "TechnicalVocational", "Hospital", "HealthCentre", "MissionStation", "DevelopmentProject", "BusinessUnit", "Office", "DiocesanCentre", "Other"], required: true },
    { name: "location", label: "Location" }, { name: "isactive", label: "Active", kind: "checkbox" },
  ] },
  { path: "/organization/positions", label: "Positions", group: "Administration", description: "Manage approved organizational positions.", table: "positions", titleField: "title", columns: ["code", "title", "department_id", "grade_id", "isactive"], fields: [
    { name: "code", label: "Code", required: true }, { name: "title", label: "Title", required: true },
    { name: "department_id", label: "Department ID" }, { name: "grade_id", label: "Grade ID" },
    { name: "description", label: "Description", kind: "textarea" },
    { name: "issupervisory", label: "Supervisory", kind: "checkbox" }, { name: "isactive", label: "Active", kind: "checkbox" },
  ] },
  { path: "/organization/grades", label: "Grades", group: "Administration", description: "Manage employee grades and salary scales.", table: "grades", titleField: "title", columns: ["code", "title", "salary_scale", "isactive"], fields: [
    { name: "code", label: "Code", required: true }, { name: "title", label: "Title", required: true },
    { name: "salary_scale", label: "Salary scale" }, { name: "description", label: "Description", kind: "textarea" },
    { name: "isactive", label: "Active", kind: "checkbox" },
  ] },
  { path: "/audit", label: "Audit & security", group: "Administration", description: "Review audit and security events permitted by your account.", table: "audit_log", titleField: "action", columns: ["created_at", "action", "module", "result", "purpose"], readOnly: true },
  { path: "/security", label: "Security events", group: "Administration", description: "Review security events permitted by your account.", table: "security_event", titleField: "event_type", columns: ["created_at", "event_type", "severity", "component", "acknowledged", "resolved"], readOnly: true },
  { path: "/settings", label: "System settings", group: "Administration", description: "Review and update system configuration allowed by your role.", table: "system_config", titleField: "config_key", columns: ["config_key", "config_section", "description", "is_valid"], fields: [
    { name: "config_key", label: "Configuration key", required: true }, { name: "config_value", label: "Configuration value", required: true, kind: "textarea" },
    { name: "config_section", label: "Section", required: true }, { name: "description", label: "Description", kind: "textarea" },
    { name: "is_valid", label: "Valid", kind: "checkbox" },
  ] },
  { path: "/admin/users", label: "User registration & access", group: "Administration", description: "Invite the designated account holders and review account access.", table: "user_roles", titleField: "role_code", columns: ["user_id", "role_code", "employee_id", "isactive", "issuspended", "accountexpiry"], fields: [
    { name: "user_id", label: "Existing account user ID", required: true },
    { name: "employee_id", label: "Linked employee record", kind: "employee" },
    { name: "role_code", label: "Role", kind: "select", required: true, options: [
      "SUPER_ADMIN", "SYSTEM_ADMIN", "SECRETARIAT_USER", "MISSION_BOARD_USER",
      "EDUCATION_BOARD_USER", "HEALTH_BOARD_USER", "LAND_FINANCE_BOARD_USER",
      "PLANNING_DEVELOPMENT_BOARD_USER", "ICT_BOARD_USER",
    ] },
    { name: "permissions", label: "Permissions (JSON array)", kind: "json", placeholder: "[]" },
    { name: "scopes", label: "Scopes (JSON array)", kind: "json", placeholder: "[]" },
    { name: "isactive", label: "Active", kind: "checkbox" },
    { name: "issuspended", label: "Suspended", kind: "checkbox" },
    { name: "accountexpiry", label: "Account expiry", kind: "date" },
  ], defaultValues: { isactive: true, issuspended: false, permissions: [], scopes: [] } },
  { path: "/admin/sessions", label: "Session management", group: "Administration", description: "Review active sign-in sessions and revoke access when needed.", table: "user_sessions", titleField: "device_info", columns: ["user_id", "device_info", "ip_address", "isactive", "expiresat", "lastactivityat"], readOnly: true },
  { path: "/admin/scopes", label: "User scopes", group: "Administration", description: "Assign temporary or permanent organizational scopes to provisioned accounts.", table: "user_scopes", titleField: "scope_name", columns: ["user_id", "scope_type", "scope_name", "expiresAt", "isActive"], fields: [
    { name: "user_id", label: "Account user ID", required: true },
    { name: "scope_id", label: "Organization record ID", required: true },
    { name: "scope_type", label: "Scope type", kind: "select", required: true, options: ["Diocese", "Archdeaconry", "Parish", "Institution", "Department", "Board", "PersonnelDomain"] },
    { name: "scope_name", label: "Scope name", required: true },
    { name: "purpose", label: "Purpose" },
    { name: "expiresAt", label: "Expiry date", kind: "date" },
    { name: "isActive", label: "Active", kind: "checkbox" },
    { name: "isTemporary", label: "Temporary", kind: "checkbox" },
    { name: "assignedBy", label: "Assigned by account user ID" },
  ], defaultValues: { isActive: true, isTemporary: false } },
];

export const moduleGroups = Array.from(new Set(modulePages.map((page) => page.group)));

const businessRoles = [
  "SECRETARIAT_USER", "MISSION_BOARD_USER", "EDUCATION_BOARD_USER", "HEALTH_BOARD_USER",
  "LAND_FINANCE_BOARD_USER", "PLANNING_DEVELOPMENT_BOARD_USER", "ICT_BOARD_USER",
];
const allBusinessRoles = ["SUPER_ADMIN", ...businessRoles];
const platformAdminRoles = ["SUPER_ADMIN", "SYSTEM_ADMIN"];
const financeRoles = ["SUPER_ADMIN", "LAND_FINANCE_BOARD_USER"];

export function moduleReadRoles(path: string) {
  if (path === "/admin/users" || path === "/admin/scopes") return ["SUPER_ADMIN"];
  if (path === "/admin/sessions") return platformAdminRoles;
  if (path === "/settings") return platformAdminRoles;
  if (path === "/security") return platformAdminRoles;
  if (path === "/audit") return platformAdminRoles;
  if (path === "/safeguarding") return ["SUPER_ADMIN"];
  if (path === "/payroll" || path === "/benefits" || path.startsWith("/pension")) return financeRoles;
  if (path.startsWith("/organization/archdeaconries") || path.startsWith("/organization/parishes") || path.startsWith("/organization/local-churches")) {
    return ["SUPER_ADMIN", "SECRETARIAT_USER"];
  }
  if (path.startsWith("/organization")) return allBusinessRoles;
  return allBusinessRoles;
}

export function moduleWriteRoles(path: string) {
  if (path === "/admin/users" || path === "/admin/scopes") return ["SUPER_ADMIN"];
  if (path === "/admin/sessions") return platformAdminRoles;
  if (path === "/settings") return platformAdminRoles;
  if (path === "/safeguarding") return ["SUPER_ADMIN"];
  if (path === "/payroll" || path === "/benefits" || path.startsWith("/pension")) return financeRoles;
  if (path.startsWith("/organization/archdeaconries") || path.startsWith("/organization/parishes") || path.startsWith("/organization/local-churches")) {
    return ["SUPER_ADMIN", "SECRETARIAT_USER"];
  }
  return allBusinessRoles;
}

export function canAccessModule(path: string, roles: string[]) {
  const allowed = moduleReadRoles(path);
  return roles.some((role) => allowed.includes(role));
}

export function canWriteModule(path: string, roles: string[]) {
  const allowed = moduleWriteRoles(path);
  return roles.some((role) => allowed.includes(role));
}

export function canDeleteModule(path: string, roles: string[]) {
  void path;
  void roles;
  return false;
}

export function canExportModule(path: string, roles: string[]) {
  if (path === "/audit" || path === "/security") return roles.some((role) => platformAdminRoles.includes(role));
  return canAccessModule(path, roles);
}

export function getModule(path: string) {
  return modulePages.find((page) => page.path === path);
}
