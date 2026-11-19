import { describe, expect, it } from "vitest";
import {
  bucketTrend,
  computeDelta,
  filterMetrics,
  formatDelta,
  previousPeriodBounds,
  type Delta,
  type ReportMetric,
} from "./AdminReportsPage";

describe("previousPeriodBounds", () => {
  it("computes the equal-length period immediately before a ranged period", () => {
    expect(previousPeriodBounds("2026-03-10", "2026-03-15")).toEqual({
      from: "2026-03-04",
      to: "2026-03-09",
    });
  });

  it("handles a single-day period", () => {
    expect(previousPeriodBounds("2026-03-10", "2026-03-10")).toEqual({
      from: "2026-03-09",
      to: "2026-03-09",
    });
  });

  it("crosses a month boundary", () => {
    expect(previousPeriodBounds("2026-03-01", "2026-03-07")).toEqual({
      from: "2026-02-22",
      to: "2026-02-28",
    });
  });

  it("returns null for invalid or reversed ranges", () => {
    expect(previousPeriodBounds("2026-03-15", "2026-03-10")).toBeNull();
    expect(previousPeriodBounds("not-a-date", "2026-03-10")).toBeNull();
    expect(previousPeriodBounds("2026-03-10", "not-a-date")).toBeNull();
  });
});

describe("computeDelta", () => {
  it("reports an increase", () => {
    expect(computeDelta(100, 80)).toEqual({ count: 20, pct: 25, direction: "up" });
  });

  it("reports a decrease", () => {
    expect(computeDelta(80, 100)).toEqual({ count: -20, pct: -20, direction: "down" });
  });

  it("reports no change", () => {
    expect(computeDelta(100, 100)).toEqual({ count: 0, pct: 0, direction: "neutral" });
  });

  it("treats a rise from zero as 100%", () => {
    expect(computeDelta(5, 0)).toEqual({ count: 5, pct: 100, direction: "up" });
  });

  it("returns null when either side is unavailable", () => {
    expect(computeDelta(null, 80)).toEqual({ count: null, pct: null, direction: null });
    expect(computeDelta(100, null)).toEqual({ count: null, pct: null, direction: null });
    expect(computeDelta(null, null)).toEqual({ count: null, pct: null, direction: null });
  });
});

describe("formatDelta", () => {
  it("formats an increase", () => {
    expect(formatDelta({ count: 20, pct: 25, direction: "up" })).toBe("+20 (25%)");
  });

  it("formats a decrease", () => {
    expect(formatDelta({ count: -20, pct: -20, direction: "down" })).toBe("-20 (-20%)");
  });

  it("formats no change", () => {
    expect(formatDelta({ count: 0, pct: 0, direction: "neutral" })).toBe("0 (0%)");
  });

  it("formats unavailable", () => {
    expect(formatDelta({ count: null, pct: null, direction: null })).toBe("—");
  });
});

describe("bucketTrend", () => {
  it("buckets timestamps into daily counts over the requested range", () => {
    const timestamps = [
      "2026-03-10T08:00:00Z",
      "2026-03-10T09:00:00Z",
      "2026-03-12T04:00:00Z",
    ];
    expect(bucketTrend(timestamps, "2026-03-10", "2026-03-12", 90)).toEqual([
      { date: "2026-03-10", count: 2 },
      { date: "2026-03-11", count: 0 },
      { date: "2026-03-12", count: 1 },
    ]);
  });

  it("ignores timestamps outside the range", () => {
    expect(bucketTrend(["2026-03-09T08:00:00Z"], "2026-03-10", "2026-03-10", 90)).toEqual([
      { date: "2026-03-10", count: 0 },
    ]);
  });

  it("returns one bucket per day for the window when no range is set", () => {
    const trend = bucketTrend(["2026-03-10T08:00:00Z"], undefined, undefined, 90);
    expect(trend).toHaveLength(90);
  });

  it("skips invalid timestamps", () => {
    expect(bucketTrend(["not-a-date", "2026-03-10T08:00:00Z"], "2026-03-10", "2026-03-10", 90)).toEqual([
      { date: "2026-03-10", count: 1 },
    ]);
  });
});

describe("filterMetrics", () => {
  const metrics: ReportMetric[] = [
    {
      key: "accounts",
      label: "Managed accounts",
      count: 10,
      previous: 8,
      delta: 2,
      deltaPct: 25,
      deltaDirection: "up",
      trend: [],
      description: "Accounts with a system role assignment",
      category: "Accounts",
    },
    {
      key: "events",
      label: "Open security events",
      count: 3,
      previous: 3,
      delta: 0,
      deltaPct: 0,
      deltaDirection: "neutral",
      trend: [],
      description: "Security alerts awaiting resolution",
      category: "Security",
    },
  ];

  it("returns all metrics when the term is empty", () => {
    expect(filterMetrics(metrics, "")).toEqual(metrics);
    expect(filterMetrics(metrics, "   ")).toEqual(metrics);
  });

  it("matches by label", () => {
    expect(filterMetrics(metrics, "managed").map((m) => m.key)).toEqual(["accounts"]);
  });

  it("matches by category", () => {
    expect(filterMetrics(metrics, "security").map((m) => m.key)).toEqual(["events"]);
  });

  it("matches by description", () => {
    expect(filterMetrics(metrics, "alerts").map((m) => m.key)).toEqual(["events"]);
  });

  it("is case insensitive", () => {
    expect(filterMetrics(metrics, "MANAGED").map((m) => m.key)).toEqual(["accounts"]);
  });
});

describe("Delta helper", () => {
  it("classifies direction from delta count", () => {
    const up: Delta = { count: 5, pct: 10, direction: "up" };
    const down: Delta = { count: -5, pct: -10, direction: "down" };
    const neutral: Delta = { count: 0, pct: 0, direction: "neutral" };
    expect(up.direction).toBe("up");
    expect(down.direction).toBe("down");
    expect(neutral.direction).toBe("neutral");
  });
});
