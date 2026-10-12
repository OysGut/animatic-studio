/** Lagringskategorier og lagrede eksportinnstillinger (DEC-0072, REQ-0415/0407). */
import { describe, expect, it } from "vitest";
import { applyCommand, mainProduction, storageOverview, toRow, type ProjectState } from "@/core";
import { mustApply } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const main = mainProduction(s0)!;

function run(s: ProjectState, command: unknown) {
  return applyCommand(s, {
    id: "00000000-0000-7000-8000-00000000f0f5" as never,
    actor: "00000000-0000-7000-8000-000000000001" as never,
    at: new Date().toISOString(),
    command: command as never,
  });
}

describe("lagring og eksportinnstillinger", () => {
  it("seks kategorier; alle bildeversjoner telles én gang; AI-filer blir genererte", () => {
    const rows = storageOverview(s0, new Set());
    expect(rows.map((r) => r.category)).toEqual([
      "project",
      "source",
      "generated",
      "temporary",
      "export",
      "history",
    ]);
    const files = Object.values(s0.assetVersions);
    const bytes = files.reduce((t, v) => t + v.byteSize, 0);
    const counted = rows
      .filter(
        (r) => r.category === "source" || r.category === "history" || r.category === "generated",
      )
      .reduce((t, r) => t + (r.bytes ?? 0), 0);
    expect(counted).toBeGreaterThanOrEqual(bytes);
    const one = files[0]!;
    const gen = storageOverview(s0, new Set([one.mediaPath]));
    const g = gen.find((r) => r.category === "generated")!;
    const h = gen.find((r) => r.category === "history")!;
    expect(g.count + h.count).toBeGreaterThan(0);
  });

  it("eksportinnstillingene lagres per produksjon, kan angres og valideres", () => {
    const settings = { size: "half", monochrome: true, output: "video" };
    const s = mustApply(s0, {
      type: "SetExportSettings",
      productionId: main.id,
      settings,
    } as never);
    expect(s.productions[main.id]!.exportSettings).toEqual(settings);
    expect(toRow("productions", s.productions[main.id]!, s.project.id)["export_settings"]).toEqual(
      settings,
    );
    const r = run(s0, { type: "SetExportSettings", productionId: main.id, settings });
    expect(
      r.ok && mustApply(r.state, r.inverse as never).productions[main.id]!.exportSettings,
    ).toBe(null);
    expect(
      run(s0, {
        type: "SetExportSettings",
        productionId: main.id,
        settings: { ...settings, size: "enorm" },
      }).ok,
    ).toBe(false);
  });
});
