import { useCallback, useEffect, useState, type FormEvent } from "react";
import { canAccessModule, canWriteModule } from "@/app/modules";
import { supabase } from "@/core/config";
import { useNetworkStatus } from "@/core/monitoring/useNetworkStatus";
import { useToast } from "@/core/notifications/ToastProvider";
import { useAuth } from "@/modules/core/auth/context";
import SearchableSelect from "@/components/forms/SearchableSelect";

interface DeathRecord {
  id: string;
  employee_id: string;
  reported_death_date: string | null;
  confirmed_death_date: string | null;
  verification_status: "Pending" | "FirstVerification" | "SecondVerification" | "Passed" | "Failed";
  reporter_id: string;
  first_verifier_user_id: string | null;
  second_verifier_user_id: string | null;
  approval_date: string | null;
}

interface EmployeeChoice {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
}

const PAGE_SIZE = 25;
const RECORD_COLUMNS = [
  "id", "employee_id", "reported_death_date", "confirmed_death_date",
  "verification_status", "reporter_id", "first_verifier_user_id",
  "second_verifier_user_id", "approval_date",
].join(",");

function safeError(error: unknown) {
  if (error && typeof error === "object" && "code" in error && error.code === "42501") {
    return "This action needs a different authorized person or a higher access level.";
  }
  if (error && typeof error === "object" && "code" in error && error.code === "22023") {
    return "The report details or current workflow state are not valid.";
  }
  return "The death record operation could not be completed. Check your access and try again.";
}

function dateInputValue(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

export default function DeathRecordsPage() {
  const { roles, session } = useAuth();
  const online = useNetworkStatus();
  const showToast = useToast();
  const canView = canAccessModule("/death", roles);
  const canSubmit = canWriteModule("/death", roles);
  const [rows, setRows] = useState<DeathRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeChoice[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [reportedDate, setReportedDate] = useState("");
  const [place, setPlace] = useState("");
  const [cause, setCause] = useState("");
  const [certificate, setCertificate] = useState("");
  const [approvalRecord, setApprovalRecord] = useState("");
  const [confirmedDate, setConfirmedDate] = useState("");
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadRecords = useCallback(async () => {
    if (!canView || !supabase) {
      setRows([]);
      setCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const { data, error: queryError, count: total } = await supabase
      .from("employee_death_records")
      .select(RECORD_COLUMNS, { count: "exact" })
      .order("createdAt", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (queryError) {
      setRows([]);
      setCount(0);
      setError("Death records could not be loaded. Check your access and try again.");
      setLoading(false);
      return;
    }

    const records = (data ?? []) as unknown as DeathRecord[];
    if (records.length && session?.user.id) {
      const { error: auditError } = await supabase.from("sensitive_read_log").insert(records.map((record) => ({
        user_id: session.user.id,
        employee_id: record.employee_id,
        record_id: record.id,
        record_type: "employee_death_records",
        data_category: "CAUSE_OF_DEATH",
        purpose: "Viewed death verification records",
        accessed_fields: RECORD_COLUMNS.split(","),
      })));
      if (auditError) {
        setRows([]);
        setCount(0);
        setError("Death records were not displayed because the access log could not be written.");
        setLoading(false);
        return;
      }
    }
    setRows(records);
    setCount(total ?? 0);
    setLoading(false);
  }, [canView, page, session?.user.id]);

  useEffect(() => { void loadRecords(); }, [loadRecords]);

  useEffect(() => {
    let active = true;
    async function loadEmployees() {
      if (!canSubmit || !supabase) return;
      const { data, error: rpcError } = await supabase.rpc("get_employee_directory");
      if (!active || rpcError || !Array.isArray(data)) return;
      setEmployees(data.filter((item): item is EmployeeChoice => Boolean(
        item && typeof item === "object" &&
        "id" in item && "employee_number" in item && "first_name" in item && "last_name" in item,
      )));
    }
    void loadEmployees();
    return () => { active = false; };
  }, [canSubmit]);

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!online || !canSubmit || !supabase) return;
    if (!employeeId) {
      setError("Select an employee from the list before submitting the report.");
      return;
    }
    setSaving(true);
    setError("");
    const { error: rpcError } = await supabase.rpc("submit_employee_death_report", {
      p_employee_id: employeeId,
      p_reported_death_date: reportedDate ? `${reportedDate}T00:00:00.000Z` : null,
      p_place_of_death: place,
      p_cause_of_death: cause,
      p_death_certificate_reference: certificate,
      p_supporting_document_id: null,
    });
    if (rpcError) setError(safeError(rpcError));
    else {
      setEmployeeId("");
      setReportedDate("");
      setPlace("");
      setCause("");
      setCertificate("");
      showToast("Death report submitted for independent verification.", "success");
      await loadRecords();
    }
    setSaving(false);
  }

  async function verifyRecord(recordId: string) {
    if (!online || !canSubmit || !supabase) return;
    setSaving(true);
    setError("");
    const { error: rpcError } = await supabase.rpc("verify_employee_death_report", { p_record_id: recordId });
    if (rpcError) setError(safeError(rpcError));
    else {
      showToast("Verification step recorded.", "success");
      await loadRecords();
    }
    setSaving(false);
  }

  async function approveRecord(recordId: string, date: string) {
    if (!online || !canSubmit || !supabase || !date) return;
    setSaving(true);
    setError("");
    const { error: rpcError } = await supabase.rpc("approve_employee_death_report", {
      p_record_id: recordId,
      p_confirmed_death_date: `${date}T00:00:00.000Z`,
    });
    if (rpcError) setError(safeError(rpcError));
    else {
      setApprovalRecord("");
      setConfirmedDate("");
      showToast("Death report approved and employee status updated.", "success");
      await loadRecords();
    }
    setSaving(false);
  }

  if (!canView) return <div className="page-content"><div className="empty-state"><h2>Access restricted</h2></div></div>;
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const employeeLabels = new Map(employees.map((employee) => [employee.id, `${employee.employee_number} · ${employee.first_name} ${employee.last_name}`]));

  return (
    <div className="page-content">
      <header className="page-heading"><h1>Death verification</h1></header>
      {!online && <div className="notice notice-warning" role="status">You are offline. Death reports and approvals are not queued.</div>}
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {canSubmit && <section className="panel document-upload-panel">
        <h2>Submit a death report</h2>
        <form className="document-upload-form" onSubmit={(event) => void submitReport(event)}>
          <div className="document-upload-fields">
            <label className="field">Employee<SearchableSelect id="death-employee" value={employeeId} options={employees.map((employee) => ({ value: employee.id, label: employeeLabels.get(employee.id) ?? `${employee.first_name} ${employee.last_name}` }))} placeholder="Search employees by name or number…" emptyLabel="No employees are available" required disabled={!online || saving} onChange={setEmployeeId} /></label>
            <label className="field">Reported date<input type="date" value={reportedDate} onChange={(event) => setReportedDate(event.target.value)} disabled={!online || saving} /></label>
            <label className="field">Place of death<input maxLength={300} value={place} onChange={(event) => setPlace(event.target.value)} disabled={!online || saving} /></label>
            <label className="field">Certificate reference<input maxLength={200} value={certificate} onChange={(event) => setCertificate(event.target.value)} disabled={!online || saving} /></label>
          </div>
          <label className="field">Cause of death<textarea maxLength={4000} rows={3} value={cause} onChange={(event) => setCause(event.target.value)} disabled={!online || saving} /></label>
          <div className="document-upload-footer"><button type="submit" className="button button-primary" disabled={!online || saving || !employeeId}>{saving ? "Submitting…" : "Submit report"}</button></div>
        </form>
      </section>}
      <section className="panel records-panel">
        <div className="records-toolbar"><div><strong>{count.toLocaleString()}</strong><span> death reports</span></div><button className="button button-secondary button-small" onClick={() => void loadRecords()} disabled={loading}>Refresh</button></div>
        {loading ? <div className="table-state" role="status">Loading records…</div> : rows.length ? <>
          <div className="table-scroll" role="region" aria-label="Death record cases table. Scroll horizontally to view all columns." tabIndex={0}><table><thead><tr><th>Employee</th><th>Reported</th><th>Status</th><th>Approval</th>{canSubmit && <th>Action</th>}</tr></thead>
            <tbody>{rows.map((record) => <tr key={record.id}>
              <td>{employeeLabels.get(record.employee_id) ?? record.employee_id}</td>
              <td>{record.reported_death_date ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(record.reported_death_date)) : "—"}</td>
              <td>{record.verification_status}</td>
              <td>{record.approval_date ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(record.approval_date)) : "Pending"}</td>
              {canSubmit && <td>{record.verification_status === "Pending" || record.verification_status === "FirstVerification" ? <button className="text-button" onClick={() => void verifyRecord(record.id)} disabled={!online || saving}>Record verification</button> : record.verification_status === "SecondVerification" ? approvalRecord === record.id ? <div className="inline-approval"><input aria-label="Confirmed death date" type="date" required value={confirmedDate} onChange={(event) => setConfirmedDate(event.target.value)} disabled={!online || saving} /><button className="text-button" onClick={() => void approveRecord(record.id, confirmedDate)} disabled={!online || saving || !confirmedDate}>Confirm approval</button><button className="text-button" onClick={() => setApprovalRecord("")} disabled={saving}>Cancel</button></div> : <button className="text-button" onClick={() => { setApprovalRecord(record.id); setConfirmedDate(dateInputValue(record.reported_death_date)); }} disabled={!online || saving}>Approve</button> : "—"}</td>}
            </tr>)}</tbody></table></div>
          <div className="pagination-bar"><span>Page {page + 1} of {pageCount}</span><div><button className="button button-secondary button-small" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0}>Previous</button><button className="button button-secondary button-small" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={page >= pageCount - 1}>Next</button></div></div>
        </> : <div className="empty-state"><h2>No death reports</h2></div>}
      </section>
    </div>
  );
}
