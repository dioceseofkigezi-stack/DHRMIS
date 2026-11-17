import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { canAccessModule } from "@/app/modules";
import ConfirmDialog from "@/components/feedback/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import { supabase } from "@/core/config";
import { useToast } from "@/core/notifications/ToastProvider";
import { useNetworkStatus } from "@/core/monitoring/useNetworkStatus";
import { useAuth } from "@/modules/core/auth/context";
import UserRegistrationPanel from "./UserRegistrationPanel";
import { ADMIN_PAGE_SIZE, AdminNotice, AdminPageHeader, AdminPagination, AdminStatus, adminErrorMessage, formatAdminDate } from "./AdminConsoleShared";

interface AdminAccount {
  assignment_id: string | null;
  user_id: string;
  email: string | null;
  full_name: string | null;
  role_code: string | null;
  isactive: boolean | null;
  issuspended: boolean | null;
  accountexpiry: string | null;
  lockeduntil: string | null;
  lastloginat: string | null;
  createdat: string | null;
  email_confirmed_at: string | null;
  account_status: string;
  total_count: number;
}

interface RoleOption { role_code: string; role_name: string }
type ActionKind = "activate" | "deactivate" | "suspend" | "change-role" | "assign-role" | "password-reset";
interface PendingAction { account: AdminAccount; action: ActionKind; roleCode?: string }

const statusOptions = ["Active", "Suspended", "Inactive", "Expired", "Locked", "Pending", "Unassigned"];

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "Active") return "success";
  if (status === "Suspended" || status === "Locked" || status === "Expired") return "danger";
  if (status === "Inactive" || status === "Pending") return "warning";
  return "neutral";
}

function actionCopy(action: ActionKind, account: AdminAccount, roleName?: string) {
  const name = account.full_name || account.email || "this account";
  switch (action) {
    case "activate": return { title: "Activate account?", confirm: "Activate account", body: `Restore the ${account.role_code ?? "unassigned"} access for ${name}. This also clears any account lock.` };
    case "deactivate": return { title: "Deactivate account?", confirm: "Deactivate account", body: `Block role-based access for ${name}. This will deactivate its assigned organizational scope.` };
    case "suspend": return { title: "Suspend account?", confirm: "Suspend account", body: `Temporarily block access for ${name} and deactivate its assigned scope.` };
    case "change-role": return { title: "Change account role?", confirm: "Change role", body: `Change ${name}'s role to ${roleName}. The database will update the role-derived organizational scope.` };
    case "assign-role": return { title: "Assign account role?", confirm: "Assign role", body: `Assign ${roleName} to ${name}. The database will create the role-derived organizational scope.` };
    case "password-reset": return { title: "Send password reset email?", confirm: "Send reset email", body: `Send a secure password reset link to ${account.email || "this account's email address"}. The user sets their own new password; the administrator will not see it.` };
  }
}

export default function UserAdministrationPage() {
  const { roles, session } = useAuth();
  const canView = canAccessModule("/admin/users", roles);
  const [searchParams] = useSearchParams();
  const online = useNetworkStatus();
  const toast = useToast();
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedSearch(search.trim()); setPage(0); }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => { setPage(0); }, [roleFilter, statusFilter]);

  const loadAccounts = useCallback(async () => {
    if (!canView) { setAccounts([]); setTotal(0); setLoading(false); return; }
    if (!supabase) { setAccounts([]); setTotal(0); setError("The system data service is not configured."); setLoading(false); return; }
    setLoading(true);
    setError("");
    const [accountResult, roleResult] = await Promise.all([
      supabase.rpc("admin_list_user_access", {
        search_text: debouncedSearch || null,
        role_filter: roleFilter || null,
        status_filter: statusFilter || null,
        page_size: ADMIN_PAGE_SIZE,
        page_offset: page * ADMIN_PAGE_SIZE,
      }),
      supabase.from("roles").select("role_code,role_name").eq("is_active", true).order("role_name"),
    ]);
    if (accountResult.error) {
      setError(adminErrorMessage(accountResult.error, "Account access could not be loaded. Check the database migration and try again."));
      setAccounts([]);
      setTotal(0);
    } else {
      const rows = (accountResult.data ?? []) as AdminAccount[];
      setAccounts(rows);
      setTotal(Number(rows[0]?.total_count ?? 0));
    }
    if (roleResult.error) {
      setError((current) => current || adminErrorMessage(roleResult.error, "The active role catalog could not be loaded."));
      setRoleOptions([]);
    } else setRoleOptions((roleResult.data ?? []) as RoleOption[]);
    setLoading(false);
  }, [canView, debouncedSearch, page, roleFilter, statusFilter]);

  useEffect(() => { void loadAccounts(); }, [loadAccounts]);

  function requestAction(account: AdminAccount, action: ActionKind, roleCode?: string) {
    if (!online || account.user_id === session?.user.id) return;
    setPending({ account, action, roleCode });
  }

  async function executePendingAction() {
    if (!pending || !supabase || !online) return;
    const { account, action, roleCode } = pending;
    setBusy(true);
    setError("");
    try {
      if (action === "password-reset") {
        if (!account.email) throw new Error("This account has no email address for password recovery.");
        if (!session?.user.id) throw new Error("Your active administrator session could not be verified.");
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(account.email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (resetError) throw resetError;
        const { error: securityLogError } = await supabase.from("security_event").insert({
          user_id: session.user.id,
          event_type: "ADMIN_PASSWORD_RESET_REQUESTED",
          severity: "Informational",
          component: "Account security",
          description: "The platform administrator requested a password reset email for another account.",
          details: { target_user_id: account.user_id },
        });
        if (securityLogError) {
          setError("The password reset email was sent, but its security event could not be recorded.");
          toast("Password reset email sent, but security event logging failed.", "info");
        } else toast("Password reset email sent.", "success");
      } else if (action === "assign-role") {
        if (!roleCode) throw new Error("Choose an active role first.");
        const { error: assignError } = await supabase.from("user_roles").insert({
          user_id: account.user_id,
          role_code: roleCode,
          permissions: [],
          scopes: [],
          isactive: true,
          issuspended: false,
        });
        if (assignError) throw assignError;
        toast("Role assigned and organizational scope synchronized.", "success");
      } else {
        if (!account.assignment_id) throw new Error("This account does not have an editable role assignment.");
        const update = action === "activate"
          ? { isactive: true, issuspended: false, lockeduntil: null, ...(account.account_status === "Expired" ? { accountexpiry: null } : {}) }
          : action === "deactivate"
            ? { isactive: false, issuspended: false }
            : action === "suspend"
              ? { issuspended: true }
              : { role_code: roleCode };
        if (action === "change-role" && !roleCode) throw new Error("Choose an active role first.");
        const { data, error: updateError } = await supabase.from("user_roles").update(update)
          .eq("id", account.assignment_id).select("id").maybeSingle();
        if (updateError) throw updateError;
        if (!data) throw new Error("No account access changed. Refresh and check the account status.");
        const success = action === "activate" ? "Account activated and unlocked."
          : action === "deactivate" ? "Account deactivated."
            : action === "suspend" ? "Account suspended."
              : "Role updated and organizational scope synchronized.";
        toast(success, "success");
      }
      setPending(null);
      await loadAccounts();
    } catch (reason) {
      setError(adminErrorMessage(reason, reason instanceof Error ? reason.message : "The account change could not be completed."));
    } finally {
      setBusy(false);
    }
  }

  if (!canView) return <div className="page-content"><div className="empty-state"><h2>Access restricted</h2><p>Only the Super/System Administrator can manage user access.</p></div></div>;
  const confirmation = pending ? actionCopy(pending.action, pending.account, roleOptions.find((role) => role.role_code === pending.roleCode)?.role_name ?? pending.roleCode) : null;

  return <div className="page-content admin-console-page">
    <AdminPageHeader title="User access" description="Invite users and manage their single active role, account status and password recovery." icon="people" actions={<button className="button button-secondary" type="button" onClick={() => void loadAccounts()} disabled={loading}><Icon name="refresh" size={14} />Refresh</button>} />
    {error && <AdminNotice>{error}</AdminNotice>}
    {!online && <AdminNotice tone="warning">You are offline. Account changes are not available.</AdminNotice>}
    <section className="panel admin-directory-panel" aria-label="User account directory">
      <div className="admin-table-toolbar">
        <div><strong>{total.toLocaleString()}</strong><span> managed accounts</span></div>
        <div className="admin-filter-controls">
          <label className="search-box"><Icon name="search" size={14} /><input aria-label="Search users" placeholder="Search name, email or user ID" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <label className="admin-filter-label">Role<select aria-label="Filter by role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="">All roles</option><option value="UNASSIGNED">Unassigned</option>{roleOptions.map((role) => <option key={role.role_code} value={role.role_code}>{role.role_name}</option>)}</select></label>
          <label className="admin-filter-label">Status<select aria-label="Filter by account status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></label>
        </div>
      </div>
      {loading ? <div className="admin-table-state" role="status"><span className="loading-spinner" />Loading user accounts…</div>
        : accounts.length === 0 ? <div className="admin-table-state"><strong>No matching accounts</strong><span>Try clearing a filter or invite a user below.</span></div>
          : <div className="table-scroll"><table className="admin-data-table"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Last sign in</th><th>Account created</th><th>Actions</th></tr></thead><tbody>
            {accounts.map((account) => {
              const ownAccount = account.user_id === session?.user.id;
              const roleDraft = roleDrafts[account.user_id] ?? account.role_code ?? "";
              const roleName = roleOptions.find((role) => role.role_code === account.role_code)?.role_name ?? account.role_code ?? "No role assigned";
              return <tr key={account.user_id}>
                <td><strong>{account.full_name || "Name not provided"}</strong><small>{account.email || account.user_id}</small><code>{account.user_id}</code></td>
                <td><span className="admin-role-name">{roleName}</span>{account.accountexpiry && <small>Expires {formatAdminDate(account.accountexpiry)}</small>}</td>
                <td><AdminStatus tone={statusTone(account.account_status)}>{account.account_status}</AdminStatus>{ownAccount && <small>Your account</small>}</td>
                <td>{formatAdminDate(account.lastloginat)}</td>
                <td>{formatAdminDate(account.createdat)}</td>
                <td className="admin-row-actions">
                  <div className="admin-role-edit">
                    <select aria-label={`Choose role for ${account.email || account.user_id}`} value={roleDraft} onChange={(event) => setRoleDrafts((current) => ({ ...current, [account.user_id]: event.target.value }))} disabled={ownAccount || !online}>
                      <option value="">Select role</option>{roleOptions.map((role) => <option value={role.role_code} key={role.role_code}>{role.role_name}</option>)}
                    </select>
                    {!account.role_code && roleDraft && <button className="text-button" type="button" disabled={ownAccount || !online} onClick={() => requestAction(account, "assign-role", roleDraft)}>Assign</button>}
                    {account.role_code && roleDraft && roleDraft !== account.role_code && <button className="text-button" type="button" disabled={ownAccount || !online} onClick={() => requestAction(account, "change-role", roleDraft)}>Change role</button>}
                  </div>
                  {account.assignment_id && account.account_status === "Active" ? <>
                    <button className="text-button" type="button" disabled={ownAccount || !online} onClick={() => requestAction(account, "suspend")}>Suspend</button>
                    <button className="text-button admin-danger-link" type="button" disabled={ownAccount || !online} onClick={() => requestAction(account, "deactivate")}>Deactivate</button>
                  </> : account.assignment_id && account.account_status === "Pending" ? <>
                    <span className="admin-muted-state">Invitation pending</span>
                    <button className="text-button admin-danger-link" type="button" disabled={ownAccount || !online} onClick={() => requestAction(account, "deactivate")}>Deactivate</button>
                  </> : account.assignment_id ? <button className="text-button" type="button" disabled={ownAccount || !online} onClick={() => requestAction(account, "activate")}>Activate / unlock</button> : null}
                  <button className="text-button" type="button" disabled={!account.email || ownAccount || !online || account.account_status === "Pending"} onClick={() => requestAction(account, "password-reset")} title={account.account_status === "Pending" ? "The invitation must be accepted before password recovery." : undefined}>{account.account_status === "Pending" ? "Awaiting confirmation" : "Password reset"}</button>
                </td>
              </tr>;
            })}
          </tbody></table></div>}
      {!loading && <AdminPagination page={page} total={total} onPage={setPage} />}
    </section>
    <UserRegistrationPanel online={online} onSuccess={() => void loadAccounts()} />
    {pending && confirmation && <ConfirmDialog title={confirmation.title} confirmLabel={confirmation.confirm} destructive={pending.action === "deactivate" || pending.action === "suspend"} busy={busy} onCancel={() => setPending(null)} onConfirm={() => void executePendingAction()}>
      <p>{confirmation.body}</p>
      {pending.action !== "password-reset" && <p className="admin-confirm-detail"><strong>Account:</strong> {pending.account.email || pending.account.user_id}<br /><strong>Role:</strong> {pending.action === "change-role" || pending.action === "assign-role" ? roleOptions.find((role) => role.role_code === pending.roleCode)?.role_name : pending.account.role_code}</p>}
    </ConfirmDialog>}
  </div>;
}
