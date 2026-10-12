// @vitest-environment node
/** Last ned og last opp igjen med samme navn (DEC-0064, REQ-0588). */
import { describe, expect, it } from "vitest";
import {
  layerFieldsOf,
  replaceVersionCommands,
  reuploadNote,
  versionFileBase,
  versionFileName,
  versionFromFileName,
  versionUse,
  type ProjectState,
} from "@/core";
import { mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const v0 = Object.values(s0.assetVersions).find((v) => v.mimeType.startsWith("image/"))!;
const va = s0.assetVariants[v0.variantId]!;
const asset = s0.assets[va.assetId]!;

describe("filnavn for nedlasting", () => {
  it("«Ressurs - Variant - vN» med riktig filtype", () => {
    expect(versionFileBase(s0, v0)).toBe(`${asset.name} - ${va.name} - v${v0.number}`);
    expect(versionFileName(s0, v0)).toMatch(new RegExp(` - v${v0.number}\\.(png|jpg|webp|gif)$`));
  });

  it("kjenner igjen navnet, også med annen filtype, nettleserens tillegg og macOS-tegn", () => {
    const base = versionFileBase(s0, v0)!;
    for (const name of [
      `${base}.png`,
      `${base}.JPG`,
      `${base} (1).png`,
      `${base}-1.png`,
      `${base} 2.png`,
      `${base.normalize("NFD")}.png`,
      `${base.toUpperCase()}.webp`,
      `${base} (godkjent).png`,
    ])
      expect(versionFromFileName(s0, name)?.id, name).toBe(v0.id);
    expect(versionFromFileName(s0, "Maja.png")).toBe(null);
    expect(versionFromFileName(s0, `${asset.name} - Finnes ikke - v1.png`)).toBe(null);
  });

  it("ulovlige tegn i navn byttes ut", () => {
    const s = mustApply(s0, {
      type: "UpdateAssetVariant",
      variantId: va.id,
      fields: { name: "Vinter/sommer: ny?", style: va.style, appearance: va.appearance },
    });
    expect(versionFileBase(s, v0)).toBe(`${asset.name} - Vinter_sommer_ ny_ - v${v0.number}`);
    expect(versionFromFileName(s, `${versionFileBase(s, v0)}.png`)?.id).toBe(v0.id);
  });
});

describe("erstatte en versjon", () => {
  it("den nye versjonen tar over godkjenning, lag og plakater; den gamle står", () => {
    // Godkjenn den gamle og lås et lag til den
    let s: ProjectState = mustApply(s0, {
      type: "ApproveAssetVersion",
      variantId: va.id,
      versionId: v0.id,
    });
    const layer = Object.values(s.layers).find((l) => l.assetId === asset.id && !l.removed)!;
    expect(layer).toBeTruthy();
    s = mustApply(s, {
      type: "UpdateLayers",
      layers: [
        {
          layerId: layer.id,
          fields: { ...layerFieldsOf(layer), assetVariantId: va.id, versionId: v0.id },
        },
      ],
    });
    const use = versionUse(s, v0.id);
    expect(use.approved).toBe(true);
    const newId = tid<"asset_version">();
    s = mustApply(s, {
      type: "AddAssetVersion",
      versionId: newId,
      variantId: va.id,
      media: {
        path: `${s.project.id}/${asset.id}/${newId}/ny.png`,
        mimeType: "image/png",
        width: 10,
        height: 10,
        byteSize: 100,
        sha256: "a".repeat(64),
      },
      note: reuploadNote(v0, "replace"),
    });
    const before = s;
    for (const c of replaceVersionCommands(before, v0.id, newId)) s = mustApply(s, c);
    expect(s.assetVariants[va.id]!.approvedVersionId).toBe(newId);
    expect(s.layers[layer.id]!.versionId).toBe(newId);
    expect(versionUse(s, v0.id)).toEqual({ approved: false, layers: 0, posters: 0 });
    expect(s.assetVersions[v0.id]).toBeTruthy();
    expect(s.assetVersions[newId]!.note).toBe(`Erstatter v${v0.number} (lastet opp på nytt)`);
    expect(s.assetVersions[newId]!.number).toBeGreaterThan(v0.number);
  });
});
