import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { canAccessModule } from "@/app/modules";
import { supabase } from "@/core/config";
import { useAuth } from "@/modules/core/auth/context";
import { AdminNotice, AdminStatus, adminErrorMessage } from "./AdminConsoleShared";

interface RoleRecord { role_code: string; role_name: string; scope_type: string; scope_code: string | null; is_system_role: boolean; is_active: boolean }
interface PermissionRecord { permission_code: string; permission_name: string; permission_group: string; is_sensitive: boolean }
interface RolePermissionRecord { role_code: string; permission_code: string }

export default function RolePermissionsPage() {
  const { roles: sessionRoles } = useAuth();
  const canView = canAccessModule("/admin/roles", sessionRoles);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);
  const [assignments, setAssignments] = useState<RolePermissionRecord[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadCatalog = useCallback(async () => {
    if (!canView) { setLoading(false); return; }
    if (!supabase) { setError("The system data service is not configured."); setLoading(false); return; }
    setLoading(true);
    setError("");
    const [roleResult, permissionResult, assignmentResult] = await Promise.all([
      supabase.from("roles").select("role_code,role_name,scope_type,scope_code,is_system_role,is_active").order("role_name"),
      supabase.from("permissions").select("permission_code,permission_name,permission_group,is_sensitive").order("permission_group").order("permission_name"),
      supabase.from("role_permissions").select("role_code,permission_code"),
    ]);
    const firstError = roleResult.error || permissionResult.error || assignmentResult.error;
    if (firstError) {
      setRoles([]); setPermissions([]); setAssignments([]);
      setError(adminErrorMessage(firstError, "The role and permission catalog could not be loaded."));
    } else {
      setRoles((roleResult.data ?? []) as RoleRecord[]);
      setPermissions((permissionResult.data ?? []) as PermissionRecord[]);
      setAssignments((assignmentResult.data ?? []) as RolePermissionRecord[]);
    }
    setLoading(false);
  }, [canView]);

  useEffect(() => { void loadCatalog(); }, [loadCatalog]);

  const roleRows = useMemo(() => roles.filter((role) => {
    const needle = search.trim().toLowerCase();
    const matchesSearch = !needle || role.role_name.toLowerCase().includes(needle) || role.role_code.toLowerCase().includes(needle);
    const matchesRole = !roleFilter || role.role_code === roleFilter;
    return matchesSearch && matchesRole;
  }), [roleFilter, roles, search]);
  const permissionRows = useMemo(() => permissions.filter((permission) => {
    const needle = search.trim().toLowerCase();
    const matchesSearch = !needle || permission.permission_name.toLowerCase().includes(needle) || permission.permission_code.toLowerCase().includes(needle);
    return matchesSearch && (!groupFilter || permission.permission_group === groupFilter);
  }), [groupFilter, permissions, search]);
  const groups = [...new Set(permissions.map((permission) => permission.permission_group))];

  if (!canView) return <div className="page-content"><div className="empty-state"><h2>Access restricted</h2></div></div>;
  return <div className="page-content admin-console-page roles-permissions-page">
    <header className="page-heading admin-page-heading roles-page-heading">
      <div className="roles-page-heading-copy">
        <p className="eyebrow">ACCESS CONTROL</p>
        <h1>Roles &amp; permissions</h1>
        <p className="roles-page-intro">Review each role’s scope and the permissions it grants.</p>
      </div>
      <div className="admin-heading-actions"><Link className="button button-primary" to="/admin/users">Manage user roles</Link></div>
    </header>
    {error && <AdminNotice>{error}</AdminNotice>}
    <section className="panel admin-directory-panel roles-catalog-panel" aria-label="Role and permission catalog">
      <div className="admin-table-toolbar">
        <div><strong>{roles.length}</strong><span> roles · </span><strong>{permissions.length}</strong><span> permissions</span></div>
        <div className="admin-filter-controls">
          <label className="search-box"><input aria-label="Search roles and permissions" placeholder="Search role or permission" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <label className="admin-filter-label">Role<select aria-label="Filter roles" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="">All roles</option>{roles.map((role) => <option key={role.role_code} value={role.role_code}>{role.role_name}</option>)}</select></label>
          <label className="admin-filter-label">Permission group<select aria-label="Filter permission group" value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}><option value="">All groups</option>{groups.map((group) => <option key={group}>{group}</option>)}</select></label>
          <button className="button button-secondary button-small" type="button" onClick={() => void loadCatalog()} disabled={loading}>Refresh</button>
        </div>
      </div>
      {loading ? <div className="admin-table-state" role="status"><span className="loading-spinner" />Loading role catalog…</div> : roles.length === 0 ? <div className="admin-table-state"><strong>No role catalog available</strong></div> : <>
        <div className="admin-role-grid">{roleRows.map((role) => {
          const rolePermissions = assignments.filter((assignment) => assignment.role_code === role.role_code)
            .map((assignment) => permissions.find((permission) => permission.permission_code === assignment.permission_code))
            .filter((permission): permission is PermissionRecord => Boolean(permission))
            .filter((permission) => !search.trim() || permission.permission_name.toLowerCase().includes(search.trim().toLowerCase()) || permission.permission_code.toLowerCase().includes(search.trim().toLowerCase()));
          return <article className={`admin-role-card${role.role_code === "SUPER_SYSTEM_ADMIN" ? " admin-role-card-platform" : ""}`} key={role.role_code}>
            <header><div><h3>{role.role_name}</h3><code>{role.role_code}</code></div><AdminStatus tone={role.is_active ? "success" : "warning"}>{role.is_active ? "Active" : "Inactive"}</AdminStatus></header>
            <p className="admin-role-scope">{role.scope_type === "SYSTEM" ? "System administration" : `Assigned scope: ${role.scope_code || "not set"}`}</p>
            <div className="admin-role-permission-heading"><strong>Permissions</strong><span>{rolePermissions.length} assigned</span></div>
            <div className="admin-permission-chips" aria-label={`${role.role_name} permissions`}>
              {rolePermissions.length ? rolePermissions.map((permission) => <span className={permission.is_sensitive ? "admin-permission-chip admin-permission-sensitive" : "admin-permission-chip"} key={permission.permission_code} title={permission.permission_code}>{permission.permission_name}</span>) : <span className="admin-muted-state">No matching permissions</span>}
            </div>
            <footer>{rolePermissions.length} assigned permission{rolePermissions.length === 1 ? "" : "s"}{role.role_code === "SUPER_SYSTEM_ADMIN" && <span> · reserved platform access</span>}</footer>
          </article>;
        })}</div>
        {roleRows.length === 0 && <div className="admin-table-state"><strong>No roles match</strong><span>Change the role filter or search phrase.</span></div>}
        <div className="admin-permission-catalog">
          <div className="panel-heading"><h2>System permissions</h2><span className="panel-badge">{permissionRows.length} shown</span></div>
          {permissionRows.length === 0 ? <div className="admin-table-state"><strong>No permissions match</strong><span>Change the group filter or search phrase.</span></div> : <div className="table-scroll"><table className="admin-data-table"><thead><tr><th>Permission</th><th>Code</th><th>Group</th><th>Sensitivity</th><th>Assigned roles</th></tr></thead><tbody>{permissionRows.map((permission) => <tr key={permission.permission_code}>
            <td><strong>{permission.permission_name}</strong></td><td><code>{permission.permission_code}</code></td><td>{permission.permission_group}</td><td>{permission.is_sensitive ? <AdminStatus tone="warning">Sensitive</AdminStatus> : <AdminStatus>Standard</AdminStatus>}</td><td>{assignments.filter((assignment) => assignment.permission_code === permission.permission_code).map((assignment) => roles.find((role) => role.role_code === assignment.role_code)?.role_name ?? assignment.role_code).join(", ") || "None"}</td>
          </tr>)}</tbody></table></div>}
        </div>
      </>}
    </section>
  </div>;
}
