import type { Employee, EmployeeCategory, EmploymentStatus, Gender, LifeStatus } from "@/types";
import { supabase } from "@/core/config";
import type { EmployeeSearchFilters } from "@/modules/human-resources/types/employee-master";

function mapEmployee(value: unknown): Employee {
  const row = value as Record<string, unknown>;
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    employeeNumber: String(row.employee_number),
    title: String(row.title),
    firstName: String(row.first_name),
    middleName: row.middle_name ? String(row.middle_name) : undefined,
    lastName: String(row.last_name),
    alternativeNames: row.alternative_names ? String(row.alternative_names) : undefined,
    gender: row.gender as Gender,
    dateOfBirth: row.date_of_birth ? new Date(String(row.date_of_birth)) : undefined,
    placeOfBirth: row.place_of_birth ? String(row.place_of_birth) : undefined,
    nationality: row.nationality ? String(row.nationality) : undefined,
    nationalId: row.national_id ? String(row.national_id) : undefined,
    passportNumber: row.passport_number ? String(row.passport_number) : undefined,
    telephone: row.telephone ? String(row.telephone) : undefined,
    email: String(row.email),
    address: row.address ? String(row.address) : undefined,
    employeeCategory: row.employee_category as EmployeeCategory,
    lifeStatus: row.life_status as LifeStatus,
    employmentStatus: row.employment_status as EmploymentStatus,
    photoId: row.photo_id ? String(row.photo_id) : undefined,
    createdAt: new Date(String(row.createdAt)),
    updatedAt: new Date(String(row.updatedAt)),
    archivedAt: row.archived_at ? new Date(String(row.archived_at)) : undefined,
  };
}

export const employeeSearchService = {
  async searchEmployees(filters: EmployeeSearchFilters): Promise<{
    success: boolean;
    data?: Employee[];
    error?: string;
    meta?: { total: number; page: number; pageSize: number; totalPages: number };
  }> {
    if (!supabase) return { success: false, error: "Supabase is not configured." };

    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    let query = supabase.from("employees").select(
      "id, employee_id, employee_number, title, first_name, middle_name, last_name, gender, telephone, email, employee_category, life_status, employment_status, createdAt, updatedAt",
      { count: "exact" },
    );

    if (filters.employeeId) query = query.eq("employee_id", filters.employeeId);
    if (filters.employeeNumber) query = query.eq("employee_number", filters.employeeNumber);
    if (filters.firstName) query = query.ilike("first_name", `%${filters.firstName}%`);
    if (filters.lastName) query = query.ilike("last_name", `%${filters.lastName}%`);
    if (filters.middleName) query = query.ilike("middle_name", `%${filters.middleName}%`);
    if (filters.employeeCategory) query = query.eq("employee_category", filters.employeeCategory);
    if (filters.lifeStatus) query = query.eq("life_status", filters.lifeStatus);
    if (filters.employmentStatus) query = query.eq("employment_status", filters.employmentStatus);
    if (filters.gender) query = query.eq("gender", filters.gender);
    if (filters.searchQuery) {
      const safeTerm = filters.searchQuery.replace(/[%_,()\\]/g, " ").trim();
      if (safeTerm) query = query.or(`first_name.ilike.%${safeTerm}%,last_name.ilike.%${safeTerm}%,employee_number.ilike.%${safeTerm}%`);
    }

    const { data, count, error } = await query
      .order("last_name", { ascending: true })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (error) return { success: false, error: error.message };
    return {
      success: true,
      data: (data ?? []).map(mapEmployee),
      meta: { total: count ?? 0, page, pageSize, totalPages: Math.ceil((count ?? 0) / pageSize) },
    };
  },
};
