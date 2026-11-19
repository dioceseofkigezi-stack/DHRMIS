import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { canAccessModule } from "@/app/modules";
import { supabase } from "@/core/config";
import { csvCell } from "@/core/security/csv";
import { useAuth } from "@/modules/core/auth/context";
import { AdminNotice, AdminPageHeader, AdminStatus, adminErrorMessage, formatAdminDate } from "./AdminConsoleShared";

export interface ReportMetric {
  key: string;
  label: string;
  count: number | null;
  previous: number | null;
  delta: number | null;
  deltaPct: number | null;
  deltaDirection: "up" | "down" | "neutral" | null;
  trend: { date: string; count: number }[];
  description: string;
  category: string;
}

interface ReportBreakdownItem {
  dimension: string;
  label: string;
  count: number;
  share: number;
}

interface ReportDetailSection {
  key: string;
  title: string;
  description: string;
  total: number;
  analyzed: number;
  unavailable: boolean;
  groups: ReportBreakdownItem[];
}

export interface Delta {
  count: number | null;
  pct: number | null;
  direction: "up" | "down" | "neutral" | null;
}

interface MetricSource {
  key: string;
  label: string;
  description: string;
  category: string;
  table: string;
  tsColumn: string;
  filters?: [string, string, unknown][];
  allTimeWindowDays: number;
}

export const CATEGORY_ORDER = ["Accounts", "Security", "History", "Technical"] as const;

export const METRIC_SOURCES: MetricSource[] = [
  { key: "accounts", label: "Role assignments created", description: "User-role records created in the selected period; a person assigned multiple roles is counted once per role", category: "Accounts", table: "user_roles", tsColumn: "createdat", allTimeWindowDays: 90 },
  { key: "active", label: "Active role assignments", description: "Assignments created in the selected period that are currently active and not suspended", category: "Accounts", table: "user_roles", tsColumn: "createdat", filters: [["isactive", "eq", true], ["issuspended", "eq", false]], allTimeWindowDays: 90 },
  { key: "suspended", label: "Suspended role assignments", description: "Assignments created in the selected period that are currently suspended", category: "Accounts", table: "user_roles", tsColumn: "createdat", filters: [["issuspended", "eq", true]], allTimeWindowDays: 90 },
  { key: "sessions", label: "Active sessions started", description: "Sessions started in the selected period that are still active and have not expired", category: "Security", table: "user_sessions", tsColumn: "createdat", filters: [["isactive", "eq", true]], allTimeWindowDays: 30 },
  { key: "events", label: "Unresolved security events", description: "Security events opened in the selected period that are still awaiting resolution", category: "Security", table: "security_event", tsColumn: "created_at", filters: [["resolved", "eq", false]], allTimeWindowDays: 90 },
  { key: "audit", label: "Audit records in period", description: "System activity recorded in the selected period", category: "History", table: "audit_log", tsColumn: "created_at", allTimeWindowDays: 90 },
  { key: "sensitive", label: "Sensitive reads in period", description: "Sensitive-read events recorded in the selected period", category: "History", table: "sensitive_read_log", tsColumn: "timestamp", allTimeWindowDays: 90 },
  { key: "configuration", label: "Configuration entries created", description: "Configuration values first added in the selected period", category: "Technical", table: "system_config", tsColumn: "createdat", allTimeWindowDays: 90 },
];

export function parseLocalDate(value: string): Date | null {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatReportDate(value: string): string {
  const date = parseLocalDate(value);
  return date ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date) : value;
}

export function addCalendarDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function daysInclusive(start: Date, end: Date): number {
  let count = 0;
  let cursor = new Date(start);
  while (cursor <= end) {
    count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

export function previousPeriodBounds(from: string, to: string): { from: string; to: string } | null {
  const start = parseLocalDate(from);
  const end = parseLocalDate(to);
  if (!start || !end || end < start) return null;
  const length = daysInclusive(start, end);
  const previousEnd = addCalendarDays(start, -1);
  const previousStart = addCalendarDays(previousEnd, -(length - 1));
  return { from: formatLocalDate(previousStart), to: formatLocalDate(previousEnd) };
}

export function computeDelta(current: number | null, previous: number | null): Delta {
  if (current === null || previous === null) return { count: null, pct: null, direction: null };
  const count = current - previous;
  const direction = count > 0 ? "up" : count < 0 ? "down" : "neutral";
  const pct = previous === 0 ? (current > 0 ? 100 : 0) : Math.round((count / previous) * 100);
  return { count, pct, direction };
}

export function formatDelta(delta: Delta): string {
  if (delta.count === null) return "—";
  const signedCount = delta.count > 0 ? `+${delta.count.toLocaleString()}` : delta.count.toLocaleString();
  const pct = delta.pct === null ? "" : ` (${delta.pct}%)`;
  return `${signedCount}${pct}`;
}

export function bucketTrend(
  timestamps: string[],
  from: string | undefined,
  to: string | undefined,
  windowDays: number,
): { date: string; count: number }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = to ? parseLocalDate(to) ?? today : today;
  const start = from ? parseLocalDate(from) ?? addCalendarDays(end, -(windowDays - 1)) : addCalendarDays(end, -(windowDays - 1));
  const buckets = new Map<string, number>();
  let cursor = new Date(start);
  while (cursor <= end) {
    buckets.set(formatLocalDate(cursor), 0);
    cursor.setDate(cursor.getDate() + 1);
  }
  for (const timestamp of timestamps) {
    const day = new Date(timestamp);
    if (Number.isNaN(day.getTime())) continue;
    day.setHours(0, 0, 0, 0);
    const key = formatLocalDate(day);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));
}

export function filterMetrics(metrics: ReportMetric[], term: string): ReportMetric[] {
  const search = term.trim().toLowerCase();
  if (!search) return metrics;
  return metrics.filter((metric) =>
    metric.label.toLowerCase().includes(search)
    || metric.category.toLowerCase().includes(search)
    || metric.description.toLowerCase().includes(search));
}

function startOfDay(value: string) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : undefined;
}

function endOfDay(value: string) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString();
}

function applyFilters(query: any, source: MetricSource, start: string | undefined, end: string | undefined, nowISO: string) {
  const filters = [...(source.filters ?? [])];
  if (source.table === "user_sessions") filters.push(["expiresat", "gt", nowISO]);
  if (start) query = query.gte(source.tsColumn, start);
  if (end) query = query.lt(source.tsColumn, end);
  for (const [column, operator, value] of filters) query = query[operator](column, value);
  return query;
}

async function fetchCount(source: MetricSource, start: string | undefined, end: string | undefined, nowISO: string) {
  if (!supabase) return { count: null, error: new Error("The system data service is not configured.") };
  let query = applyFilters(supabase.from(source.table).select("id", { count: "exact", head: true }), source, start, end, nowISO);
  try {
    const { count, error } = await query;
    return { count: count ?? null, error };
  } catch (err) {
    return { count: null, error: err };
  }
}

async function fetchTrend(source: MetricSource, fromDate: string, toDate: string, nowISO: string) {
  if (!supabase) return { trend: [], error: new Error("The system data service is not configured.") };
  let query = applyFilters(
    supabase.from(source.table).select(`id, ${source.tsColumn}`).order(source.tsColumn, { ascending: false }).limit(5000),
    source,
    fromDate ? startOfDay(fromDate) : undefined,
    toDate ? endOfDay(toDate) : undefined,
    nowISO,
  );
  try {
    const { data, error } = await query;
    const timestamps = (data ?? []).map((row: Record<string, unknown>) => row[source.tsColumn] as string);
    return { trend: bucketTrend(timestamps, fromDate || undefined, toDate || undefined, source.allTimeWindowDays), error };
  } catch (err) {
    return { trend: [], error: err };
  }
}

function downloadReport(metrics: ReportMetric[], details: ReportDetailSection[], fromDate: string, toDate: string, previous: { from: string; to: string } | null) {
  const generatedAt = new Date().toISOString();
  const csv = [
    ["Record type", "Category", "Measure", "Detail", "Count", "Previous", "Delta", "Change %", "Share of analyzed records", "Description", "Period start", "Period end", "Previous start", "Previous end", "Generated at"].map(csvCell).join(","),
    ...metrics.map((row) => [
      "Metric", row.category, row.label, "",
      row.count ?? "Unavailable", row.previous ?? "Unavailable",
      row.delta === null ? "Unavailable" : row.delta,
      row.deltaPct === null ? "Unavailable" : `${row.deltaPct >= 0 ? "+" : ""}${row.deltaPct}%`, "",
      row.description,
      fromDate || "All time", toDate || "Current",
      previous ? previous.from : "—", previous ? previous.to : "—",
      generatedAt,
    ].map(csvCell).join(",")),
    ...details.flatMap((section) => section.groups.map((item) => [
      "Breakdown", section.title, item.dimension, item.label, item.count, "", "", "", `${item.share}%`,
      `${section.description} ${section.analyzed.toLocaleString()} of ${section.total.toLocaleString()} matching records analyzed.`,
      fromDate || "All available history", toDate || "Current", previous ? previous.from : "—", previous ? previous.to : "—", generatedAt,
    ].map(csvCell).join(","))),
    ...metrics.flatMap((metric) => metric.trend.map((point) => [
      "Daily trend", metric.category, metric.label, point.date, point.count, "", "", "", "", "Daily count",
      fromDate || "All available history", toDate || "Current", previous ? previous.from : "—", previous ? previous.to : "—", generatedAt,
    ].map(csvCell).join(","))),
  ].join("\r\n");
  const file = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const objectUrl = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `dhrmis-administration-report-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

const DETAIL_ROW_LIMIT = 5000;

async function fetchDetailRows(table: string, columns: string, timestampColumn: string, fromDate: string, toDate: string) {
  if (!supabase) return { rows: [] as Record<string, unknown>[], total: 0, error: new Error("The system data service is not configured.") };
  let query: any = supabase.from(table).select(columns, { count: "exact" }).order(timestampColumn, { ascending: false }).limit(DETAIL_ROW_LIMIT);
  if (fromDate) query = query.gte(timestampColumn, startOfDay(fromDate));
  if (toDate) query = query.lt(timestampColumn, endOfDay(toDate));
  try {
    const { data, count, error } = await query;
    return { rows: (data ?? []) as Record<string, unknown>[], total: count ?? 0, error };
  } catch (error) {
    return { rows: [] as Record<string, unknown>[], total: 0, error };
  }
}

function displayDimension(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not recorded";
  const text = String(value).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function groupBreakdown(rows: Record<string, unknown>[], dimension: string, getValue: (row: Record<string, unknown>) => unknown): ReportBreakdownItem[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = displayDimension(getValue(row));
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = sorted.slice(0, 12);
  const otherCount = sorted.slice(12).reduce((sum, [, count]) => sum + count, 0);
  if (otherCount > 0) top.push(["Other categories", otherCount]);
  return top.map(([label, count]) => ({ dimension, label, count, share: rows.length ? Math.round((count / rows.length) * 100) : 0 }));
}

async function loadDetailedSections(fromDate: string, toDate: string): Promise<{ sections: ReportDetailSection[]; hadError: boolean }> {
  const [accounts, sessions, events, audit, sensitive, configuration] = await Promise.all([
    fetchDetailRows("user_roles", "role_code,isactive,issuspended,ismfaenabled,createdat", "createdat", fromDate, toDate),
    fetchDetailRows("user_sessions", "isactive,expiresat,createdat,lastactivityat", "createdat", fromDate, toDate),
    fetchDetailRows("security_event", "severity,event_type,resolved,acknowledged,created_at", "created_at", fromDate, toDate),
    fetchDetailRows("audit_log", "module,action,result,created_at", "created_at", fromDate, toDate),
    fetchDetailRows("sensitive_read_log", "data_category,record_type,timestamp", "timestamp", fromDate, toDate),
    fetchDetailRows("system_config", "config_section,is_valid,is_sensitive,createdat", "createdat", fromDate, toDate),
  ]);
  const now = Date.now();
  const sections: ReportDetailSection[] = [
    { key: "accounts", title: "Account and role assignments", description: "Role assignments created in the selected period, grouped by assigned role, current status, and MFA setting.", total: accounts.total, analyzed: accounts.rows.length, unavailable: Boolean(accounts.error), groups: [
      ...groupBreakdown(accounts.rows, "Role", (row) => row.role_code),
      ...groupBreakdown(accounts.rows, "Current assignment status", (row) => row.issuspended === true ? "Suspended" : row.isactive === true ? "Active" : "Inactive"),
      ...groupBreakdown(accounts.rows, "MFA", (row) => row.ismfaenabled === true ? "Enabled" : "Not enabled"),
    ] },
    { key: "sessions", title: "Session activity", description: "Tracked sessions started in the selected period, grouped by current session state and activity status.", total: sessions.total, analyzed: sessions.rows.length, unavailable: Boolean(sessions.error), groups: [
      ...groupBreakdown(sessions.rows, "Current session state", (row) => row.isactive === true && typeof row.expiresat === "string" && new Date(row.expiresat).getTime() > now ? "Active and unexpired" : row.isactive === true ? "Active but expired" : "Ended or revoked"),
    ] },
    { key: "security", title: "Security event review", description: "Security events opened in the selected period, grouped by severity, event type, resolution, and acknowledgement.", total: events.total, analyzed: events.rows.length, unavailable: Boolean(events.error), groups: [
      ...groupBreakdown(events.rows, "Severity", (row) => row.severity),
      ...groupBreakdown(events.rows, "Event type", (row) => row.event_type),
      ...groupBreakdown(events.rows, "Resolution", (row) => row.resolved === true ? "Resolved" : "Open"),
      ...groupBreakdown(events.rows, "Acknowledgement", (row) => row.acknowledged === true ? "Acknowledged" : "Awaiting acknowledgement"),
    ] },
    { key: "audit", title: "Audit activity", description: "Audit records created in the selected period, grouped by outcome, module, and action.", total: audit.total, analyzed: audit.rows.length, unavailable: Boolean(audit.error), groups: [
      ...groupBreakdown(audit.rows, "Outcome", (row) => row.result),
      ...groupBreakdown(audit.rows, "Module", (row) => row.module),
      ...groupBreakdown(audit.rows, "Action", (row) => row.action),
    ] },
    { key: "sensitive", title: "Sensitive data access", description: "Sensitive-read records created in the selected period, grouped by protected data category and record type.", total: sensitive.total, analyzed: sensitive.rows.length, unavailable: Boolean(sensitive.error), groups: [
      ...groupBreakdown(sensitive.rows, "Data category", (row) => row.data_category),
      ...groupBreakdown(sensitive.rows, "Record type", (row) => row.record_type),
    ] },
    { key: "configuration", title: "System configuration", description: "Configuration entries created in the selected period, grouped by section, validation state, and sensitivity.", total: configuration.total, analyzed: configuration.rows.length, unavailable: Boolean(configuration.error), groups: [
      ...groupBreakdown(configuration.rows, "Section", (row) => row.config_section),
      ...groupBreakdown(configuration.rows, "Validation", (row) => row.is_valid === true ? "Valid" : "Needs review"),
      ...groupBreakdown(configuration.rows, "Sensitivity", (row) => row.is_sensitive === true ? "Sensitive" : "Standard"),
    ] },
  ];
  return { sections, hadError: [accounts, sessions, events, audit, sensitive, configuration].some((result) => Boolean(result.error)) };
}

function summarizeTrend(trend: ReportMetric["trend"]) {
  if (!trend.length) return null;
  const total = trend.reduce((sum, point) => sum + point.count, 0);
  const activeDays = trend.filter((point) => point.count > 0).length;
  return { total, activeDays, average: total / trend.length };
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length === 0) return null;
  const width = 110;
  const height = 30;
  const pad = 3;
  const max = Math.max(0, ...values);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = max === 0 ? height / 2 : height - pad - (value / max) * (height - 2 * pad);
    return `${x},${y}`;
  }).join(" ");
  return <svg width={width} height={height} className="admin-sparkline" aria-hidden="true"><polyline points={points} fill="none" stroke="#5169e8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function AdminReportsPage() {
  const { roles } = useAuth();
  const canView = canAccessModule("/admin/reports", roles);
  const [searchParams, setSearchParams] = useSearchParams();
  const [fromDate, setFromDate] = useState(searchParams.get("from") ?? "");
  const [toDate, setToDate] = useState(searchParams.get("to") ?? "");
  const [search, setSearch] = useState("");
  const [metrics, setMetrics] = useState<ReportMetric[]>([]);
  const [details, setDetails] = useState<ReportDetailSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  // Keep the date range in the URL so a report view can be bookmarked or shared.
  useEffect(() => {
    const params = new URLSearchParams();
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    setSearchParams(params, { replace: true });
  }, [fromDate, toDate, setSearchParams]);

  const previous = useMemo(() => (fromDate && toDate ? previousPeriodBounds(fromDate, toDate) : null), [fromDate, toDate]);

  const loadReport = useCallback(async () => {
    if (!canView) { setMetrics([]); setDetails([]); setLoading(false); return; }
    if (!supabase) { setMetrics([]); setDetails([]); setError("The system data service is not configured."); setLoading(false); return; }
    if (fromDate && toDate && fromDate > toDate) {
      setError("The report start date must be on or before the end date.");
      setMetrics([]);
      setDetails([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setDetails([]);
    setError("");
    const start = fromDate ? startOfDay(fromDate) : undefined;
    const end = toDate ? endOfDay(toDate) : undefined;
    const pStart = previous ? startOfDay(previous.from) : undefined;
    const pEnd = previous ? endOfDay(previous.to) : undefined;
    const nowISO = new Date().toISOString();

    try {
      const [loaded, detailed] = await Promise.all([Promise.all(METRIC_SOURCES.map(async (source) => {
        const [current, previousCount, trend] = await Promise.all([
          fetchCount(source, start, end, nowISO),
          previous ? fetchCount(source, pStart, pEnd, nowISO) : { count: null, error: null },
          fetchTrend(source, fromDate, toDate, nowISO),
        ]);
        const delta = computeDelta(current.count, previousCount.count);
        return {
          key: source.key,
          label: source.label,
          description: source.description,
          category: source.category,
          count: current.count,
          previous: previousCount.count,
          delta: delta.count,
          deltaPct: delta.pct,
          deltaDirection: delta.direction,
          trend: trend.trend,
          error: current.error || previousCount.error || trend.error,
        };
      })), loadDetailedSections(fromDate, toDate)]);
      setDetails(detailed.sections);
      setMetrics(loaded.map((result) => ({
        key: result.key,
        label: result.label,
        count: result.count,
        previous: result.previous,
        delta: result.delta,
        deltaPct: result.deltaPct,
        deltaDirection: result.deltaDirection,
        trend: result.trend,
        description: result.description,
        category: result.category,
      })));
      setLastRefreshed(new Date());
      if (loaded.some((result) => result.error) || detailed.hadError) {
        setError("Some report data could not be loaded. Totals, breakdowns, or trends may be incomplete; review database access and refresh.");
      }
    } catch (err) {
      setError(adminErrorMessage(err, "The administrative report could not be built. Check your connection and try again."));
    } finally {
      setLoading(false);
    }
  }, [canView, fromDate, toDate, previous]);

  useEffect(() => { void loadReport(); }, [loadReport]);

  const visibleMetrics = useMemo(() => filterMetrics(metrics, search), [metrics, search]);

  const byCategory = useMemo(() => CATEGORY_ORDER.map((category) => ({
    category,
    items: visibleMetrics.filter((metric) => metric.category === category),
  })), [visibleMetrics]);

  if (!canView) return <div className="page-content"><div className="empty-state"><h2>Access restricted</h2></div></div>;
  return <div className="page-content admin-console-page">
    <AdminPageHeader title="Administrative reports" actions={<button className="button button-secondary" type="button" onClick={() => void loadReport()} disabled={loading}>Refresh report</button>} />
    {error && <AdminNotice>{error}</AdminNotice>}
    <section className="panel admin-report-overview" aria-label="Report details">
      <div className="admin-report-overview-copy">
        <span className="eyebrow">REPORT SCOPE</span>
        <h2>Administrative activity and system status</h2>
        <p className="muted">Includes account assignments, sessions, security events, audit history, sensitive-data access, and configuration records. Totals follow the selected dates; daily trends use the selected window or the latest 90 days (30 days for sessions).</p>
      </div>
      <dl className="admin-report-period-details">
        <div><dt>Report period</dt><dd>{fromDate && toDate ? `${formatReportDate(fromDate)} – ${formatReportDate(toDate)}` : fromDate ? `From ${formatReportDate(fromDate)} onward` : toDate ? `All records through ${formatReportDate(toDate)}` : "All available history"}</dd></div>
        <div><dt>Comparison</dt><dd>{previous ? `${formatReportDate(previous.from)} – ${formatReportDate(previous.to)} (${daysInclusive(parseLocalDate(previous.from)!, parseLocalDate(previous.to)!)} days)` : "Choose both dates to compare against the previous equal-length period"}</dd></div>
        <div><dt>Detailed breakdowns</dt><dd>Up to {DETAIL_ROW_LIMIT.toLocaleString()} recent matching records per source, with exact matching totals</dd></div>
        <div><dt>Trend window</dt><dd>{fromDate || toDate ? "Selected date window" : "Latest 90 days; sessions use 30 days"}</dd></div>
        <div><dt>Indicators available</dt><dd>{loading ? "Loading report totals" : `${metrics.filter((metric) => metric.count !== null).length} of ${metrics.length} available`}</dd></div>
        <div><dt>Report refreshed</dt><dd>{formatAdminDate(lastRefreshed ? lastRefreshed.toISOString() : null)}</dd></div>
      </dl>
    </section>
    <section className="panel admin-report-controls">
      <div className="admin-filter-controls">
        <label className="admin-filter-label">From<input type="date" aria-label="Report start date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
        <label className="admin-filter-label">To<input type="date" aria-label="Report end date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
        {previous && <span className="admin-period-comparison">Compared with {previous.from} to {previous.to}</span>}
        <label className="search-box"><input aria-label="Search report metrics" placeholder="Search report totals" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <button className="button button-primary" type="button" onClick={() => downloadReport(metrics, details, fromDate, toDate, previous)} disabled={loading || metrics.length === 0}>Download detailed CSV</button>
      </div>
      <div className="admin-report-meta">
        <span>Last refreshed {formatAdminDate(lastRefreshed ? lastRefreshed.toISOString() : null)}</span>
      </div>
    </section>
    {metrics.length > 0 && !loading && (
      <section className="admin-category-band" aria-label="Report categories">
        {CATEGORY_ORDER.map((category) => {
          const items = metrics.filter((metric) => metric.category === category);
          const available = items.filter((metric) => metric.count !== null).length;
          return <article className="panel admin-category-card" key={category}>
            <div>
              <strong>{category}</strong>
              <span className="admin-category-total">{items.length}</span>
            </div>
            <small>{available} of {items.length} reports available</small>
          </article>;
        })}
      </section>
    )}
    {loading ? <div className="admin-table-state" role="status"><span className="loading-spinner" />Building administrative report…</div>
      : visibleMetrics.length === 0 ? <div className="admin-table-state"><strong>No report totals match</strong></div>
        : <section className="admin-report-grid" aria-label="Administrative report totals">
          {byCategory.map(({ category, items }) => (
            <div key={category}>
              <h3 className="admin-report-category-heading">{category}</h3>
              {items.map((metric) => (
                <article className={`panel admin-report-card ${metric.count === null ? "admin-report-card--unavailable" : ""}`} key={metric.key}>
                  <div className="admin-report-card-head">
                    <div>
                      <h3>{metric.label}</h3>
                      <p className="admin-report-description">{metric.description}</p>
                    </div>
                    <div className="admin-report-card-value">
                      <strong>{metric.count === null ? "Unavailable" : metric.count.toLocaleString()}</strong>
                      {metric.count === null && <AdminStatus tone="warning">Check access</AdminStatus>}
                    </div>
                  </div>
                  <div className="admin-report-comparison">
                    <span>{metric.previous === null ? (previous ? "Previous-period total unavailable" : "Select both dates to compare periods") : `Previous period: ${metric.previous.toLocaleString()}`}</span>
                    {metric.delta !== null && <span className={`admin-delta admin-delta--${metric.deltaDirection}`} aria-label={`${formatDelta({ count: metric.delta, pct: metric.deltaPct, direction: metric.deltaDirection })} compared with the previous period`}>
                      {formatDelta({ count: metric.delta, pct: metric.deltaPct, direction: metric.deltaDirection })} vs prior
                    </span>}
                  </div>
                  {(() => {
                    const peak = metric.trend.reduce<{ date: string; count: number } | null>((highest, point) => !highest || point.count > highest.count ? point : highest, null);
                    const summary = summarizeTrend(metric.trend);
                    return <div className="admin-report-trend">
                      <div className="admin-report-sparkline"><Sparkline values={metric.trend.map((point) => point.count)} /></div>
                      <div className="admin-report-trend-copy">
                        {peak ? <>
                          <span>{summary?.total.toLocaleString()} records · {summary?.activeDays} active of {metric.trend.length} days · {summary?.average.toFixed(1)} daily average</span>
                          <span>{peak.count === 0 ? "No recorded activity in this window" : `Daily peak: ${peak.count.toLocaleString()} on ${formatReportDate(peak.date)}`}</span>
                        </> : <span>Trend unavailable</span>}
                      </div>
                    </div>;
                  })()}
                </article>
              ))}
            </div>
          ))}
        </section>}
    {!loading && details.length > 0 && <section className="admin-report-details" aria-label="Detailed administrative breakdowns">
      <div className="admin-report-details-heading">
        <div><span className="eyebrow">DETAILED BREAKDOWNS</span><h2>Operational and governance detail</h2></div>
        <p>Grouped counts provide context for the headline totals. Personal identifiers, configuration values, and record contents are not included.</p>
      </div>
      <div className="admin-report-detail-grid">
        {details.map((section) => (
          <article className="panel admin-report-detail-card" key={section.key}>
            <header><div><h3>{section.title}</h3><p>{section.description}</p></div><AdminStatus tone={section.unavailable || section.total > section.analyzed ? "warning" : "neutral"}>{section.unavailable ? "Unavailable" : `${section.analyzed.toLocaleString()} of ${section.total.toLocaleString()} analyzed`}</AdminStatus></header>
            {section.total > section.analyzed && !section.unavailable && <p className="admin-report-sample-note">Breakdown uses the latest {section.analyzed.toLocaleString()} of {section.total.toLocaleString()} matching records. Headline totals are exact.</p>}
            {section.unavailable ? <div className="admin-inline-empty">Breakdown unavailable. Review the report notice above and refresh.</div> : section.groups.length === 0 ? <div className="admin-inline-empty">No matching records in this period.</div> : <div className="table-scroll"><table className="admin-report-breakdown-table"><thead><tr><th>Measure</th><th>Category / value</th><th>Count</th><th>Share of analyzed</th></tr></thead><tbody>
              {section.groups.map((item, index) => <tr key={`${item.dimension}-${item.label}-${index}`}><td>{item.dimension}</td><td>{item.label}</td><td>{item.count.toLocaleString()}</td><td>{item.share}%</td></tr>)}
            </tbody></table></div>}
          </article>
        ))}
      </div>
    </section>}
  </div>;
}
