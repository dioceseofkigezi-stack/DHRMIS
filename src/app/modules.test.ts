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

  it("gives each designated department role the scoped personnel workflow", () => {
    expect(canAccessModule("/leave", ["EDUCATION_BOARD_USER"])).toBe(true);
    expect(canWriteModule("/leave", ["EDUCATION_BOARD_USER"])).toBe(true);
    expect(canAccessModule("/early-retirement", ["EDUCATION_BOARD_USER"])).toBe(true);
    expect(canWriteModule("/early-retirement", ["EDUCATION_BOARD_USER"])).toBe(true);
    expect(canAccessModule("/payroll", ["EDUCATION_BOARD_USER"])).toBe(false);
    expect(canAccessModule("/payroll", ["LAND_FINANCE_BOARD_USER"])).toBe(true);
  });

  it("lets administrators link provisioned roles to an employee record", () => {
    expect(getModule("/admin/users")?.fields?.some((field) =>
      field.name === "employee_id" && field.kind === "employee",
    )).toBe(true);
  });

  it("restricts exports to roles permitted for each data category", () => {
    expect(canExportModule("/people", ["SECRETARIAT_USER"])).toBe(true);
    expect(canExportModule("/people", ["SUPER_SYSTEM_ADMIN"])).toBe(true);
    expect(canExportModule("/payroll", ["LAND_FINANCE_BOARD_USER"])).toBe(true);
    expect(canExportModule("/payroll", ["MISSION_BOARD_USER"])).toBe(false);
    expect(canExportModule("/safeguarding", ["HEALTH_BOARD_USER"])).toBe(false);
  });

  it("gives the merged platform administrator the combined administrator capabilities", () => {
    expect(canAccessModule("/people", ["SUPER_SYSTEM_ADMIN"])).toBe(true);
    expect(canAccessModule("/admin/scopes", ["SUPER_SYSTEM_ADMIN"])).toBe(true);
    expect(canAccessModule("/admin/sessions", ["SUPER_SYSTEM_ADMIN"])).toBe(true);
    expect(canAccessModule("/security", ["SUPER_SYSTEM_ADMIN"])).toBe(true);
    expect(canAccessModule("/admin/scopes", ["ICT_BOARD_USER"])).toBe(false);
    expect(canAccessModule("/admin/sessions", ["EDUCATION_BOARD_USER"])).toBe(false);
  });

  it("keeps all data-backed module routes connected to existing tables", () => {
    expect(modulePages.every((module) => module.table && module.columns?.length)).toBe(true);
    expect(modulePages.some((module) => module.path === "/documents" && module.table === "documents")).toBe(true);
  });
});
