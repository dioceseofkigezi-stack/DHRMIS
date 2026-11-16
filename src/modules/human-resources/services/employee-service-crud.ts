import type { Employee, EmployeeCategory, EmploymentStatus, Gender, LifeStatus } from "@/types";
import { supabase } from "@/core/config";

type EmployeeWriteInput = {
  employeeId: string;
  employeeNumber: string;
  title: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  gender: Gender;
  telephone?: string;
  email: string;
  employeeCategory: EmployeeCategory;
};

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

export const employeeCrudService = {
  async createEmployee(input: EmployeeWriteInput): Promise<{ success: boolean; data?: Employee; error?: string }> {
    if (!supabase) return { success: false, error: "Supabase is not configured." };
    const { data, error } = await supabase.from("employees").insert({
      employee_id: input.employeeId,
      employee_number: input.employeeNumber,
      title: input.title,
      first_name: input.firstName,
      middle_name: input.middleName,
      last_name: input.lastName,
      gender: input.gender,
      telephone: input.telephone,
      email: input.email,
      employee_category: input.employeeCategory,
    }).select("id, employee_id, employee_number, title, first_name, middle_name, last_name, gender, telephone, email, employee_category, life_status, employment_status, createdAt, updatedAt").single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: mapEmployee(data) };
  },

  async getEmployeeById(id: string): Promise<{ success: boolean; data?: Employee; error?: string }> {
    if (!supabase) return { success: false, error: "Supabase is not configured." };
    const { data, error } = await supabase.from("employees").select("id, employee_id, employee_number, title, first_name, middle_name, last_name, gender, telephone, email, employee_category, life_status, employment_status, createdAt, updatedAt").eq("id", id).single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: mapEmployee(data) };
  },

  async getEmployeeByPermanentId(employeeId: string): Promise<{ success: boolean; data?: Employee; error?: string }> {
    if (!supabase) return { success: false, error: "Supabase is not configured." };
    const { data, error } = await supabase.from("employees").select("id, employee_id, employee_number, title, first_name, middle_name, last_name, gender, telephone, email, employee_category, life_status, employment_status, createdAt, updatedAt").eq("employee_id", employeeId).single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: mapEmployee(data) };
  },

  async updateEmployee(id: string, updates: Partial<EmployeeWriteInput>): Promise<{ success: boolean; data?: Employee; error?: string }> {
    if (!supabase) return { success: false, error: "Supabase is not configured." };
    const columns: Record<keyof EmployeeWriteInput, string> = {
      employeeId: "employee_id",
      employeeNumber: "employee_number",
      title: "title",
      firstName: "first_name",
      middleName: "middle_name",
      lastName: "last_name",
      gender: "gender",
      telephone: "telephone",
      email: "email",
      employeeCategory: "employee_category",
    };
    const payload = Object.fromEntries(
      Object.entries(updates)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [columns[key as keyof EmployeeWriteInput], value]),
    );
    if (Object.keys(payload).length === 0) return { success: false, error: "No editable employee fields were provided." };
    const { data, error } = await supabase.from("employees").update(payload).eq("id", id).select("id, employee_id, employee_number, title, first_name, middle_name, last_name, gender, telephone, email, employee_category, life_status, employment_status, createdAt, updatedAt").single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: mapEmployee(data) };
  },
};
