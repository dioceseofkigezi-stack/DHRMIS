import { Fragment, useCallback, useEffect, useState } from "react";
import { canAccessModule } from "@/app/modules";
import { supabase } from "@/core/config";
import { useAuth } from "@/modules/core/auth/context";
import { ADMIN_PAGE_SIZE, AdminNotice, AdminPageHeader, AdminPagination, AdminStatus, adminErrorMessage, formatAdminDate } from "./AdminConsoleShared";

type LogSource = "audit" | "sensitive";
interface AuditRow {
  id: string;
  created_at?: string;
  timestamp?: string;
  user_name: string | null;
  user_id: string | null;
  record_id?: string | null;
  record_key?: unknown;
  employee_id?: string | null;
  session_id?: string | null;
  scope_ids?: unknown;
  ip_address?: string | null;
  device_info?: string | null;
  user_agent?: string | null;
  action?: string;
  module?: string | null;
  record_type: string | null;
  result?: string | null;
  purpose: string | null;
  context?: string | null;
  before_values?: unknown;
  after_values?: unknown;
  data_category?: string;
  accessed_fields?: unknown;
}

function safeEndDate(value: string) {
  if (!value) return "";
  const end = new Date(`${value}T00:00:00`);
  end.setDate(end.getDate() + 1);
  return end.toISOString();
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function valuesFromAuditSnapshot(value: unknown): Record<string, unknown> {
  const snapshot = asObject(value);
  if (snapshot.values && typeof snapshot.values === "object" && !Array.isArray(snapshot.values)) {
    return snapshot.values as Record<string, unknown>;
  }
  return Object.fromEntries(Object.entries(snapshot).filter(([key]) => key !== "changed_fields"));
}

function fieldsFromAuditRow(row: AuditRow, before: Record<string, unknown>, after: Record<string, unknown>) {
  const beforeFields = asObject(row.before_values).changed_fields;
  const afterFields = asObject(row.after_values).changed_fields;
  const recordedFields = [beforeFields, afterFields]
    .filter(Array.isArray)
    .flatMap((fields) => fields.filter((field): field is string => typeof field === "string"));
  return [...new Set(recordedFields.length ? recordedFields : [...Object.keys(before), ...Object.keys(after)])].sort();
}

function isCredentialField(field: string) {
  const normalized = field.toLowerCase().replace(/[^a-z0-9]/g, "");
  return /(password|passwd|passphrase|secret|token|credential|apikey|accesskey|privatekey|servicekey|servicerole|clientsecret|authorization|authheader|bearer|jwt|cookie|sessionid|authsessionid|encryptionkey|signingkey)/.test(normalized);
}

function redactCredentialValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactCredentialValues);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [
    key,
    isCredentialField(key) ? "[REDACTED: CREDENTIAL OR SECRET]" : redactCredentialValues(nestedValue),
  ]));
}

function formatAuditValue(value: unknown) {
  if (value === undefined) return "Not recorded";
  if (value === null || value === "") return "Empty";
  if (value === "[REDACTED: CREDENTIAL OR SECRET]") return "Not recorded (credential or secret)";
  if (value === "[REDACTED]") return "Redacted in original audit record";
  if (typeof value === "string") return value;
  if (typeof value === "object") return JSON.stringify(value, null, 2) || "Empty";
  return String(value);
}

function formatAuditField(field: string) {
  return field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .replace(/\bId\b/g, "ID")
    .replace(/\bUuid\b/g, "UUID")
    .replace(/\bIp\b/g, "IP");
}

function auditActionLabel(action: string | undefined) {
  switch (action) {
    case "CREATED": return "Created";
    case "UPDATE": return "Updated";
    case "DELETE_REQUEST": return "Deleted";
    case "USER_ACCOUNT_UPDATED": return "Updated user account";
    case "USER_ACCOUNT_CREATED": return "Created user account";
    case "USER_ACCOUNT_DELETED": return "Deleted user account";
    case "USER_PASSWORD_RESET": return "Reset user password";
    case "USER_PASSWORD_CHANGED": return "Changed password";
    case "USER_PROFILE_UPDATED": return "Updated user profile";
    default: return action ? formatAuditField(action) : "Activity";
  }
}

function sensitiveActionLabel(purpose: string | null | undefined) {
  if (/\bdownload(ed)?\b/i.test(purpose ?? "")) return "Downloaded record";
  if (/\bexport(ed)?\b/i.test(purpose ?? "")) return "Exported record";
  return "Viewed record";
}

function displayValue(field: string, value: unknown, side: "before" | "after", row: AuditRow) {
  if (value === undefined && side === "before" && (row.action === "CREATED" || row.action === "USER_ACCOUNT_CREATED")) return "Not present before creation";
  if (value === undefined && side === "after" && (row.action === "DELETE_REQUEST" || row.action === "USER_ACCOUNT_DELETED")) return "Record deleted";
  if (value === undefined) return "Not recorded";
  if (isCredentialField(field)) return "Not recorded (credential or secret)";
  return formatAuditValue(redactCredentialValues(value));
}

function AuditEventDetails({ row, source }: { row: AuditRow; source: LogSource }) {
  const before = valuesFromAuditSnapshot(row.before_values);
  const after = valuesFromAuditSnapshot(row.after_values);
  const fields = fieldsFromAuditRow(row, before, after);
  const accessedFields = Array.isArray(row.accessed_fields)
    ? row.accessed_fields.filter((field): field is string => typeof field === "string").map(formatAuditField)
    : [];
  const sourceLabel = source === "audit" ? "System change" : "Sensitive record access";
  const details: Array<[string, unknown]> = [
    ["Event ID", row.id],
    ["User ID", row.user_id],
    ["Record type", row.record_type],
    ["Record ID", row.record_id],
    ["Record key", row.record_key],
    ["Related employee ID", row.employee_id],
    ["Session ID", row.session_id],
    ["IP address", row.ip_address],
    ["Device", row.device_info],
    ["Browser / client", row.user_agent],
    ["Data category", row.data_category],
    ["Accessed fields", accessedFields.length ? accessedFields.join(", ") : "Not recorded for this event"],
    ["Scopes", row.scope_ids],
    ["Purpose", row.purpose],
    ["Context", row.context],
      ].filter(([, value]) => value !== null && value !== undefined && value !== "");

  return <details className="admin-audit-details">
    <summary>View detailed event</summary>
    <div className="admin-audit-detail-content">
      {source === "audit" ? <>
        <h3>{auditActionLabel(row.action)} {formatAuditField(row.record_type || row.module || "record").toLowerCase()}</h3>
        {fields.length ? <div className="admin-audit-change-table-wrap"><table className="admin-audit-change-table">
          <thead><tr><th>Field changed</th><th>Before</th><th>After</th></tr></thead>
          <tbody>{fields.map((field) => <tr key={field}>
            <th scope="row">{formatAuditField(field)}</th>
            <td><pre>{displayValue(field, before[field], "before", row)}</pre></td>
            <td><pre>{displayValue(field, after[field], "after", row)}</pre></td>
          </tr>)}</tbody>
        </table></div> : <p className="admin-audit-no-fields">Field-level values were not recorded for this event.</p>}
      </> : <>
        <h3>{sourceLabel}</h3>
        <p className="admin-audit-no-fields">{accessedFields.length
          ? "The field names below show which data was made available in this view, export, or download. Field values are not copied into the sensitive-read log."
          : "This older entry does not include the field list. New entries record which field names were made available, without copying field values."}</p>
      </>}
      <dl className="admin-audit-metadata">{details.map(([label, value]) => <Fragment key={label}>
        <dt>{label}</dt><dd>{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
      </Fragment>)}</dl>
    </div>
  </details>;
}

export default function AdminAuditPage() {
  const { roles } = useAuth();
  const canView = canAccessModule("/audit", roles);
  const [source, setSource] = useState<LogSource>("audit");
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedSearch(search.trim()); setPage(0); }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => { setPage(0); }, [source, fromDate, toDate]);

  const loadLogs = useCallback(async () => {
    if (!canView) { setRows([]); setTotal(0); setLoading(false); return; }
    if (!supabase) { setRows([]); setTotal(0); setError("The system data service is not configured."); setLoading(false); return; }
    setLoading(true);
    setError("");
    const safeSearch = debouncedSearch.replace(/[^a-zA-Z0-9@._ -]/g, "");
    let query = source === "audit"
      ? supabase.from("audit_log").select("id,created_at,user_name,user_id,action,module,record_id,record_key,employee_id,record_type,result,purpose,context,before_values,after_values,session_id,scope_ids,ip_address,device_info,user_agent", { count: "exact" }).order("created_at", { ascending: false })
      : supabase.from("sensitive_read_log").select("id,timestamp,user_name,user_id,record_id,employee_id,record_type,data_category,purpose,accessed_fields,scope_ids,session_id,ip_address,device_info", { count: "exact" }).order("timestamp", { ascending: false });
    const dateColumn = source === "audit" ? "created_at" : "timestamp";
    if (fromDate) query = query.gte(dateColumn, new Date(`${fromDate}T00:00:00`).toISOString());
    if (toDate) query = query.lt(dateColumn, safeEndDate(toDate));
    if (safeSearch) {
      query = source === "audit"
        ? query.or(`user_name.ilike.%${safeSearch}%,action.ilike.%${safeSearch}%,module.ilike.%${safeSearch}%,record_type.ilike.%${safeSearch}%,purpose.ilike.%${safeSearch}%,context.ilike.%${safeSearch}%`)
        : query.or(`user_name.ilike.%${safeSearch}%,record_type.ilike.%${safeSearch}%,data_category.ilike.%${safeSearch}%,purpose.ilike.%${safeSearch}%`);
    }
    const { data, count, error: queryError } = await query.range(page * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE - 1);
    if (queryError) {
      setRows([]); setTotal(0);
      setError(adminErrorMessage(queryError, "The selected log could not be loaded."));
    } else {
      setRows((data ?? []) as AuditRow[]);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [canView, debouncedSearch, fromDate, page, source, toDate]);

  useEffect(() => { void loadLogs(); }, [loadLogs]);

  if (!canView) return <div className="page-content"><div className="empty-state"><h2>Access restricted</h2></div></div>;
  return <div className="page-content admin-console-page">
    <AdminPageHeader title="Audit activity" actions={<button className="button button-secondary" type="button" onClick={() => void loadLogs()} disabled={loading}>Refresh</button>} />
    {error && <AdminNotice>{error}</AdminNotice>}
    <section className="panel admin-directory-panel" aria-label="Audit history">
      <div className="admin-log-tabs" role="tablist" aria-label="Log type">
        <button type="button" role="tab" aria-selected={source === "audit"} className={source === "audit" ? "admin-log-tab admin-log-tab-active" : "admin-log-tab"} onClick={() => setSource("audit")}>System audit log</button>
        <button type="button" role="tab" aria-selected={source === "sensitive"} className={source === "sensitive" ? "admin-log-tab admin-log-tab-active" : "admin-log-tab"} onClick={() => setSource("sensitive")}>Sensitive-read log</button>
      </div>
      <div className="admin-table-toolbar">
        <div><strong>{total.toLocaleString()}</strong><span> {source === "audit" ? "audit records" : "sensitive reads"}</span></div>
        <div className="admin-filter-controls">
          <label className="search-box"><input aria-label="Search audit logs" placeholder="Search actor, action or category" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <label className="admin-filter-label">From<input aria-label="Audit date from" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
          <label className="admin-filter-label">To<input aria-label="Audit date to" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
        </div>
      </div>
      {loading ? <div className="admin-table-state" role="status"><span className="loading-spinner" />Loading {source === "audit" ? "audit activity" : "sensitive-read records"}…</div>
        : rows.length === 0 ? <div className="admin-table-state"><strong>No matching log records</strong></div>
          : <div className="table-scroll"><table className="admin-data-table"><thead>{source === "audit" ? <tr><th>Time</th><th>User</th><th>Action</th><th>Module</th><th>Record</th><th>Result</th><th>Details</th></tr> : <tr><th>Time</th><th>User</th><th>Data category</th><th>Record type</th><th>Record ID</th><th>Purpose</th><th>Details</th></tr>}</thead><tbody>{rows.map((row) => {
            const time = row.created_at || row.timestamp;
            return <Fragment key={row.id}>
              {source === "audit" ? <tr>
                <td>{formatAdminDate(time)}</td>
                <td><strong>{row.user_name || "Unknown user"}</strong><small>{row.user_id || "No user ID"}</small></td>
                <td>{auditActionLabel(row.action)}</td>
                <td>{row.module ? formatAuditField(row.module) : "System"}</td>
                <td><strong>{row.record_type ? formatAuditField(row.record_type) : "—"}</strong><small>{row.record_id || (row.record_key ? JSON.stringify(row.record_key) : "No record ID")}</small></td>
                <td><AdminStatus tone={row.result === "Success" ? "success" : row.result === "Failure" ? "danger" : "warning"}>{row.result || "Unknown"}</AdminStatus></td>
                <td>{row.purpose || row.context || "—"}</td>
              </tr> : <tr>
                <td>{formatAdminDate(time)}</td>
                <td><strong>{row.user_name || "Unknown user"}</strong><small>{row.user_id || "No user ID"}</small></td>
                <td><AdminStatus tone="warning">{row.data_category || "Sensitive"}</AdminStatus></td>
                <td>{row.record_type ? formatAuditField(row.record_type) : "—"}</td>
                <td><code>{row.record_id || "—"}</code></td>
                <td>{row.purpose || "Not provided"}</td>
                <td>{sensitiveActionLabel(row.purpose)}</td>
              </tr>}
              <tr className="admin-audit-expand-row"><td colSpan={7}><AuditEventDetails row={row} source={source} /></td></tr>
            </Fragment>;
          })}</tbody></table></div>}
      {!loading && <AdminPagination page={page} total={total} onPage={setPage} />}
    </section>
  </div>;
}
