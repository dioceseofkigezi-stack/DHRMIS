/**
 * DHRMIS - Audit Summary Reports
 * Aggregated audit metrics for dashboards
 */

import { supabase } from "@/core/config";

function requireSupabase() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export const getDailyAuditSummary = async (
  startDate: Date,
  endDate: Date,
): Promise<Record<string, unknown>[]> => {
  const { data, error } = await requireSupabase().rpc("get_daily_audit_summary", {
    p_start_date: startDate.toISOString(),
    p_end_date: endDate.toISOString(),
  });

  if (error) {
    throw error;
  }
  return data ?? [];
};

export const getSensitiveReadSummary = async (
  startDate: Date,
  endDate: Date,
): Promise<Record<string, unknown>[]> => {
  const { data, error } = await requireSupabase().rpc("get_daily_sensitive_read_summary", {
    p_start_date: startDate.toISOString(),
    p_end_date: endDate.toISOString(),
  });

  if (error) {
    throw error;
  }
  return data ?? [];
};

export const getUserActivitySummary = async (
  userId: string,
  startDate: Date,
  endDate: Date,
): Promise<Record<string, unknown>[]> => {
  const { data, error } = await requireSupabase().rpc("get_user_activity_summary", {
    p_user_id: userId,
    p_start_date: startDate.toISOString(),
    p_end_date: endDate.toISOString(),
  });

  if (error) {
    throw error;
  }
  return data ?? [];
};

export const getModuleActivitySummary = async (
  startDate: Date,
  endDate: Date,
): Promise<Record<string, unknown>[]> => {
  const { data, error } = await requireSupabase().rpc("get_module_activity_summary", {
    p_start_date: startDate.toISOString(),
    p_end_date: endDate.toISOString(),
  });

  if (error) {
    throw error;
  }
  return data ?? [];
};

export const getSensitiveDataAccessReport = async (
  startDate: Date,
  endDate: Date,
): Promise<Record<string, unknown>[]> => {
  const { data, error } = await requireSupabase().rpc("get_sensitive_data_access_report", {
    p_start_date: startDate.toISOString(),
    p_end_date: endDate.toISOString(),
  });

  if (error) {
    throw error;
  }
  return data ?? [];
};