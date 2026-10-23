/**
 * G-6 pkt 2: stilprofiler, kvalitetsprofiler, fonter og maler på arbeidsgruppen arves av prosjektene
 * med lokale overstyringer – samme forrangsprinsipp som resolveSettings (prosjekt over arbeidsgruppe).
 */
import { describe, expect, it } from "vitest";
import {
  resolveWorkspaceProfile,
  workspaceProfileError,
  type WorkspaceProfile,
} from "@/core/global/workspace-profiles";

function wp(name: string, over: Partial<WorkspaceProfile> = {}): WorkspaceProfile {
  return {
    id: `id-${name}`,
    workspaceId: "ws1",
    kind: "style",
    name,
    spec: { guide: name },
    isDefault: false,
    archived: false,
    revision: 1,
    ...over,
  };
}

describe("workspaceProfileError", () => {
  it("godtar en gyldig profil og avviser feil type, navn og innhold", () => {
    expect(workspaceProfileError(wp("Natur"))).toBeNull();
    expect(workspaceProfileError(null)).toBe("profile");
    expect(workspaceProfileError(wp("x", { kind: "annet" as never }))).toBe("kind");
    expect(workspaceProfileError(wp("   "))).toBe("name");
    expect(workspaceProfileError(wp("x", { spec: [] as never }))).toBe("spec");
  });
});

describe("resolveWorkspaceProfile", () => {
  it("prosjektets profil vinner alltid over gruppens (lokal overstyring)", () => {
    const local = { name: "Prosjektstil", isDefault: false };
    const r = resolveWorkspaceProfile("style", [local], [wp("Gruppestil", { isDefault: true })]);
    expect(r).toEqual({ profile: local, source: "project" });
  });

  it("gruppens standardprofil arves når prosjektet ikke har noen", () => {
    const r = resolveWorkspaceProfile("quality", [], [
      wp("Kvalitet A"),
      wp("Kvalitet B", { kind: "quality", isDefault: true }),
    ]);
    expect(r?.source).toBe("workspace");
    expect(r?.profile.name).toBe("Kvalitet B");
  });

  it("uten standard velges alfabetisk første; arkiverte og andre typer ignoreres", () => {
    const r = resolveWorkspaceProfile("font", [], [
      wp("Brødtekst", { kind: "font" }),
      wp("Arkivert", { kind: "font", archived: true }),
      wp("Annet", { kind: "template" }),
    ]);
    expect(r?.profile.name).toBe("Brødtekst");
    expect(resolveWorkspaceProfile("template", [], [wp("x", { archived: true })])).toBeNull();
  });

  it("prosjektets standard vinner over prosjektets øvrige, og over gruppens standard", () => {
    const a = { name: "A-stil" };
    const b = { name: "B-stil", isDefault: true };
    const r = resolveWorkspaceProfile("style", [a, b], [wp("Gruppe", { isDefault: true })]);
    expect(r?.profile).toBe(b);
    expect(r?.source).toBe("project");
  });

  it("tomt overalt gir null", () => {
    expect(resolveWorkspaceProfile("style", [], [])).toBeNull();
  });
});
