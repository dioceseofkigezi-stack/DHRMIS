import { useCallback, useEffect, useState } from "react";
import { canAccessModule } from "@/app/modules";
import { Icon } from "@/components/ui/Icon";
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
  action?: string;
  module?: string | null;
  record_type: string | null;
  result?: string | null;
  purpose: string | null;
  context?: string | null;
  data_category?: string;
}

function safeEndDate(value: string) {
  if (!value) return "";
  const end = new Date(`${value}T00:00:00`);
  end.setDate(end.getDate() + 1);
  return end.toISOString();
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
      ? supabase.from("audit_log").select("id,created_at,user_name,user_id,action,module,record_type,result,purpose,context", { count: "exact" }).order("created_at", { ascending: false })
      : supabase.from("sensitive_read_log").select("id,timestamp,user_name,user_id,record_id,record_type,data_category,purpose", { count: "exact" }).order("timestamp", { ascending: false });
    const dateColumn = source === "audit" ? "created_at" : "timestamp";
    if (fromDate) query = query.gte(dateColumn, new Date(`${fromDate}T00:00:00`).toISOString());
    if (toDate) query = query.lt(dateColumn, safeEndDate(toDate));
    if (safeSearch) {
      query = source === "audit"
        ? query.or(`user_name.ilike.%${safeSearch}%,action.ilike.%${safeSearch}%,module.ilike.%${safeSearch}%,record_type.ilike.%${safeSearch}%,purpose.ilike.%${safeSearch}%`)
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

  if (!canView) return <div className="page-content"><div className="empty-state"><h2>Access restricted</h2><p>Audit and sensitive-read logs are restricted to the Super/System Administrator.</p></div></div>;
  return <div className="page-content admin-console-page">
    <AdminPageHeader title="Audit activity" description="Review recorded system changes and access to sensitive information. Log entries are read-only." icon="assignment" actions={<button className="button button-secondary" type="button" onClick={() => void loadLogs()} disabled={loading}><Icon name="refresh" size={14} />Refresh</button>} />
    {error && <AdminNotice>{error}</AdminNotice>}
    <section className="panel admin-directory-panel" aria-label="Audit history">
      <div className="admin-log-tabs" role="tablist" aria-label="Log type">
        <button type="button" role="tab" aria-selected={source === "audit"} className={source === "audit" ? "admin-log-tab admin-log-tab-active" : "admin-log-tab"} onClick={() => setSource("audit")}>System audit log</button>
        <button type="button" role="tab" aria-selected={source === "sensitive"} className={source === "sensitive" ? "admin-log-tab admin-log-tab-active" : "admin-log-tab"} onClick={() => setSource("sensitive")}>Sensitive-read log</button>
      </div>
      <div className="admin-table-toolbar">
        <div><strong>{total.toLocaleString()}</strong><span> {source === "audit" ? "audit records" : "sensitive reads"}</span></div>
        <div className="admin-filter-controls">
          <label className="search-box"><Icon name="search" size={14} /><input aria-label="Search audit logs" placeholder="Search actor, action or category" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <label className="admin-filter-label">From<input aria-label="Audit date from" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
          <label className="admin-filter-label">To<input aria-label="Audit date to" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
        </div>
      </div>
      {loading ? <div className="admin-table-state" role="status"><span className="loading-spinner" />Loading {source === "audit" ? "audit activity" : "sensitive-read records"}…</div>
        : rows.length === 0 ? <div className="admin-table-state"><strong>No matching log records</strong><span>Activity will appear here as protected changes and reads are recorded.</span></div>
          : <div className="table-scroll"><table className="admin-data-table"><thead>{source === "audit" ? <tr><th>Time</th><th>User</th><th>Action</th><th>Module</th><th>Record type</th><th>Result</th><th>Purpose / context</th></tr> : <tr><th>Time</th><th>User</th><th>Data category</th><th>Record type</th><th>Record ID</th><th>Purpose</th></tr>}</thead><tbody>{rows.map((row) => {
            const time = row.created_at || row.timestamp;
            return source === "audit" ? <tr key={row.id}>
              <td>{formatAdminDate(time)}</td><td><strong>{row.user_name || "Unknown user"}</strong><small>{row.user_id || "No user ID"}</small></td><td>{row.action || "—"}</td><td>{row.module || "System"}</td><td>{row.record_type || "—"}</td><td><AdminStatus tone={row.result === "Success" ? "success" : row.result === "Failure" ? "danger" : "warning"}>{row.result || "Unknown"}</AdminStatus></td><td className="admin-event-description">{row.purpose || row.context || "—"}</td>
            </tr> : <tr key={row.id}>
              <td>{formatAdminDate(time)}</td><td><strong>{row.user_name || "Unknown user"}</strong><small>{row.user_id || "No user ID"}</small></td><td><AdminStatus tone="warning">{row.data_category || "Sensitive"}</AdminStatus></td><td>{row.record_type || "—"}</td><td><code>{row.record_id || "—"}</code></td><td>{row.purpose || "Not provided"}</td>
            </tr>;
          })}</tbody></table></div>}
      {!loading && <AdminPagination page={page} total={total} onPage={setPage} />}
    </section>
  </div>;
}
