import { supabase } from "@/core/config";

export const DOCUMENT_BUCKET = import.meta.env.VITE_HR_DOCUMENTS_BUCKET?.trim();
export const MAX_DOCUMENT_SIZE = 50 * 1024 * 1024;
export const ALLOWED_DOCUMENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export interface DocumentUploadInput {
  file: File;
  employeeId: string | null;
  documentType: string;
  accessLevel: "Private" | "DiocesanHR" | "BoardLevel";
}

export function validateDocumentFile(file: File) {
  if (file.size === 0) return "The selected file is empty.";
  if (file.size > MAX_DOCUMENT_SIZE) return "Choose a file smaller than 50 MB.";
  if (!ALLOWED_DOCUMENT_TYPES.has(file.type)) return "Use a PDF, image, Word document, or Excel workbook.";
  return "";
}

function safeFileName(fileName: string) {
  return fileName.normalize("NFKC").replace(/[\\/\0]/g, "_").replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 180) || "document";
}

async function checksum(file: File) {
  if (!globalThis.crypto?.subtle) return null;
  try {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

export async function uploadDocument(input: DocumentUploadInput) {
  if (!supabase) throw new Error("Supabase is not configured. Check VITE_SUPABASE_URL and its public client key in .env.");
  if (!DOCUMENT_BUCKET) throw new Error("Document storage is not configured. Add VITE_HR_DOCUMENTS_BUCKET to .env.");
  const fileError = validateDocumentFile(input.file);
  if (fileError) throw new Error(fileError);
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error("Sign in again before uploading a document.");

  const id = crypto.randomUUID();
  const storagePath = `${user.id}/${id}/${safeFileName(input.file.name)}`;
  const bucket = supabase.storage.from(DOCUMENT_BUCKET);
  const { error: uploadError } = await bucket.upload(storagePath, input.file, { contentType: input.file.type, upsert: false });
  if (uploadError) throw uploadError;

  const { error: rowError } = await supabase.from("documents").insert({
    id,
    employee_id: input.employeeId,
    module: "ARCHIVE",
    document_type: input.documentType.trim(),
    original_file_name: input.file.name,
    file_size: input.file.size,
    mime_type: input.file.type,
    storage_path: storagePath,
    checksum: await checksum(input.file),
    access_level: input.accessLevel,
    metadata: { upload_source: "DHRMIS document manager" },
  });
  if (rowError) {
    const { error: cleanupError } = await bucket.remove([storagePath]);
    throw new Error(cleanupError
      ? "Document details could not be saved. The uploaded file needs administrator cleanup."
      : "Document details could not be saved. The uploaded file was removed.");
  }
  return id;
}

export async function createDocumentDownloadUrl(storagePath: string, fileName: string) {
  if (!supabase) throw new Error("Supabase is not configured. Check VITE_SUPABASE_URL and its public client key in .env.");
  if (!DOCUMENT_BUCKET) throw new Error("Document storage is not configured. Add VITE_HR_DOCUMENTS_BUCKET to .env.");
  const { data, error } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(storagePath, 60, { download: fileName });
  if (error || !data?.signedUrl) throw new Error("The document could not be opened. Check your access and try again.");
  return data.signedUrl;
}
