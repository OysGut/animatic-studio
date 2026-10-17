/** DEC-0092 / REQ-0714: ressurser som legges inn i en scene blir 50 % av lerretets høyde eller bredde. */
import { describe, expect, it } from "vitest";
import { applyCommand, defaultLayerFields, newId, type Command, type ProjectState } from "@/core";
import { envelope } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

function assetWithImage(kind: "character" | "location", w: number, h: number) {
  const assetId = newId<"asset">();
  const variantId = newId<"asset_variant">();
  const versionId = newId<"asset_version">();
  let s: ProjectState = fixture.state;
  const cmds: Command[] = [
    {
      type: "CreateAssets",
      assets: [
        {
          assetId,
          fields: { kind, name: "X", names: [], description: "", category: "", tags: [] },
        },
      ],
    } as unknown as Command,
    {
      type: "CreateAssetVariant",
      variantId,
      assetId,
      fields: { name: "Standard", style: "animatic", appearance: "" },
    } as unknown as Command,
    {
      type: "AddAssetVersion",
      versionId,
      variantId,
      media: {
        path: `${fixture.project.id}/source/x.jpg`,
        mimeType: "image/jpeg",
        width: w,
        height: h,
        byteSize: 1000,
        sha256: "0".repeat(64),
      },
      note: "",
    } as unknown as Command,
    { type: "ApproveAssetVersion", variantId, versionId } as unknown as Command,
  ];
  for (const c of cmds) {
    const r = applyCommand(s, envelope(c));
    if (!r.ok) throw new Error(r.error.message);
    s = r.state;
  }
  return { s, assetId, variantId };
}

const comp = { width: 1920, height: 1080 };
const shown = (f: ReturnType<typeof defaultLayerFields>) => ({
  w: f.width * f.transform.scaleX,
  h: f.height * f.transform.scaleY,
});

describe("størrelse når en ressurs legges inn i scenen", () => {
  it("et høyt bilde (mobilfoto) blir halve lerrethøyden", () => {
    const { s, assetId, variantId } = assetWithImage("character", 3024, 4032);
    const d = shown(defaultLayerFields(s, comp, { assetId, assetVariantId: variantId }));
    expect(d.h).toBeCloseTo(540, 0);
    expect(d.w).toBeLessThan(960);
  });

  it("et bredt bilde blir halve lerretbredden", () => {
    const { s, assetId, variantId } = assetWithImage("character", 4000, 1000);
    const d = shown(defaultLayerFields(s, comp, { assetId, assetVariantId: variantId }));
    expect(d.w).toBeCloseTo(960, 0);
    expect(d.h).toBeLessThan(540);
  });

  it("bakgrunner fyller fortsatt lerretet", () => {
    const { s, assetId, variantId } = assetWithImage("location", 3000, 2000);
    const d = shown(defaultLayerFields(s, comp, { assetId, assetVariantId: variantId }));
    expect(d.w).toBeGreaterThanOrEqual(1919);
    expect(d.h).toBeGreaterThanOrEqual(1079);
  });
});
