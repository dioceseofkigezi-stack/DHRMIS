import { useCallback, useEffect, useMemo, useState, type DragEvent, type FormEvent } from "react";
import { supabase } from "@/core/config";
import { canAccessModule, canWriteModule } from "@/app/modules";
import DataTable from "@/components/tables/DataTable";
import { useToast } from "@/core/notifications/ToastProvider";
import { useNetworkStatus } from "@/core/monitoring/useNetworkStatus";
import { auditService } from "@/core/audit/service";
import { createDocumentDownloadUrl, uploadDocument, validateDocumentFile } from "@/core/documents/documentService";
import { useAuth } from "@/modules/core/auth/context";
import SearchableSelect from "@/components/forms/SearchableSelect";

interface DocumentRecord extends Record<string, unknown> {
  id: string;
  employee_id: string | null;
  document_type: string;
  original_file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  access_level: string;
  created_at: string;
  expires_at: string | null;
  version: number;
}
interface EmployeeChoice { id: string; employee_number: string; first_name: string; last_name: string }
const PAGE_SIZE = 25;

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function safeError(error: unknown) {
  if (error instanceof Error && /50 mb|pdf, image|empty|could not be saved|removed|administrator cleanup|sign in again/i.test(error.message)) return error.message;
  if (error && typeof error === "object" && "code" in error && error.code === "42501") return "Your account is not allowed to manage this document.";
  return "The document operation could not be completed. Check your access and try again.";
}

export default function DocumentManagerPage() {
  const { roles, session } = useAuth();
  const online = useNetworkStatus();
  const showToast = useToast();
  const [rows, setRows] = useState<DocumentRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeChoice[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [accessLevel, setAccessLevel] = useState<"Private" | "DiocesanHR" | "BoardLevel">("Private");
  const [file, setFile] = useState<File | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState("");
  const [error, setError] = useState("");
  const canView = canAccessModule("/documents", roles);
  const canUpload = canWriteModule("/documents", roles);

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedSearch(search.trim()); setPage(0); }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadDocuments = useCallback(async () => {
    if (!canView || !supabase) { setLoading(false); return; }
    setLoading(true);
    setError("");
    let query = supabase.from("documents").select("id,employee_id,document_type,original_file_name,file_size,mime_type,storage_path,access_level,created_at,expires_at,version", { count: "exact" });
    if (debouncedSearch) query = query.ilike("original_file_name", `%${debouncedSearch.replace(/[\\%_]/g, "\\$&")}%`);
    const { data, error: queryError, count: total } = await query.order("created_at", { ascending: false }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (queryError) {
      setError("Documents could not be loaded. Check your access and the storage setup.");
      setRows([]);
      setCount(0);
      setLoading(false);
      return;
    }
    const records = (data ?? []) as unknown as DocumentRecord[];
    if (records.length && session?.user.id) {
      const { error: auditError } = await supabase.from("sensitive_read_log").insert(records.map((record) => ({
        user_id: session.user.id,
        employee_id: record.employee_id,
        record_id: record.id,
        record_type: "documents",
        data_category: "CONFIDENTIAL_DOCUMENT",
        purpose: "Viewed the document registry",
        accessed_fields: ["original_file_name", "document_type", "file_size", "mime_type", "storage_path", "access_level", "created_at", "expires_at", "version"],
      })));
      if (auditError) {
        setError("Documents were not displayed because the access log could not be written.");
        setRows([]);
        setCount(0);
        setLoading(false);
        return;
      }
    }
    setRows(records);
    setCount(total ?? 0);
    setLoading(false);
  }, [canView, debouncedSearch, page, session?.user.id]);

  useEffect(() => { void loadDocuments(); }, [loadDocuments]);

  useEffect(() => {
    let active = true;
    async function loadEmployeeChoices() {
      if (!supabase || !canUpload) return;
      const { data, error: rpcError } = await supabase.rpc("get_employee_directory");
      if (!active || rpcError || !Array.isArray(data)) return;
      setEmployees(data.filter((item): item is EmployeeChoice => Boolean(item && typeof item === "object" && "id" in item && "employee_number" in item && "first_name" in item && "last_name" in item)));
    }
    void loadEmployeeChoices();
    return () => { active = false; };
  }, [canUpload]);

  const columns = useMemo(() => [
    { key: "original_file_name", label: "File name", sortable: false },
    { key: "document_type", label: "Document type", sortable: false },
    { key: "file_size", label: "Size", sortable: false, render: (row: DocumentRecord) => formatSize(Number(row.file_size)) },
    { key: "access_level", label: "Access level", sortable: false },
    { key: "created_at", label: "Added", sortable: false, render: (row: DocumentRecord) => new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(row.created_at)) },
    { key: "expires_at", label: "Expires", sortable: false, render: (row: DocumentRecord) => row.expires_at ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(row.expires_at)) : "—" },
  ], []);

  function chooseFile(next: File | undefined) {
    setError("");
    if (!next) return;
    const validationError = validateDocumentFile(next);
    if (validationError) {
      setFile(null);
      setError(validationError);
    } else setFile(next);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    chooseFile(event.dataTransfer.files[0]);
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!online || !canUpload || !file) return;
    if (!documentType.trim()) { setError("Enter a document type."); return; }
    setUploading(true);
    setError("");
    try {
      await uploadDocument({ file, employeeId: employeeId || null, documentType, accessLevel });
      setFile(null);
      setDocumentType("");
      setEmployeeId("");
      showToast("Document uploaded and registered successfully.", "success");
      await loadDocuments();
    } catch (reason) {
      setError(safeError(reason));
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(record: DocumentRecord) {
    if (!online || !session?.user.id) return;
    setDownloadingId(record.id);
    setError("");
    try {
      await auditService.logSensitiveRead({
        userId: session.user.id,
        employeeId: record.employee_id ?? undefined,
        recordId: record.id,
        recordType: "documents",
        dataCategory: "CONFIDENTIAL_DOCUMENT",
        purpose: "Downloaded a document from the registry",
        accessedFields: ["document_file"],
      });
      const signedUrl = await createDocumentDownloadUrl(record.storage_path, record.original_file_name);
      const anchor = document.createElement("a");
      anchor.href = signedUrl;
      anchor.download = record.original_file_name;
      anchor.rel = "noopener noreferrer";
      anchor.target = "_blank";
      anchor.click();
    } catch (reason) {
      setError(safeError(reason));
    } finally {
      setDownloadingId("");
    }
  }

  if (!canView) return <div className="page-content"><div className="empty-state"><h2>Access restricted</h2></div></div>;
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div className="page-content">
      <header className="page-heading"><h1>Documents & archive</h1></header>
      {!online && <div className="notice notice-warning" role="status">You are offline. Uploads and downloads are disabled; files are never cached on this device.</div>}
      {error && <div className="notice notice-error" role="alert">{error}<button className="text-button" onClick={() => setError("")}>Dismiss</button></div>}
      {canUpload && <details className="panel document-upload-panel">
        <summary>Upload a document</summary>
        <form className="document-upload-form" onSubmit={(event) => void handleUpload(event)}>
          <label className="document-drop-zone" htmlFor="document-file" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
            <strong>{file ? file.name : "Drop a document here or choose a file"}</strong>
            <small>{file ? `${formatSize(file.size)} · ${file.type}` : "PDF, image, Word or Excel · up to 50 MB"}</small>
            <input id="document-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.doc,.docx,.xls,.xlsx" onChange={(event) => chooseFile(event.currentTarget.files?.[0])} disabled={!online || uploading} />
          </label>
          <div className="document-upload-fields">
            <label className="field">Document type<input required value={documentType} onChange={(event) => setDocumentType(event.target.value)} placeholder="Appointment letter, certificate…" disabled={!online || uploading} /></label>
            <label className="field">Linked employee<SearchableSelect id="document-employee" value={employeeId} options={employees.map((employee) => ({ value: employee.id, label: `${employee.first_name} ${employee.last_name} · ${employee.employee_number}` }))} placeholder="Search employees by name or number…" emptyLabel="No employees are available" disabled={!online || uploading} onChange={setEmployeeId} /></label>
            <label className="field">Access classification<select value={accessLevel} onChange={(event) => setAccessLevel(event.target.value as typeof accessLevel)} disabled={!online || uploading}><option value="Private">Private</option><option value="DiocesanHR">Diocesan HR</option><option value="BoardLevel">Board level</option></select></label>
          </div>
          <div className="document-upload-footer"><button type="submit" className="button button-primary" disabled={!online || uploading || !file || !documentType.trim()}>{uploading ? "Uploading and registering…" : "Upload and register"}</button></div>
        </form>
      </details>}
      <section className="panel records-panel document-records">
        <div className="records-toolbar"><div><strong>{count.toLocaleString()}</strong><span> {count === 1 ? "document" : "documents"}</span></div><div className="toolbar-actions"><label className="search-box"><input aria-label="Search document file names" placeholder="Search file names" value={search} onChange={(event) => setSearch(event.target.value)} /></label><button className="button button-secondary button-small" onClick={() => void loadDocuments()} disabled={loading}>Refresh</button></div></div>
        {loading ? <div className="table-state" role="status">Loading documents…</div> : rows.length ? <>
          <DataTable rows={rows} columns={columns} sortKey="created_at" sortAscending={false} onSort={() => undefined} actions={(row) => <button className="text-button" onClick={() => void handleDownload(row)} disabled={!online || downloadingId === row.id}>{downloadingId === row.id ? "Preparing…" : "Download"}</button>} />
          <div className="pagination-bar"><span>Page {page + 1} of {pageCount}</span><div><button className="button button-secondary button-small" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0}>Previous</button><button className="button button-secondary button-small" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={page >= pageCount - 1}>Next</button></div></div>
        </> : <div className="empty-state"><h2>{debouncedSearch ? "No matching documents" : "No documents yet"}</h2></div>}
      </section>
    </div>
  );
}
