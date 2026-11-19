import { describe, expect, it } from "vitest";
import { canAccessModule, canExportModule, canWriteModule, getModule, modulePages } from "@/app/modules";

const standalonePagePaths = new Set(["/admin/roles", "/admin/reports", "/admin/monitoring"]);
const dataBackedModules = modulePages.filter((module) => !standalonePagePaths.has(module.path));

describe("system module registry", () => {
  it("defines unique, absolute routes for the system pages", () => {
    const routes = modulePages.map((module) => module.path);
    expect(routes.length).toBeGreaterThan(25);
    expect(new Set(routes).size).toBe(routes.length);
    expect(routes.every((route) => route.startsWith("/"))).toBe(true);
  });

  it("provides a data table for every data-backed module", () => {
    expect(dataBackedModules.every((module) => Boolean(module.table))).toBe(true);
    expect(dataBackedModules.filter((module) => !module.readOnly).every((module) => Boolean(module.fields?.length))).toBe(true);
  });

  it("keeps standalone administration pages registered without CRUD tables", () => {
    for (const path of standalonePagePaths) {
      expect(getModule(path)?.path).toBe(path);
      expect(getModule(path)?.table).toBeUndefined();
    }
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

  it("keeps employee links out of system account management", () => {
    expect(getModule("/admin/users")?.fields?.some((field) => field.name === "employee_id")).toBe(false);
    expect(getModule("/admin/users")?.columns).not.toContain("employee_id");
  });

  it("restricts exports to roles permitted for each data category", () => {
    expect(canExportModule("/people", ["SECRETARIAT_USER"])).toBe(true);
    expect(canExportModule("/people", ["SUPER_SYSTEM_ADMIN"])).toBe(false);
    expect(canExportModule("/payroll", ["LAND_FINANCE_BOARD_USER"])).toBe(true);
    expect(canExportModule("/payroll", ["MISSION_BOARD_USER"])).toBe(false);
    expect(canExportModule("/safeguarding", ["HEALTH_BOARD_USER"])).toBe(false);
  });

  it("limits the platform administrator to system administration modules", () => {
    expect(canAccessModule("/people", ["SUPER_SYSTEM_ADMIN"])).toBe(false);
    expect(canWriteModule("/people", ["SUPER_SYSTEM_ADMIN"])).toBe(false);
    expect(canAccessModule("/payroll", ["SUPER_SYSTEM_ADMIN"])).toBe(false);
    expect(canAccessModule("/admin/scopes", ["SUPER_SYSTEM_ADMIN"])).toBe(true);
    expect(canAccessModule("/admin/users", ["SUPER_SYSTEM_ADMIN"])).toBe(true);
    expect(canAccessModule("/admin/sessions", ["SUPER_SYSTEM_ADMIN"])).toBe(true);
    expect(canAccessModule("/security", ["SUPER_SYSTEM_ADMIN"])).toBe(true);
    expect(canAccessModule("/settings", ["SUPER_SYSTEM_ADMIN"])).toBe(true);
    expect(canAccessModule("/audit", ["SUPER_SYSTEM_ADMIN"])).toBe(true);
    expect(canAccessModule("/people", ["SUPER_SYSTEM_ADMIN", "ICT_BOARD_USER"])).toBe(false);
    expect(canAccessModule("/admin/scopes", ["ICT_BOARD_USER"])).toBe(false);
    expect(canAccessModule("/admin/sessions", ["EDUCATION_BOARD_USER"])).toBe(false);
  });

  it("keeps all data-backed module routes connected to existing tables", () => {
    expect(dataBackedModules.every((module) => module.table && module.columns?.length)).toBe(true);
    expect(modulePages.some((module) => module.path === "/documents" && module.table === "documents")).toBe(true);
  });
});
