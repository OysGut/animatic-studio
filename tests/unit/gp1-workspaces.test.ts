import { describe, expect, it } from "vitest";
import { keepsAnOwner, workspaceRights, workspaceRoleRank, type WorkspaceRole } from "../../src/core";

describe("GP1 arbeidsgrupper: rettigheter", () => {
  it("medlem kan bare bruke", () => {
    expect(workspaceRights("member")).toEqual({ use: true, publish: false, archive: false, manage: false });
  });
  it("redaktør kan publisere, men ikke arkivere eller administrere", () => {
    expect(workspaceRights("editor")).toEqual({ use: true, publish: true, archive: false, manage: false });
  });
  it("eier kan alt", () => {
    expect(workspaceRights("owner")).toEqual({ use: true, publish: true, archive: true, manage: true });
  });
  it("ikke-medlem kan ingenting", () => {
    expect(workspaceRights(null)).toEqual({ use: false, publish: false, archive: false, manage: false });
    expect(workspaceRoleRank(undefined)).toBe(0);
  });
});

describe("GP1 arbeidsgrupper: minst én eier", () => {
  const m = (userId: string, role: WorkspaceRole) => ({ userId, role });
  it("eneste eier kan ikke nedgraderes eller fjernes", () => {
    const list = [m("a", "owner"), m("b", "editor")];
    expect(keepsAnOwner(list, "a", "editor")).toBe(false);
    expect(keepsAnOwner(list, "a", null)).toBe(false);
  });
  it("med to eiere kan én av dem nedgraderes", () => {
    expect(keepsAnOwner([m("a", "owner"), m("b", "owner")], "a", "member")).toBe(true);
  });
  it("andre enn eiere kan alltid endres", () => {
    expect(keepsAnOwner([m("a", "owner"), m("b", "editor")], "b", null)).toBe(true);
  });
});
