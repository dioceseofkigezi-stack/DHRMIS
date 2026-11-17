import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { canAccessModule } from "@/app/modules";
import { supabase } from "@/core/config";
import { useAuth } from "@/modules/core/auth/context";
import { ADMIN_PAGE_SIZE, AdminNotice, AdminPageHeader, AdminPagination, AdminStatus, adminErrorMessage, formatAdminDate } from "./AdminConsoleShared";

interface ScopeAccess {
  id: string;
  user_id: string | null;
  email: string | null;
  full_name: string | null;
  scope_type: string;
  scope_id: string;
  scope_name: string;
  purpose: string | null;
  isactive: boolean | null;
  istemporary: boolean | null;
  expiresat: string | null;
  assignmentdate: string | null;
  total_count: number;
}

const scopeTypes = ["PersonnelDomain", "Board", "Department", "Institution", "Archdeaconry", "Parish", "LocalChurch"];

export default function ScopeAdministrationPage() {
  const { roles } = useAuth();
  const canView = canAccessModule("/admin/scopes", roles);
  const [rows, setRows] = useState<ScopeAccess[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedSearch(search.trim()); setPage(0); }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => { setPage(0); }, [typeFilter, activeFilter]);

  const loadScopes = useCallback(async () => {
    if (!canView) { setRows([]); setTotal(0); setLoading(false); return; }
    if (!supabase) { setRows([]); setTotal(0); setError("The system data service is not configured."); setLoading(false); return; }
    setLoading(true);
    setError("");
    const { data, error: queryError } = await supabase.rpc("admin_list_scope_access", {
      search_text: debouncedSearch || null,
      type_filter: typeFilter || null,
      active_filter: activeFilter === "" ? null : activeFilter === "active",
      page_size: ADMIN_PAGE_SIZE,
      page_offset: page * ADMIN_PAGE_SIZE,
    });
    if (queryError) {
      setRows([]);
      setTotal(0);
      setError(adminErrorMessage(queryError, "Organizational access assignments could not be loaded."));
    } else {
      const records = (data ?? []) as ScopeAccess[];
      setRows(records);
      setTotal(Number(records[0]?.total_count ?? 0));
    }
    setLoading(false);
  }, [activeFilter, canView, debouncedSearch, page, typeFilter]);

  useEffect(() => { void loadScopes(); }, [loadScopes]);

  if (!canView) return <div className="page-content"><div className="empty-state"><h2>Access restricted</h2></div></div>;
  return <div className="page-content admin-console-page">
    <AdminPageHeader title="Organizational access" description="Review account scopes. A user’s primary personnel scope follows their assigned role and is synchronized by the database." icon="target" actions={<Link className="button button-primary" to="/admin/users">Manage account roles</Link>} />
    {error && <AdminNotice>{error}</AdminNotice>}
    <section className="panel admin-directory-panel" aria-label="Organizational scope assignments">
      <div className="admin-table-toolbar">
        <div><strong>{total.toLocaleString()}</strong><span> scope assignments</span></div>
        <div className="admin-filter-controls">
          <label className="search-box"><input aria-label="Search organizational scopes" placeholder="Search user, scope or type" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <label className="admin-filter-label">Scope type<select aria-label="Filter by scope type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="">All types</option>{scopeTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label className="admin-filter-label">Status<select aria-label="Filter by scope status" value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          <button className="button button-secondary button-small" type="button" onClick={() => void loadScopes()} disabled={loading}>Refresh</button>
        </div>
      </div>
      {loading ? <div className="admin-table-state" role="status"><span className="loading-spinner" />Loading organizational access…</div>
        : rows.length === 0 ? <div className="admin-table-state"><strong>No matching scope assignments</strong></div>
          : <div className="table-scroll"><table className="admin-data-table"><thead><tr><th>Account</th><th>Scope</th><th>Purpose</th><th>Assignment type</th><th>Status</th><th>Expiry</th><th>Assigned</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}>
            <td><strong>{row.full_name || "Name not provided"}</strong><small>{row.email || row.user_id || "Unknown account"}</small></td>
            <td><strong>{row.scope_name}</strong><small>{row.scope_type} · <code>{row.scope_id}</code></small></td>
            <td>{row.purpose || "—"}</td>
            <td>{row.istemporary ? "Temporary" : "Role-derived"}</td>
            <td><AdminStatus tone={row.isactive ? "success" : "warning"}>{row.isactive ? "Active" : "Inactive"}</AdminStatus></td>
            <td>{formatAdminDate(row.expiresat)}</td>
            <td>{formatAdminDate(row.assignmentdate)}</td>
            <td>{row.email && <Link className="text-button" to={`/admin/users?search=${encodeURIComponent(row.email)}`} aria-label={`Manage access for ${row.email}`}>Manage user </Link>}</td>
          </tr>)}</tbody></table></div>}
      {!loading && <AdminPagination page={page} total={total} onPage={setPage} />}
    </section>
  </div>;
}
