/**
 * DHRMIS - Security Event Queries
 */

import { supabase } from "@/core/config";
import type { PaginatedResult, SecurityEvent } from "@/types";

export interface BaseSecurityEventFilter {
  eventType?: SecurityEvent["eventType"];
  severity?: SecurityEvent["severity"];
  component?: string;
  startTimestamp?: Date;
  endTimestamp?: Date;
  acknowledged?: boolean;
  limit?: number;
  offset?: number;
}

export const getSecurityEvents = async (
  filters: BaseSecurityEventFilter = {},
): Promise<PaginatedResult<SecurityEvent>> => {
  if (!supabase) throw new Error("Supabase is not configured.");
  const {
    eventType,
    severity,
    component,
    startTimestamp,
    endTimestamp,
    acknowledged,
    limit = 100,
    offset = 0,
  } = filters;

  let query = supabase
    .from("security_event")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (eventType) query = query.eq("event_type", eventType);
  if (severity) query = query.eq("severity", severity);
  if (component) query = query.eq("component", component);
  if (startTimestamp) query = query.gte("created_at", startTimestamp.toISOString());
  if (endTimestamp) query = query.lte("created_at", endTimestamp.toISOString());
  if (acknowledged !== undefined) query = query.eq("acknowledged", acknowledged);

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