import { useId, type ReactNode } from "react";

export interface DashboardHourlyActivity {
  bucket_start: string;
  success_count: number | string;
  failure_count: number | string;
  warning_count: number | string;
  skipped_count: number | string;
}

interface AdminDashboardChartsProps {
  accounts: number | null;
  activeAccounts: number | null;
  suspendedAccounts: number | null;
  hourlyActivity: DashboardHourlyActivity[] | null;
  loading: boolean;
}

interface ActivityPoint {
  date: Date;
  total: number;
  failures: number;
}

interface ActivityCandle {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
}

const chartWidth = 680;
const chartHeight = 230;
const plot = { left: 43, top: 15, right: 12, bottom: 35 };
const plotWidth = chartWidth - plot.left - plot.right;
const plotHeight = chartHeight - plot.top - plot.bottom;
const colors = {
  active: "#18a978",
  suspended: "#f07d52",
  inactive: "#8771e8",
  total: "#5169e8",
  failures: "#f26b79",
  candleUp: "#18a978",
  candleDown: "#f07d52",
};

function numberValue(value: number | string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function totalEvents(row: DashboardHourlyActivity) {
  return numberValue(row.success_count) + numberValue(row.failure_count)
    + numberValue(row.warning_count) + numberValue(row.skipped_count);
}

function localDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfLocalDay(dayOffset: number) {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() + dayOffset);
  return day;
}

function formatAxisDay(date: Date) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function formatTooltipDay(date: Date) {
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(date);
}

function activityPoints(hourlyActivity: DashboardHourlyActivity[] | null, days: number): ActivityPoint[] {
  const byDay = new Map<string, { total: number; failures: number }>();
  for (const row of hourlyActivity ?? []) {
    const date = new Date(row.bucket_start);
    if (Number.isNaN(date.getTime())) continue;
    const key = localDayKey(date);
    const current = byDay.get(key) ?? { total: 0, failures: 0 };
    current.total += totalEvents(row);
    current.failures += numberValue(row.failure_count);
    byDay.set(key, current);
  }
  return Array.from({ length: days }, (_, index) => {
    const date = startOfLocalDay(index - days + 1);
    const counts = byDay.get(localDayKey(date)) ?? { total: 0, failures: 0 };
    return { date, ...counts };
  });
}

function activityHistogram(hourlyActivity: DashboardHourlyActivity[] | null) {
  const counts = Array.from({ length: 24 }, () => 0);
  const today = startOfLocalDay(0);
  const firstDay = startOfLocalDay(-7);
  for (const row of hourlyActivity ?? []) {
    const date = new Date(row.bucket_start);
    if (Number.isNaN(date.getTime()) || date < firstDay || date >= today) continue;
    counts[date.getHours()] += totalEvents(row);
  }
  return counts;
}

function activityCandles(hourlyActivity: DashboardHourlyActivity[] | null): ActivityCandle[] {
  const byDay = new Map<string, { date: Date; hour: number; count: number }[]>();
  for (const row of hourlyActivity ?? []) {
    const date = new Date(row.bucket_start);
    if (Number.isNaN(date.getTime())) continue;
    const key = localDayKey(date);
    const hours = byDay.get(key) ?? [];
    hours.push({ date, hour: date.getHours(), count: totalEvents(row) });
    byDay.set(key, hours);
  }
  return Array.from({ length: 7 }, (_, index) => {
    const date = startOfLocalDay(index - 6);
    const hours = (byDay.get(localDayKey(date)) ?? []).sort((left, right) => left.date.getTime() - right.date.getTime());
    const volumes = hours.map((hour) => hour.count);
    return {
      date,
      open: volumes[0] ?? 0,
      high: volumes.length ? Math.max(...volumes) : 0,
      low: volumes.length ? Math.min(...volumes) : 0,
      close: volumes[volumes.length - 1] ?? 0,
    };
  });
}

function ChartLoading() {
  return <div className="admin-chart-empty" role="status">Loading chart data…</div>;
}

function ChartUnavailable({ message = "No audit activity is available for this period." }: { message?: string }) {
  return <div className="admin-chart-empty">{message}</div>;
}

function LineChart({ points }: { points: ActivityPoint[] }) {
  const chartId = useId().replaceAll(":", "");
  const max = Math.max(1, ...points.map((point) => point.total));
  const y = (value: number) => plot.top + plotHeight - (value / max) * plotHeight;
  const x = (index: number) => plot.left + (points.length <= 1 ? 0 : index * plotWidth / (points.length - 1));
  const totalPath = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(point.total)}`).join(" ");
  const failurePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(point.failures)}`).join(" ");
  const ticks = 4;

  return <div className="admin-chart-visual">
    <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="Line chart showing total and failed audit activity by day for the past 14 days">
      <title>Daily audit activity and failures, past 14 days</title>
      {Array.from({ length: ticks + 1 }, (_, index) => {
        const value = Math.round(max * index / ticks);
        const yPosition = y(value);
        return <g key={index}>
          <line className="admin-chart-gridline" x1={plot.left} x2={chartWidth - plot.right} y1={yPosition} y2={yPosition} />
          <text className="admin-chart-axis-label" x={plot.left - 8} y={yPosition + 4} textAnchor="end">{value}</text>
        </g>;
      })}
      <path className="admin-chart-line admin-chart-line-total" d={totalPath} style={{ stroke: `url(#${chartId}-total)` }} />
      <path className="admin-chart-line admin-chart-line-failure" d={failurePath} />
      {points.map((point, index) => <g key={localDayKey(point.date)}>
        {(index % 2 === 0 || index === points.length - 1) && <text className="admin-chart-axis-label" x={x(index)} y={chartHeight - 9} textAnchor="middle">{formatAxisDay(point.date)}</text>}
        <circle className="admin-chart-point admin-chart-point-total" cx={x(index)} cy={y(point.total)} r="3.5">
          <title>{`${formatTooltipDay(point.date)}: ${point.total.toLocaleString()} audit entries`}</title>
        </circle>
        <circle className="admin-chart-point admin-chart-point-failure" cx={x(index)} cy={y(point.failures)} r="3">
          <title>{`${formatTooltipDay(point.date)}: ${point.failures.toLocaleString()} failed entries`}</title>
        </circle>
      </g>)}
      <defs>
        <linearGradient id={`${chartId}-total`} x1="0" x2="1">
          <stop offset="0%" stopColor={colors.total} />
          <stop offset="100%" stopColor="#08a9c5" />
        </linearGradient>
      </defs>
    </svg>
  </div>;
}

function AccountDonut({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = 65;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return <div className="admin-donut-layout">
    <div className="admin-donut-visual">
      <svg viewBox="0 0 180 180" role="img" aria-label={`Donut chart showing ${total.toLocaleString()} role assignments by access status`}>
        <title>Role assignment status distribution</title>
        <circle className="admin-donut-track" cx="90" cy="90" r={radius} />
        {total > 0 && segments.filter((segment) => segment.value > 0).map((segment) => {
          const length = segment.value / total * circumference;
          const dashOffset = offset;
          offset += length;
          return <circle
            key={segment.label}
            cx="90"
            cy="90"
            r={radius}
            fill="none"
            stroke={segment.color}
            strokeWidth="20"
            strokeDasharray={`${length} ${circumference - length}`}
            strokeDashoffset={-dashOffset}
            transform="rotate(-90 90 90)"
          ><title>{`${segment.label}: ${segment.value.toLocaleString()}`}</title></circle>;
        })}
        <text className="admin-donut-total" x="90" y="86" textAnchor="middle">{total.toLocaleString()}</text>
        <text className="admin-donut-caption" x="90" y="106" textAnchor="middle">assignments</text>
      </svg>
    </div>
    <ul className="admin-chart-legend admin-donut-legend">
      {segments.map((segment) => <li key={segment.label}>
        <span className="admin-legend-key" style={{ backgroundColor: segment.color }} />
        <span className="admin-legend-label">{segment.label}</span>
        <strong>{segment.value.toLocaleString()}</strong>
        <small>{total > 0 ? `${Math.round(segment.value / total * 100)}%` : "0%"}</small>
      </li>)}
    </ul>
  </div>;
}

function Histogram({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const y = (value: number) => plot.top + plotHeight - value / max * plotHeight;
  const barWidth = plotWidth / values.length * 0.64;

  return <div className="admin-chart-visual">
    <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="Histogram of audit entries by hour of day across the past seven complete days">
      <title>Audit activity by hour of day, past seven complete days</title>
      {Array.from({ length: 5 }, (_, index) => {
        const value = Math.round(max * index / 4);
        const yPosition = y(value);
        return <g key={index}>
          <line className="admin-chart-gridline" x1={plot.left} x2={chartWidth - plot.right} y1={yPosition} y2={yPosition} />
          <text className="admin-chart-axis-label" x={plot.left - 8} y={yPosition + 4} textAnchor="end">{value}</text>
        </g>;
      })}
      {values.map((value, hour) => {
        const width = plotWidth / values.length;
        const x = plot.left + hour * width + (width - barWidth) / 2;
        const barY = y(value);
        return <g key={hour}>
          <rect className="admin-chart-bar" x={x} y={barY} width={barWidth} height={Math.max(0, plot.top + plotHeight - barY)} rx="3">
            <title>{`${String(hour).padStart(2, "0")}:00 — ${value.toLocaleString()} audit entries across the past 7 days`}</title>
          </rect>
          {hour % 6 === 0 && <text className="admin-chart-axis-label" x={x + barWidth / 2} y={chartHeight - 9} textAnchor="middle">{String(hour).padStart(2, "0")}:00</text>}
        </g>;
      })}
    </svg>
  </div>;
}

function ActivityCandles({ candles }: { candles: ActivityCandle[] }) {
  const max = Math.max(1, ...candles.map((candle) => candle.high));
  const y = (value: number) => plot.top + plotHeight - value / max * plotHeight;
  const slotWidth = plotWidth / candles.length;
  const bodyWidth = Math.min(30, slotWidth * 0.42);

  return <div className="admin-chart-visual">
    <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="Candlestick chart showing hourly audit activity ranges for each of the past seven days">
      <title>Daily audit activity range, past seven days</title>
      {Array.from({ length: 5 }, (_, index) => {
        const value = Math.round(max * index / 4);
        const yPosition = y(value);
        return <g key={index}>
          <line className="admin-chart-gridline" x1={plot.left} x2={chartWidth - plot.right} y1={yPosition} y2={yPosition} />
          <text className="admin-chart-axis-label" x={plot.left - 8} y={yPosition + 4} textAnchor="end">{value}</text>
        </g>;
      })}
      {candles.map((candle, index) => {
        const center = plot.left + index * slotWidth + slotWidth / 2;
        const bodyTop = Math.min(y(candle.open), y(candle.close));
        const bodyHeight = Math.max(2, Math.abs(y(candle.open) - y(candle.close)));
        const color = candle.close >= candle.open ? colors.candleUp : colors.candleDown;
        return <g key={localDayKey(candle.date)}>
          <line x1={center} x2={center} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth="2" />
          <rect x={center - bodyWidth / 2} y={bodyTop} width={bodyWidth} height={bodyHeight} rx="3" fill={color}>
            <title>{`${formatTooltipDay(candle.date)} — open ${candle.open}, high ${candle.high}, low ${candle.low}, close ${candle.close} audit entries per hour`}</title>
          </rect>
          <text className="admin-chart-axis-label" x={center} y={chartHeight - 9} textAnchor="middle">{formatAxisDay(candle.date)}</text>
        </g>;
      })}
    </svg>
  </div>;
}

function ChartCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="panel admin-chart-card">
    <header className="admin-chart-heading"><div><h2>{title}</h2><p>{description}</p></div></header>
    {children}
  </section>;
}

export default function AdminDashboardCharts({ accounts, activeAccounts, suspendedAccounts, hourlyActivity, loading }: AdminDashboardChartsProps) {
  const accountDataAvailable = accounts !== null && activeAccounts !== null && suspendedAccounts !== null;
  const active = activeAccounts ?? 0;
  const suspended = suspendedAccounts ?? 0;
  const inactive = accountDataAvailable ? Math.max(0, (accounts ?? 0) - active - suspended) : 0;
  const accountSegments = [
    { label: "Active", value: active, color: colors.active },
    { label: "Suspended", value: suspended, color: colors.suspended },
    { label: "Inactive", value: inactive, color: colors.inactive },
  ];
  const points = activityPoints(hourlyActivity, 14);
  const candles = activityCandles(hourlyActivity);
  const histogram = activityHistogram(hourlyActivity);
  const hasAuditData = hourlyActivity !== null;

  return <section className="admin-chart-section" aria-label="System activity charts">
    <header className="admin-section-heading"><div><span className="admin-section-kicker">System overview</span><h2>Activity and access patterns</h2></div><span className="admin-chart-period">Live data · refreshed with dashboard</span></header>
    <div className="admin-chart-grid">
      <ChartCard title="Account access status" description="Role assignments grouped by current access state.">
        {loading ? <ChartLoading /> : accountDataAvailable ? <AccountDonut segments={accountSegments} /> : <ChartUnavailable message="Account status totals are unavailable." />}
      </ChartCard>
      <ChartCard title="Audit activity trend" description="Daily audit entries and failed actions · past 14 days.">
        {loading ? <ChartLoading /> : hasAuditData ? <>
          <LineChart points={points} />
          <div className="admin-chart-legend admin-chart-inline-legend"><span><i className="admin-legend-line admin-legend-line-total" />All activity</span><span><i className="admin-legend-line admin-legend-line-failure" />Failures</span></div>
        </> : <ChartUnavailable />}
      </ChartCard>
      <ChartCard title="Hourly activity range" description="Daily open, high, low and close audit volume per hour · past 7 days.">
        {loading ? <ChartLoading /> : hasAuditData ? <>
          <ActivityCandles candles={candles} />
          <div className="admin-chart-legend admin-chart-inline-legend"><span><i className="admin-legend-candle admin-legend-candle-up" />Activity rose</span><span><i className="admin-legend-candle admin-legend-candle-down" />Activity fell</span></div>
        </> : <ChartUnavailable />}
      </ChartCard>
      <ChartCard title="Activity by hour" description="Audit entries grouped by hour of day · past 7 complete days.">
        {loading ? <ChartLoading /> : hasAuditData ? <Histogram values={histogram} /> : <ChartUnavailable />}
      </ChartCard>
    </div>
  </section>;
}
