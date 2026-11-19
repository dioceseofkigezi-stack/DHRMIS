import { useId, type ReactNode } from "react";

export interface WorkspaceAnalyticsRow {
  series_key: "assignment_activity" | "employment_status";
  bucket_start: string | null;
  value: number | string;
  label: string | null;
}

interface WorkspaceMetric {
  label: string;
  table: string;
  value: number | null;
}

interface WorkspaceDashboardChartsProps {
  workspaceName: string;
  metrics: WorkspaceMetric[];
  analytics: WorkspaceAnalyticsRow[] | null;
  loading: boolean;
}

interface ActivityPoint {
  date: Date;
  count: number;
}

interface ActivityCandle {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
}

const width = 680;
const height = 230;
const plot = { left: 43, top: 15, right: 12, bottom: 35 };
const plotWidth = width - plot.left - plot.right;
const plotHeight = height - plot.top - plot.bottom;
const statusColors: Record<string, string> = {
  Active: "#18a978",
  OnLeave: "#4e91d9",
  Suspended: "#f07d52",
  Retired: "#8771e8",
  Resigned: "#d4649b",
  Separated: "#d49a35",
  DeceasedActive: "#778397",
};

function numericValue(value: number | string) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfDay(dayOffset: number) {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() + dayOffset);
  return day;
}

function axisDay(date: Date) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function tooltipDay(date: Date) {
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(date);
}

function activityRows(rows: WorkspaceAnalyticsRow[] | null) {
  return (rows ?? []).flatMap((row) => {
    if (row.series_key !== "assignment_activity" || !row.bucket_start) return [];
    const date = new Date(row.bucket_start);
    return Number.isNaN(date.getTime()) ? [] : [{ date, count: numericValue(row.value) }];
  });
}

function activityPoints(rows: WorkspaceAnalyticsRow[] | null, days: number): ActivityPoint[] {
  const countsByDay = new Map<string, number>();
  for (const row of activityRows(rows)) {
    const key = dayKey(row.date);
    countsByDay.set(key, (countsByDay.get(key) ?? 0) + row.count);
  }
  return Array.from({ length: days }, (_, index) => {
    const date = startOfDay(index - days + 1);
    return { date, count: countsByDay.get(dayKey(date)) ?? 0 };
  });
}

function activityCandles(rows: WorkspaceAnalyticsRow[] | null): ActivityCandle[] {
  const hourlyByDay = new Map<string, { date: Date; count: number }[]>();
  for (const row of activityRows(rows)) {
    const key = dayKey(row.date);
    const hours = hourlyByDay.get(key) ?? [];
    hours.push({ date: row.date, count: row.count });
    hourlyByDay.set(key, hours);
  }
  return Array.from({ length: 7 }, (_, index) => {
    const date = startOfDay(index - 6);
    const hours = (hourlyByDay.get(dayKey(date)) ?? []).sort((left, right) => left.date.getTime() - right.date.getTime());
    const values = hours.map((hour) => hour.count);
    return {
      date,
      open: values[0] ?? 0,
      high: values.length ? Math.max(...values) : 0,
      low: values.length ? Math.min(...values) : 0,
      close: values[values.length - 1] ?? 0,
    };
  });
}

function ChartLoading() {
  return <div className="admin-chart-empty" role="status">Loading chart data…</div>;
}

function ChartUnavailable({ message }: { message: string }) {
  return <div className="admin-chart-empty">{message}</div>;
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return <section className="panel admin-chart-card">
    <header className="admin-chart-heading"><h2>{title}</h2></header>
    {children}
  </section>;
}

function RecordVolumeChart({ metrics }: { metrics: WorkspaceMetric[] }) {
  const rows = metrics.filter((metric) => metric.value !== null);
  if (!rows.length) return <ChartUnavailable message="Workspace record totals are unavailable." />;

  const chartHeight = Math.max(180, rows.length * 29 + 48);
  const left = 186;
  const right = 25;
  const top = 12;
  const bottom = 32;
  const plotWidth = width - left - right;
  const max = Math.max(1, ...rows.map((row) => row.value ?? 0));
  const x = (value: number) => left + value / max * plotWidth;
  const labelText = (label: string) => label.length > 24 ? `${label.slice(0, 23)}…` : label;

  return <div className="admin-chart-visual">
    <svg viewBox={`0 0 ${width} ${chartHeight}`} role="img" aria-label="Bar chart comparing record totals by workspace area">
      <title>Workspace records by area</title>
      {Array.from({ length: 5 }, (_, index) => {
        const value = Math.round(max * index / 4);
        const xPosition = x(value);
        return <g key={index}>
          <line className="admin-chart-gridline" x1={xPosition} x2={xPosition} y1={top} y2={chartHeight - bottom} />
          <text className="admin-chart-axis-label" x={xPosition} y={chartHeight - 8} textAnchor="middle">{value.toLocaleString()}</text>
        </g>;
      })}
      {rows.map((metric, index) => {
        const y = top + index * 29 + 3;
        const barWidth = Math.max(0, x(metric.value ?? 0) - left);
        return <g key={metric.table}>
          <text className="admin-chart-axis-label" x={left - 9} y={y + 14} textAnchor="end"><title>{metric.label}</title>{labelText(metric.label)}</text>
          <rect className="admin-chart-bar" x={left} y={y} width={barWidth} height="17" rx="4">
            <title>{`${metric.label}: ${(metric.value ?? 0).toLocaleString()} records`}</title>
          </rect>
        </g>;
      })}
    </svg>
  </div>;
}

function EmploymentStatusDonut({ rows }: { rows: WorkspaceAnalyticsRow[] }) {
  const statuses = rows.filter((row) => row.series_key === "employment_status" && row.label)
    .map((row) => ({ label: row.label!, value: numericValue(row.value) }))
    .filter((row) => row.value > 0);
  const total = statuses.reduce((sum, row) => sum + row.value, 0);
  if (total === 0) return <ChartUnavailable message="No current employee status totals are available." />;

  const radius = 65;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return <div className="admin-donut-layout">
    <div className="admin-donut-visual">
      <svg viewBox="0 0 180 180" role="img" aria-label={`Donut chart showing ${total.toLocaleString()} employees by employment status`}>
        <title>Current employee status mix</title>
        <circle className="admin-donut-track" cx="90" cy="90" r={radius} />
        {statuses.map((status) => {
          const segmentLength = status.value / total * circumference;
          const dashOffset = offset;
          offset += segmentLength;
          return <circle key={status.label} cx="90" cy="90" r={radius} fill="none"
            stroke={statusColors[status.label] ?? "#7a8798"} strokeWidth="20"
            strokeDasharray={`${segmentLength} ${circumference - segmentLength}`}
            strokeDashoffset={-dashOffset} transform="rotate(-90 90 90)">
            <title>{`${status.label.replaceAll(/([a-z])([A-Z])/g, "$1 $2")}: ${status.value.toLocaleString()}`}</title>
          </circle>;
        })}
        <text className="admin-donut-total" x="90" y="86" textAnchor="middle">{total.toLocaleString()}</text>
        <text className="admin-donut-caption" x="90" y="106" textAnchor="middle">employees</text>
      </svg>
    </div>
    <ul className="admin-chart-legend admin-donut-legend">
      {statuses.map((status) => <li key={status.label}>
        <span className="admin-legend-key" style={{ backgroundColor: statusColors[status.label] ?? "#7a8798" }} />
        <span className="admin-legend-label">{status.label.replaceAll(/([a-z])([A-Z])/g, "$1 $2")}</span>
        <strong>{status.value.toLocaleString()}</strong>
        <small>{Math.round(status.value / total * 100)}%</small>
      </li>)}
    </ul>
  </div>;
}

function AssignmentTrendChart({ points }: { points: ActivityPoint[] }) {
  const chartId = useId().replaceAll(":", "");
  const max = Math.max(1, ...points.map((point) => point.count));
  const y = (value: number) => plot.top + plotHeight - value / max * plotHeight;
  const x = (index: number) => plot.left + (points.length <= 1 ? 0 : index * plotWidth / (points.length - 1));
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(point.count)}`).join(" ");

  return <div className="admin-chart-visual">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Line chart showing new assignment records by day over the past 14 days">
      <title>New assignment records, past 14 days</title>
      {Array.from({ length: 5 }, (_, index) => {
        const value = Math.round(max * index / 4);
        const yPosition = y(value);
        return <g key={index}>
          <line className="admin-chart-gridline" x1={plot.left} x2={width - plot.right} y1={yPosition} y2={yPosition} />
          <text className="admin-chart-axis-label" x={plot.left - 8} y={yPosition + 4} textAnchor="end">{value}</text>
        </g>;
      })}
      <path className="admin-chart-line admin-chart-line-total" d={path} style={{ stroke: `url(#${chartId}-line)` }} />
      {points.map((point, index) => <g key={dayKey(point.date)}>
        {(index % 2 === 0 || index === points.length - 1) && <text className="admin-chart-axis-label" x={x(index)} y={height - 9} textAnchor="middle">{axisDay(point.date)}</text>}
        <circle className="admin-chart-point admin-chart-point-total" cx={x(index)} cy={y(point.count)} r="3.5">
          <title>{`${tooltipDay(point.date)}: ${point.count.toLocaleString()} new assignment records`}</title>
        </circle>
      </g>)}
      <defs><linearGradient id={`${chartId}-line`} x1="0" x2="1"><stop offset="0%" stopColor="#5169e8" /><stop offset="100%" stopColor="#08a9c5" /></linearGradient></defs>
    </svg>
  </div>;
}

function AssignmentCandles({ candles }: { candles: ActivityCandle[] }) {
  const max = Math.max(1, ...candles.map((candle) => candle.high));
  const y = (value: number) => plot.top + plotHeight - value / max * plotHeight;
  const slotWidth = plotWidth / candles.length;
  const bodyWidth = Math.min(30, slotWidth * 0.42);

  return <div className="admin-chart-visual">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Candlestick chart of hourly assignment record activity for the past seven days">
      <title>Daily assignment activity range, past seven days</title>
      {Array.from({ length: 5 }, (_, index) => {
        const value = Math.round(max * index / 4);
        const yPosition = y(value);
        return <g key={index}>
          <line className="admin-chart-gridline" x1={plot.left} x2={width - plot.right} y1={yPosition} y2={yPosition} />
          <text className="admin-chart-axis-label" x={plot.left - 8} y={yPosition + 4} textAnchor="end">{value}</text>
        </g>;
      })}
      {candles.map((candle, index) => {
        const center = plot.left + index * slotWidth + slotWidth / 2;
        const bodyTop = Math.min(y(candle.open), y(candle.close));
        const bodyHeight = Math.max(2, Math.abs(y(candle.open) - y(candle.close)));
        const color = candle.close >= candle.open ? "#18a978" : "#f07d52";
        return <g key={dayKey(candle.date)}>
          <line x1={center} x2={center} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth="2" />
          <rect x={center - bodyWidth / 2} y={bodyTop} width={bodyWidth} height={bodyHeight} rx="3" fill={color}>
            <title>{`${tooltipDay(candle.date)} — open ${candle.open}, high ${candle.high}, low ${candle.low}, close ${candle.close} assignment records per hour`}</title>
          </rect>
          <text className="admin-chart-axis-label" x={center} y={height - 9} textAnchor="middle">{axisDay(candle.date)}</text>
        </g>;
      })}
    </svg>
  </div>;
}

export default function WorkspaceDashboardCharts({ workspaceName, metrics, analytics, loading }: WorkspaceDashboardChartsProps) {
  const points = activityPoints(analytics, 14);
  const candles = activityCandles(analytics);
  const hasActivity = analytics !== null && analytics.some((row) => row.series_key === "assignment_activity");

  return <section className="admin-chart-section workspace-dashboard-charts" aria-label={`${workspaceName} workforce charts`}>
    <header className="admin-section-heading">
      <div><span className="admin-section-kicker">Workspace overview</span><h2>Workforce analytics</h2></div>
      <span className="admin-chart-period">Current totals · 30-day activity</span>
    </header>
    <div className="admin-chart-grid">
      <ChartCard title="Records by workspace area">{loading ? <ChartLoading /> : <RecordVolumeChart metrics={metrics} />}</ChartCard>
      <ChartCard title="Employment status mix">
        {loading ? <ChartLoading /> : analytics ? <EmploymentStatusDonut rows={analytics} /> : <ChartUnavailable message="Employee status data is unavailable." />}
      </ChartCard>
      <ChartCard title="Assignment activity trend">
        {loading ? <ChartLoading /> : hasActivity ? <>
          <AssignmentTrendChart points={points} />
          <div className="admin-chart-legend admin-chart-inline-legend"><span><i className="admin-legend-line admin-legend-line-total" />New assignment records</span></div>
        </> : <ChartUnavailable message="Assignment activity is unavailable for this period." />}
      </ChartCard>
      <ChartCard title="Daily assignment activity range">
        {loading ? <ChartLoading /> : hasActivity ? <>
          <AssignmentCandles candles={candles} />
          <div className="admin-chart-legend admin-chart-inline-legend"><span><i className="admin-legend-candle admin-legend-candle-up" />Hourly activity rose</span><span><i className="admin-legend-candle admin-legend-candle-down" />Hourly activity fell</span></div>
        </> : <ChartUnavailable message="Assignment activity is unavailable for this period." />}
      </ChartCard>
    </div>
  </section>;
}
