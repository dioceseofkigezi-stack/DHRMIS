/**
 * DHRMIS - Audit Query Utilities
 */

import { supabase } from "@/core/config";
import type { AuditAction, AuditLog, PaginatedResult, SensitiveReadLog } from "@/types";

export interface BaseAuditFilter {
  userId?: string;
  action?: AuditAction;
  module?: string;
  recordId?: string;
  employeeId?: string;
  scopeId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export const getAuditLogs = async (
  filters: BaseAuditFilter = {},
): Promise<PaginatedResult<AuditLog>> => {
  if (!supabase) throw new Error("Supabase is not configured.");
  const {
    userId,
    action,
    module,
    recordId,
    employeeId,
    scopeId,
    startDate,
    endDate,
    limit = 100,
    offset = 0,
  } = filters;

  let query = supabase
    .from("audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (userId) query = query.eq("user_id", userId);
  if (action) query = query.eq("action", action);
  if (module) query = query.eq("module", module);
  if (recordId) query = query.eq("record_id", recordId);
  if (employeeId) query = query.eq("employee_id", employeeId);
  if (scopeId) query = query.contains("scope_ids", [scopeId]);
  if (startDate) query = query.gte("created_at", startDate.toISOString());
  if (endDate) query = query.lte("created_at", endDate.toISOString());

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    data: data ?? [],
    total: count || 0,
    page: offset / limit + 1,
    pageSize: limit,
    totalPages: Math.ceil((count || 0) / limit),
    hasNext: offset + limit < (count || 0),
    hasPrev: offset > 0,
  };
};

export interface BaseSensitiveReadFilter {
  userId?: string;
  employeeId?: string;
  recordId?: string;
  dataCategory?: SensitiveReadLog["dataCategory"];
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export const getSensitiveReadLogs = async (
  filters: BaseSensitiveReadFilter = {},
): Promise<PaginatedResult<SensitiveReadLog>> => {
  if (!supabase) throw new Error("Supabase is not configured.");
  const {
    userId,
    employeeId,
    recordId,
    dataCategory,
    startDate,
    endDate,
    limit = 100,
    offset = 0,
  } = filters;

  let query = supabase
    .from("sensitive_read_log")
    .select("*", { count: "exact" })
    .order("timestamp", { ascending: false })
    .range(offset, offset + limit - 1);

  if (userId) query = query.eq("user_id", userId);
  if (employeeId) query = query.eq("employee_id", employeeId);
  if (recordId) query = query.eq("record_id", recordId);
  if (dataCategory) query = query.eq("data_category", dataCategory);
  if (startDate) query = query.gte("timestamp", startDate.toISOString());
  if (endDate) query = query.lte("timestamp", endDate.toISOString());

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    data: data ?? [],
    total: count || 0,
    page: offset / limit + 1,
    pageSize: limit,
    totalPages: Math.ceil((count || 0) / limit),
    hasNext: offset + limit < (count || 0),
    hasPrev: offset > 0,
  };
};