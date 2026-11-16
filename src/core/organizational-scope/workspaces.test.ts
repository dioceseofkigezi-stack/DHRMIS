import { describe, expect, it } from "vitest";
import {
  canAccessWorkspace,
  canManageWorkspacePersonnel,
  getWorkspace,
  getWorkspaceNavigation,
  getWorkspaceFromPath,
  personnelWorkspaces,
} from "@/core/organizational-scope/workspaces";

describe("personnel workspaces", () => {
  it("defines the Secretariat and six independent Board areas", () => {
    expect(personnelWorkspaces.map((workspace) => workspace.slug)).toEqual([
      "secretariat", "mission", "education", "health", "land-finance", "planning-development", "ict",
    ]);
  });

  it("requires both the relevant role and an authorized workspace scope", () => {
    const education = getWorkspace("education")!;
    const health = getWorkspace("health")!;
    expect(canAccessWorkspace(education, ["EDUCATION_BOARD_USER"], ["EDUCATION"])).toBe(true);
    expect(canAccessWorkspace(health, ["EDUCATION_BOARD_USER"], ["EDUCATION"])).toBe(false);
    expect(canAccessWorkspace(education, ["ICT_BOARD_USER"], ["EDUCATION"])).toBe(false);
  });

  it("keeps ICT system access separate from ICT personnel management", () => {
    const ict = getWorkspace("ict")!;
    expect(canAccessWorkspace(ict, ["ICT_BOARD_USER"], ["ICT"])).toBe(true);
    expect(canManageWorkspacePersonnel(ict, ["ICT_BOARD_USER"])).toBe(true);
    expect(canManageWorkspacePersonnel(ict, ["SUPER_SYSTEM_ADMIN"])).toBe(true);
  });

  it("keeps ecclesiastical navigation in the Secretariat workspace", () => {
    const secretariat = getWorkspace("secretariat")!;
    const mission = getWorkspace("mission")!;
    const secretariatPaths = getWorkspaceNavigation(secretariat, ["SECRETARIAT_USER"]).map((item) => item.path);
    const missionPaths = getWorkspaceNavigation(mission, ["MISSION_BOARD_USER"]).map((item) => item.path);
    expect(secretariatPaths).toContain("/organization/archdeaconries");
    expect(secretariatPaths).toContain("/organization/parishes");
    expect(secretariatPaths).toContain("/organization/local-churches");
    expect(missionPaths).not.toContain("/organization/archdeaconries");
    expect(missionPaths).not.toContain("/organization/parishes");
  });

  it("resolves a workspace from its root route or scoped module query", () => {
    expect(getWorkspaceFromPath("/education", "")?.code).toBe("EDUCATION");
    expect(getWorkspaceFromPath("/people", "?workspace=health")?.code).toBe("HEALTH");
  });
});
