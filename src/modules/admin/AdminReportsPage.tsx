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
  { key: "accounts", label: "Managed accounts", description: "User-role records; a person assigned multiple roles is counted once per role", category: "Accounts", table: "user_roles", tsColumn: "createdat", allTimeWindowDays: 90 },
  { key: "active", label: "Active accounts", description: "Role assignments currently active and not suspended", category: "Accounts", table: "user_roles", tsColumn: "createdat", filters: [["isactive", "eq", true], ["issuspended", "eq", false]], allTimeWindowDays: 90 },
  { key: "suspended", label: "Suspended accounts", description: "Accounts suspended by platform administration", category: "Accounts", table: "user_roles", tsColumn: "createdat", filters: [["issuspended", "eq", true]], allTimeWindowDays: 90 },
  { key: "sessions", label: "Active sessions", description: "Active tracked sessions that have not expired", category: "Security", table: "user_sessions", tsColumn: "createdat", filters: [["isactive", "eq", true]], allTimeWindowDays: 30 },
  { key: "events", label: "Open security events", description: "Security alerts awaiting resolution", category: "Security", table: "security_event", tsColumn: "created_at", filters: [["resolved", "eq", false]], allTimeWindowDays: 90 },
  { key: "audit", label: "Audit records in period", description: "System activity recorded in the selected period", category: "History", table: "audit_log", tsColumn: "created_at", allTimeWindowDays: 90 },
  { key: "sensitive", label: "Sensitive reads in period", description: "Sensitive-read events recorded in the selected period", category: "History", table: "sensitive_read_log", tsColumn: "timestamp", allTimeWindowDays: 90 },
  { key: "configuration", label: "Configuration entries", description: "System configuration values", category: "Technical", table: "system_config", tsColumn: "createdat", allTimeWindowDays: 90 },
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

function downloadReport(metrics: ReportMetric[], fromDate: string, toDate: string, previous: { from: string; to: string } | null) {
  const generatedAt = new Date().toISOString();
  const csv = [
    ["Report", "Category", "Count", "Previous", "Delta", "Δ%", "Description", "Period start", "Period end", "Previous start", "Previous end", "Generated at"].map(csvCell).join(","),
    ...metrics.map((row) => [
      row.label, row.category,
      row.count ?? "Unavailable", row.previous ?? "Unavailable",
      row.delta === null ? "Unavailable" : row.delta,
      row.deltaPct === null ? "Unavailable" : `${row.deltaPct >= 0 ? "+" : ""}${row.deltaPct}%`,
      row.description,
      fromDate || "All time", toDate || "Current",
      previous ? previous.from : "—", previous ? previous.to : "—",
      generatedAt,
    ].map(csvCell).join(",")),
  ].join("\r\n");
  const file = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const objectUrl = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `dhrmis-administration-report-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
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
    if (!canView) { setMetrics([]); setLoading(false); return; }
    if (!supabase) { setMetrics([]); setError("The system data service is not configured."); setLoading(false); return; }
    if (fromDate && toDate && fromDate > toDate) {
      setError("The report start date must be on or before the end date.");
      setMetrics([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const start = fromDate ? startOfDay(fromDate) : undefined;
    const end = toDate ? endOfDay(toDate) : undefined;
    const pStart = previous ? startOfDay(previous.from) : undefined;
    const pEnd = previous ? endOfDay(previous.to) : undefined;
    const nowISO = new Date().toISOString();

    try {
      const loaded = await Promise.all(METRIC_SOURCES.map(async (source) => {
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
      }));
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
      if (loaded.some((result) => result.error)) {
        setError("Some report data could not be loaded. Missing totals or trends may be incomplete; review database access and refresh.");
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
    <AdminPageHeader title="Administrative reports" description="Create summary reports from account, session, security and system activity records." icon="chart" actions={<button className="button button-secondary" type="button" onClick={() => void loadReport()} disabled={loading}>Refresh report</button>} />
    {error && <AdminNotice>{error}</AdminNotice>}
    <section className="panel admin-report-overview" aria-label="Report details">
      <div className="admin-report-overview-copy">
        <span className="eyebrow">REPORT COVERAGE</span>
        <h2>Administrative activity summary</h2>
        <p>Date filters use each record’s creation or event date. Account, session and security status totals reflect their current status.</p>
      </div>
      <dl className="admin-report-period-details">
        <div><dt>Report period</dt><dd>{fromDate && toDate ? `${formatReportDate(fromDate)} – ${formatReportDate(toDate)}` : fromDate ? `From ${formatReportDate(fromDate)}` : toDate ? `Through ${formatReportDate(toDate)}` : "All available history"}</dd></div>
        <div><dt>Comparison</dt><dd>{previous ? `${formatReportDate(previous.from)} – ${formatReportDate(previous.to)}` : "Select both dates to compare with an equal-length prior period"}</dd></div>
        <div><dt>Daily trend</dt><dd>{fromDate || toDate ? "Selected date window" : "Most recent 90 days; sessions use 30 days"}</dd></div>
      </dl>
    </section>
    <section className="panel admin-report-controls">
      <div className="admin-filter-controls">
        <label className="admin-filter-label">From<input type="date" aria-label="Report start date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
        <label className="admin-filter-label">To<input type="date" aria-label="Report end date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
        {previous && <span className="admin-period-comparison">Compared with {previous.from} to {previous.to}</span>}
        <label className="search-box"><input aria-label="Search report metrics" placeholder="Search report totals" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <button className="button button-primary" type="button" onClick={() => downloadReport(metrics, fromDate, toDate, previous)} disabled={loading || metrics.length === 0}>Download CSV</button>
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
                      <p className="admin-report-card-description">{metric.description}</p>
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
                    return <div className="admin-report-trend">
                      <div className="admin-report-sparkline"><Sparkline values={metric.trend.map((point) => point.count)} /></div>
                      <div className="admin-report-trend-copy">
                        {peak ? <>
                          <span>Daily trend · {metric.trend.length} days</span>
                          <span>{peak.count === 0 ? "No recorded activity in this window" : `Peak: ${peak.count.toLocaleString()} on ${formatReportDate(peak.date)}`}</span>
                        </> : <span>Trend unavailable</span>}
                      </div>
                    </div>;
                  })()}
                </article>
              ))}
            </div>
          ))}
        </section>}
  </div>;
}
