import { supabase } from "@/core/config";
import { canAccessModule } from "@/app/modules";

export interface SearchResult {
  id: string;
  kind: "Employee" | "Assignment" | "Document";
  title: string;
  detail: string;
  path: string;
}

export function patternFor(term: string) {
  const escaped = term.replace(/[\\%_]/g, "\\$&");
  return `%${escaped}%`;
}

async function searchFields(table: string, fields: string[], select: string, pattern: string, limit: number, scope?: { column: string; value: string }) {
  if (!supabase) return [] as unknown[];
  const results = await Promise.all(fields.map((field) =>
    {
      let query = supabase!.from(table).select(select).ilike(field, pattern);
      if (scope) query = query.eq(scope.column, scope.value);
      return query.limit(limit);
    },
  ));
  const failed = results.find((result) => result.error);
  if (failed?.error && results.every((result) => result.error)) throw failed.error;
  const rows = results.flatMap((result) => result.data ?? []) as unknown[];
  return [...new Map(rows.map((row) => [(row as Record<string, unknown>).id, row])).values()];
}

export async function searchAuthorizedRecords(term: string, roles: string[], personnelDomainId?: string): Promise<SearchResult[]> {
  if (!supabase) throw new Error("The system data service is not configured.");
  const normalized = term.trim();
  if (normalized.length < 2) return [];
  const pattern = patternFor(normalized);
  const requests: Array<Promise<unknown[]>> = [];

  if (canAccessModule("/people", roles)) {
    requests.push(searchFields(
      personnelDomainId ? "personnel_domain_employees" : "employees",
      ["employee_number", "first_name", "last_name"],
      "id, employee_number, first_name, last_name, employee_category",
      pattern,
      8,
      personnelDomainId ? { column: "personnel_domain_id", value: personnelDomainId } : undefined,
    ));
  }
  if (canAccessModule("/assignments", roles)) {
    requests.push(searchFields("assignments", ["assignment_type", "reference_number"], "id, assignment_type, reference_number, start_date", pattern, 5,
      personnelDomainId ? { column: "personnel_domain_id", value: personnelDomainId } : undefined));
  }
  if (!personnelDomainId && canAccessModule("/documents", roles)) {
    requests.push(searchFields("documents", ["original_file_name", "document_type"], "id, original_file_name, document_type, employee_id", pattern, 5));
  }

  const responses = await Promise.all(requests);
  const results: SearchResult[] = [];
  for (let index = 0; index < responses.length; index += 1) {
    for (const item of responses[index]) {
      const row = item as Record<string, unknown>;
      if (typeof row.id !== "string") continue;
      if (typeof row.employee_number === "string") {
        results.push({
          id: row.id,
          kind: "Employee",
          title: [row.first_name, row.last_name].filter(Boolean).join(" "),
          detail: `${row.employee_number} · ${String(row.employee_category ?? "Employee")}`,
          path: `/people/${row.id}`,
        });
      } else if (typeof row.assignment_type === "string") {
        results.push({
          id: row.id,
          kind: "Assignment",
          title: row.assignment_type,
          detail: [row.reference_number, row.start_date].filter(Boolean).join(" · "),
          path: "/assignments",
        });
      } else if (typeof row.original_file_name === "string") {
        results.push({
          id: row.id,
          kind: "Document",
          title: row.original_file_name,
          detail: String(row.document_type ?? "Document"),
          path: "/documents",
        });
      }
    }
  }
  return results.slice(0, 15);
}
