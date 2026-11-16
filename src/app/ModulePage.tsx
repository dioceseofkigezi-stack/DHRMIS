import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "@/core/config";
import { canAccessModule, canDeleteModule, canExportModule, canWriteModule, getModule, moduleWriteRoles, type FieldConfig } from "@/app/modules";
import { getPathIcon, Icon } from "@/components/ui/Icon";
import DataTable from "@/components/tables/DataTable";
import ConfirmDialog from "@/components/feedback/ConfirmDialog";
import { csvCell } from "@/core/security/csv";
import { displayValue } from "@/core/security/displayValue";
import { useToast } from "@/core/notifications/ToastProvider";
import { useNetworkStatus } from "@/core/monitoring/useNetworkStatus";
import { useAuth } from "@/modules/core/auth/context";
import { getWorkspaceDomain, getWorkspaceFromPath, workspacePath } from "@/core/organizational-scope/workspaces";

type Row = Record<string, unknown> & { id: string };
type FormValues = Record<string, unknown>;
type EmployeeDirectoryEntry = { id: string; employee_number: string; first_name: string; last_name: string };
const PAGE_SIZE = 25;

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    if (error.code === "42501") return "Your account is not allowed to perform this action.";
    if (error.code === "23505") return "A record with the same unique details already exists.";
    if (error.code === "23503") return "One of the selected related records is no longer available.";
    if (error.code === "PGRST301") return "Your session has expired. Sign in again to continue.";
    return "The request could not be completed. Check the entered data and your access permissions.";
  }
  if (error instanceof SyntaxError) return "Enter valid JSON before saving.";
  if (error instanceof Error) {
    if (/must be a JSON array|is required|date range/i.test(error.message)) return error.message;
    if (/invalid api key|failed to fetch|network/i.test(error.message.toLowerCase())) return "The system data service is unavailable. Check your connection or contact your administrator.";
  }
  return "The request could not be completed. Check the entered data and your access permissions.";
}

function isEmployeeDirectoryEntry(value: unknown): value is EmployeeDirectoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === "string" && typeof entry.employee_number === "string" && typeof entry.first_name === "string" && typeof entry.last_name === "string";
}

function getInitialValues(fields: FieldConfig[], defaults: FormValues = {}) {
  return Object.fromEntries(fields.map((field) => [field.name, defaults[field.name] ?? (field.kind === "checkbox" ? false : "")]));
}

function EditField({ field, value, onChange, employees }: {
  field: FieldConfig;
  value: unknown;
  onChange: (value: unknown) => void;
  employees: Array<{ id: string; label: string }>;
}) {
  const common = {
    id: `field-${field.name}`,
    name: field.name,
    required: field.required,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const target = event.target;
      onChange(target instanceof HTMLInputElement && target.type === "checkbox" ? target.checked : target.value);
    },
  };
  return (
    <label className={field.kind === "textarea" || field.kind === "json" ? "field field-wide" : "field"} htmlFor={common.id}>
      {field.label}{field.required && <span aria-hidden="true" className="required-indicator"> *</span>}
      {field.kind === "textarea" || field.kind === "json" ? <textarea {...common} value={typeof value === "string" ? value : JSON.stringify(value ?? [], null, 2)} rows={3} placeholder={field.placeholder} /> :
        field.kind === "select" ? <select {...common} value={String(value ?? "")}><option value="">Select…</option>{field.options?.map((option) => <option key={option} value={option}>{option}</option>)}</select> :
          field.kind === "employee" ? employees.length ? <select {...common} value={String(value ?? "")}><option value="">Select an employee…</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.label}</option>)}</select> : <input {...common} value={String(value ?? "")} placeholder="Employee record ID" /> :
            field.kind === "checkbox" ? <span className="checkbox-control"><input {...common} type="checkbox" checked={Boolean(value)} /> Yes</span> :
              <input {...common} type={field.kind ?? "text"} value={field.kind === "date" && value ? String(value).slice(0, 10) : String(value ?? "")} placeholder={field.placeholder} />}
    </label>
  );
}

export default function ModulePage() {
  const location = useLocation();
  const { roles, session, personnelDomains, workspaceDomainCodes } = useAuth();
  const showToast = useToast();
  const online = useNetworkStatus();
  const config = getModule(location.pathname);
  const activeWorkspace = getWorkspaceFromPath(location.pathname, location.search);
  const activeDomain = activeWorkspace && workspaceDomainCodes.includes(activeWorkspace.code)
    ? getWorkspaceDomain(activeWorkspace, personnelDomains)
    : workspaceDomainCodes.length === 1
      ? personnelDomains.find((domain) => domain.code === workspaceDomainCodes[0])
      : undefined;
  const [rows, setRows] = useState<Row[]>([]);
  const [employees, setEmployees] = useState<Array<{ id: string; label: string }>>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<Row | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);
  const [confirmExport, setConfirmExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [sortKey, setSortKey] = useState("");
  const [sortAscending, setSortAscending] = useState(true);

  useEffect(() => {
    setPage(0);
    setSearch("");
    setSortKey("");
    setSortAscending(true);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const searchColumn = useMemo(() => {
    if (!config) return undefined;
    if (config.searchColumn) return config.searchColumn;
    if (config.titleField) return config.titleField;
    return config.fields?.find((field) => config.columns?.includes(field.name) && (field.kind === undefined || field.kind === "text" || field.kind === "email"))?.name;
  }, [config]);

  const loadRows = useCallback(async () => {
    if (!config?.table || !supabase || !canAccessModule(config.path, roles)) {
      setLoading(false);
      setRows([]);
      setCount(0);
      return;
    }
    const client = supabase;
    setLoading(true);
    setError("");
    try {
      const selectedColumns = [...new Set(["id", ...(config.columns ?? []), ...(config.fields ?? []).map((field) => field.name), ...(config.table === "employee_transfers" ? ["created_by"] : [])])];
      const table = config.table === "employees" && activeDomain ? "personnel_domain_employees" : config.table;
      let query = client.from(table).select(selectedColumns.join(","), { count: "exact" });
      if (config.table === "employees" && activeDomain) query = query.eq("personnel_domain_id", activeDomain.id);
      if (config.filter) query = query.eq(config.filter.column, config.filter.value);
      if (debouncedSearch && searchColumn) query = query.ilike(searchColumn, `%${debouncedSearch.replace(/[\\%_]/g, "\\$&")}%`);
      const orderBy = sortKey && config.columns?.includes(sortKey) ? sortKey : config.columns?.[0] ?? "id";
      const { data, error: queryError, count: total } = await query.order(orderBy, { ascending: sortAscending, nullsFirst: false }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (queryError) throw queryError;
      const records = (data ?? []) as unknown as Row[];
      if (config.readAuditCategory && records.length && session?.user.id) {
        const { error: auditError } = await client.from("sensitive_read_log").insert(records.map((row) => ({
          user_id: session.user.id,
          employee_id: typeof row.employee_id === "string" ? row.employee_id : null,
          record_id: row.id,
          record_type: config.table,
          data_category: config.readAuditCategory,
          purpose: `Viewed ${config.label}`,
        })));
        if (auditError) throw new Error("Sensitive access could not be recorded.");
      }
      setRows(records);
      setCount(total ?? 0);
    } catch (reason) {
      setError(getErrorMessage(reason));
      setRows([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [config, roles, session?.user.id, debouncedSearch, searchColumn, page, sortKey, sortAscending, location.search, activeDomain?.id]);

  useEffect(() => { void loadRows(); }, [loadRows]);

  useEffect(() => {
    let active = true;
    async function loadEmployees() {
      if (!supabase || !config?.fields?.some((field) => field.kind === "employee") || !canAccessModule(config.path, roles)) return;
      const { data, error: queryError } = await supabase.rpc("get_employee_directory");
      if (!active) return;
      if (queryError) {
        setError("Unable to load employee choices. Check your access and try again.");
        return;
      }
      const directoryData: unknown = data;
      if (!Array.isArray(directoryData) || !directoryData.every(isEmployeeDirectoryEntry)) {
        setError("The employee directory returned an unexpected response.");
        return;
      }
      setEmployees(directoryData.map((employee) => ({
        id: employee.id,
        label: `${employee.employee_number} · ${employee.first_name} ${employee.last_name}`,
      })));
    }
    void loadEmployees();
    return () => { active = false; };
  }, [config, roles]);

  if (!config) return <div className="page-content"><div className="empty-state"><h2>Page not found</h2><p>This page is not part of the system.</p></div></div>;

  const pageConfig = config;
  const hasAccess = canAccessModule(pageConfig.path, roles);
  const selfServiceEmployee = roles.includes("Employee") &&
    !roles.some((role) => role !== "Employee" && moduleWriteRoles(pageConfig.path).includes(role)) &&
    (pageConfig.path === "/leave" || pageConfig.path === "/early-retirement");
  const canEdit = Boolean(pageConfig.fields?.length && !pageConfig.readOnly && canWriteModule(pageConfig.path, roles));
  const canEditExisting = canEdit && !selfServiceEmployee && pageConfig.table !== "employee_transfers";
  const canDelete = canEdit && Boolean(pageConfig.allowDelete) && canDeleteModule(pageConfig.path, roles);
  const canExport = canExportModule(pageConfig.path, roles);
  const columns = pageConfig.columns ?? [];
  const selfServiceFields: Record<string, string[]> = {
    "/leave": ["employee_id", "leave_type", "period", "start_date", "end_date", "reason"],
    "/early-retirement": ["employee_id", "application_date", "reason", "eligible_years_left", "requested_effective_date"],
  };
  const fields = (pageConfig.fields ?? []).filter((field) => !selfServiceEmployee || selfServiceFields[pageConfig.path]?.includes(field.name));

  function openCreate() {
    setSelected(null);
    setValues(getInitialValues(fields, pageConfig.defaultValues));
    setModalOpen(true);
  }

  function openEdit(row: Row) {
    if (!canEditExisting) return;
    setSelected(row);
    setValues(getInitialValues(fields, row));
    setModalOpen(true);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!online) {
      setError("Reconnect to the network before saving. Confidential changes are not queued offline.");
      return;
    }
    if (!supabase || !pageConfig.table) return;
    setSaving(true);
    setError("");
    try {
      const payload: FormValues = selected ? {} : { ...pageConfig.defaultValues };
      for (const field of fields) {
        const value = values[field.name];
        if (value === "" || value === undefined) {
          if (selected) payload[field.name] = null;
        } else if (field.kind === "json") {
          const parsed: unknown = JSON.parse(String(value));
          if (!Array.isArray(parsed)) throw new Error(`${field.label} must be a JSON array.`);
          payload[field.name] = parsed;
        } else if (field.kind === "number") {
          const numberValue = Number(value);
          if (!Number.isFinite(numberValue)) throw new Error(`${field.label} must be a valid number.`);
          payload[field.name] = numberValue;
        } else {
          payload[field.name] = value;
        }
      }
      if (selfServiceEmployee) payload.status = pageConfig.path === "/leave" ? "Requested" : "Submitted";

      if (["assignments", "employee_roles", "vacancies", "departments", "institutions", "grades", "positions"].includes(pageConfig.table) && activeDomain) {
        payload.personnel_domain_id = activeDomain.id;
        payload.board_id = activeDomain.boardId;
      }

      if (pageConfig.table === "employees" && !selected) {
        if (!activeDomain) throw new Error("Open an assigned personnel workspace before creating an employee.");
        const { data, error: createError } = await supabase.rpc("create_employee_in_personnel_domain", {
          employee_data: payload,
          target_domain_id: activeDomain.id,
        });
        if (createError) throw createError;
        if (!data) throw new Error("The employee could not be created in this personnel domain.");
      } else if (pageConfig.table === "employee_transfers" && !selected) {
        const { data, error: transferError } = await supabase.rpc("request_employee_transfer", {
          source_assignment_id: payload.previous_assignment_id,
          target_domain_id: payload.new_domain_id,
          effective_date: payload.effective_date,
          transfer_reason: payload.reason,
          transfer_authority: payload.authority ?? null,
          transfer_reference: payload.reference_number ?? null,
          assignment_details: {
            assignment_type: payload.assignment_type ?? null,
            department_id: payload.department_id ?? null,
            institution_id: payload.institution_id ?? null,
            position_id: payload.position_id ?? null,
            grade_id: payload.grade_id ?? null,
            supervisor_id: payload.supervisor_id ?? null,
          },
        });
        if (transferError) throw transferError;
        if (!data) throw new Error("The transfer request could not be created.");
      } else {
        const result = selected
          ? await supabase.from(pageConfig.table).update(payload).eq("id", selected.id).select("id").maybeSingle()
          : await supabase.from(pageConfig.table).insert(payload).select("id").single();
        if (result.error) throw result.error;
        if (!result.data) throw new Error("No record was changed. It may have been removed or your account may not have permission.");
      }
      setModalOpen(false);
      showToast(selected ? "Record updated successfully." : "Record created successfully.", "success");
      await loadRows();
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setSaving(false);
    }
  }

  async function handleTransferAction(row: Row) {
    if (!online || !supabase || pageConfig.table !== "employee_transfers") return;
    const rpc = row.status === "Pending"
      ? "approve_employee_transfer"
      : row.status === "Approved"
        ? "complete_employee_transfer"
        : undefined;
    if (!rpc) return;
    setError("");
    const { error: transferError } = await supabase.rpc(rpc, { target_transfer_id: row.id });
    if (transferError) {
      setError(getErrorMessage(transferError));
      return;
    }
    showToast(row.status === "Pending" ? "Transfer approved. It will take effect on its recorded date." : "Transfer completed.", "success");
    await loadRows();
  }

  async function handleDelete() {
    const row = pendingDelete;
    if (!online || !row || !canDelete || !supabase || !pageConfig.table) return;
    setDeleting(true);
    setError("");
    const { error: deleteError } = await supabase.from(pageConfig.table).delete().eq("id", row.id);
    if (deleteError) {
      setError(getErrorMessage(deleteError));
    } else {
      setPendingDelete(null);
      showToast("Record deleted successfully.", "success");
      if (rows.length === 1 && page > 0) setPage((current) => current - 1);
      else await loadRows();
    }
    setDeleting(false);
  }

  async function handleExport() {
    if (!online || !canExport || !rows.length) return;
    setExporting(true);
    try {
      if (pageConfig.readAuditCategory && supabase && session?.user.id) {
        const { error: auditError } = await supabase.from("sensitive_read_log").insert(rows.map((row) => ({
          user_id: session.user.id,
          employee_id: typeof row.employee_id === "string" ? row.employee_id : null,
          record_id: row.id,
          record_type: pageConfig.table,
          data_category: pageConfig.readAuditCategory,
          purpose: `Exported current page from ${pageConfig.label}`,
        })));
        if (auditError) throw new Error("Export was not started because the access record could not be written.");
      }
      const content = [columns.map(csvCell).join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\r\n");
      const file = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" });
      const objectUrl = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${pageConfig.path.replaceAll("/", "-").replace(/^-/, "")}-page-${page + 1}.csv`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
      setConfirmExport(false);
      showToast(`Exported ${rows.length} records from this page.`, "success");
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setExporting(false);
    }
  }

  const tableColumns = columns.map((column) => ({
    key: column,
    label: column.replaceAll("_", " "),
    render: (row: Row) => pageConfig.table === "employees" && ["employee_number", "first_name", "last_name"].includes(column)
      ? <Link className="record-link" to={activeWorkspace ? workspacePath(`/people/${row.id}`, activeWorkspace.slug) : `/people/${row.id}`}>{displayValue(row[column])}</Link>
      : displayValue(row[column]),
  }));
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const firstRecord = count === 0 ? 0 : page * PAGE_SIZE + 1;
  const lastRecord = Math.min(count, (page + 1) * PAGE_SIZE);

  return (
    <div className="page-content">
      {!hasAccess && <div className="empty-state"><div className="empty-mark">Restricted</div><h2>Access restricted</h2><p>Your account does not have a role that can access this page.</p></div>}
      {hasAccess && <>
        <header className="page-heading">
          <div><p className="eyebrow">{pageConfig.group.toUpperCase()}</p><h1><Icon name={getPathIcon(pageConfig.path)} size={23} />{pageConfig.label}</h1><p className="muted">{pageConfig.description}</p></div>
          {canEdit && <button className="button button-primary" onClick={openCreate} disabled={!online}><Icon name="plus" size={15} />New record</button>}
        </header>
        {!supabase && <div className="notice notice-warning">The Supabase data service is not configured. Contact your administrator.</div>}
        {!online && <div className="notice notice-warning" role="status">You are offline. Confidential edits are not stored for later synchronization.</div>}
        {error && <div className="notice notice-error" role="alert">{error}<button className="notice-dismiss" onClick={() => setError("")} aria-label="Dismiss error"><Icon name="close" size={16} /></button></div>}
        {pageConfig.table && <section className="panel records-panel" aria-label={`${pageConfig.label} records`}>
          <div className="records-toolbar">
            <div><strong>{count.toLocaleString()}</strong><span> {count === 1 ? "record" : "records"}{count ? ` · showing ${firstRecord}–${lastRecord}` : ""}</span></div>
            <div className="toolbar-actions">
              <label className="search-box"><Icon name="search" size={14} /><input aria-label={`Search ${pageConfig.label}`} placeholder={searchColumn ? "Search records" : "Search unavailable"} value={search} onChange={(event) => setSearch(event.target.value)} disabled={!searchColumn} /></label>
              {canExport && <button className="button button-secondary button-small" onClick={() => setConfirmExport(true)} disabled={!online || !rows.length || loading}><Icon name="export" size={14} />Export page</button>}
              <button className="button button-secondary button-small" onClick={() => void loadRows()} disabled={loading}><Icon name="refresh" size={14} />Refresh</button>
            </div>
          </div>
          {loading ? <div className="table-state" role="status">Loading records…</div> : rows.length ? <>
            <DataTable rows={rows} columns={tableColumns} sortKey={sortKey || columns[0] || "id"} sortAscending={sortAscending} onSort={(column) => { if (sortKey === column) setSortAscending((current) => !current); else { setSortKey(column); setSortAscending(true); } setPage(0); }} actions={canEditExisting || canDelete || pageConfig.table === "employee_transfers" ? (row) => <>
              {canEditExisting && <button className="text-button" onClick={() => openEdit(row)} disabled={!online}><Icon name="edit" size={13} />Edit</button>}
              {canDelete && <button className="text-button text-danger" onClick={() => setPendingDelete(row)} disabled={!online}><Icon name="trash" size={13} />Delete</button>}
              {pageConfig.table === "employee_transfers" && row.status === "Pending" && row.created_by !== session?.user.id && <button className="text-button" onClick={() => void handleTransferAction(row)} disabled={!online}><Icon name="check" size={13} />Approve</button>}
              {pageConfig.table === "employee_transfers" && row.status === "Approved" && typeof row.effective_date === "string" && Date.parse(`${row.effective_date}T00:00:00`) <= Date.now() && <button className="text-button" onClick={() => void handleTransferAction(row)} disabled={!online}><Icon name="check" size={13} />Complete</button>}
            </> : undefined} />
            <div className="pagination-bar"><span>Page {page + 1} of {pageCount}</span><div><button className="button button-secondary button-small" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0}><Icon name="arrowLeft" size={13} />Previous</button><button className="button button-secondary button-small" onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} disabled={page >= pageCount - 1}>Next<Icon name="arrowRight" size={13} /></button></div></div>
          </> : <div className="empty-state"><div className="empty-mark">No records</div><h2>{debouncedSearch ? "No matching records" : "No records yet"}</h2><p>{debouncedSearch ? "Try another search term or clear the search." : "There are no records in this view yet."}</p>{canEdit && !debouncedSearch && <button className="button button-primary" onClick={openCreate}><Icon name="plus" size={14} />Create a record</button>}</div>}
        </section>}
        {modalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setModalOpen(false); }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div className="modal-heading"><div><p className="eyebrow">{pageConfig.label}</p><h2 id="modal-title">{selected ? "Edit record" : "New record"}</h2></div><button type="button" className="icon-button" onClick={() => setModalOpen(false)} aria-label="Close dialog" disabled={saving}><Icon name="close" size={18} /></button></div>
            <form onSubmit={(event) => void handleSave(event)}><div className="field-grid">{fields.map((field) => <EditField key={field.name} field={field} value={values[field.name]} employees={employees} onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))} />)}</div>
              <div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</button><button className="button button-primary" disabled={saving || !online}>{saving ? "Saving…" : <><Icon name={selected ? "check" : "plus"} size={14} />{selected ? "Save changes" : "Create record"}</>}</button></div>
            </form>
          </section>
        </div>}
      </>}
      {pendingDelete && <ConfirmDialog title="Delete this record?" confirmLabel="Delete record" destructive busy={deleting} onCancel={() => setPendingDelete(null)} onConfirm={() => void handleDelete()}><p>This action cannot be undone. The database will check your permission before removing the record.</p></ConfirmDialog>}
      {confirmExport && <ConfirmDialog title="Export this page?" confirmLabel="Export CSV" busy={exporting} onCancel={() => setConfirmExport(false)} onConfirm={() => void handleExport()}><p>This downloads up to {rows.length} records currently visible on this page as a CSV file.</p>{pageConfig.readAuditCategory && <p className="sensitive-export-warning">This contains sensitive information and the export will be recorded in the access log.</p>}</ConfirmDialog>}
    </div>
  );
}
