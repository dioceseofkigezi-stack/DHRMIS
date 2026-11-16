import { describe, expect, it } from "vitest";
import { canAccessModule, canExportModule, canWriteModule, getModule, modulePages } from "@/app/modules";

describe("system module registry", () => {
  it("defines unique, absolute routes for the system pages", () => {
    const routes = modulePages.map((module) => module.path);
    expect(routes.length).toBeGreaterThan(25);
    expect(new Set(routes).size).toBe(routes.length);
    expect(routes.every((route) => route.startsWith("/"))).toBe(true);
  });

  it("provides a data table for every configured module", () => {
    expect(modulePages.every((module) => Boolean(module.table))).toBe(true);
    expect(modulePages.filter((module) => !module.readOnly).every((module) => Boolean(module.fields?.length))).toBe(true);
  });

  it("marks audit and security event pages read-only", () => {
    expect(getModule("/audit")?.readOnly).toBe(true);
    expect(getModule("/security")?.readOnly).toBe(true);
  });

  it("allows employee self-service only on leave, early retirement, and family records", () => {
    expect(canAccessModule("/leave", ["Employee"])).toBe(true);
    expect(canWriteModule("/leave", ["Employee"])).toBe(true);
    expect(canAccessModule("/early-retirement", ["Employee"])).toBe(true);
    expect(canWriteModule("/early-retirement", ["Employee"])).toBe(true);
    expect(canAccessModule("/family", ["Employee"])).toBe(true);
    expect(canWriteModule("/family", ["Employee"])).toBe(false);
    expect(canAccessModule("/payroll", ["Employee"])).toBe(false);
  });

  it("lets administrators link provisioned roles to an employee record", () => {
    expect(getModule("/admin/users")?.fields?.some((field) =>
      field.name === "employee_id" && field.kind === "employee",
    )).toBe(true);
  });

  it("restricts exports to roles permitted for each data category", () => {
    expect(canExportModule("/people", ["CentralHR"])).toBe(true);
    expect(canExportModule("/people", ["Employee"])).toBe(false);
    expect(canExportModule("/payroll", ["FinanceOfficer"])).toBe(true);
    expect(canExportModule("/payroll", ["BoardHR"])).toBe(false);
    expect(canExportModule("/safeguarding", ["SafeguardingOfficer"])).toBe(false);
  });

  it("keeps all data-backed module routes connected to existing tables", () => {
    expect(modulePages.every((module) => module.table && module.columns?.length)).toBe(true);
    expect(modulePages.some((module) => module.path === "/documents" && module.table === "documents")).toBe(true);
  });
});
