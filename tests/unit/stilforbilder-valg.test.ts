// @vitest-environment node
/**
 * Øystein 23.10: brukeren styrer listen over bilder som sendes med til bildemodellen. Bortvalg, tillegg
 * med rolle, grense per modell, samsvar mellom tekst og bilder og at serveren avviser fremmede bilder.
 * Ingen AI-kall.
 */
import { describe, expect, it } from "vitest";
import {
  attachedImageRows,
  attachedImages,
  emptyProjectState,
  emptyStyleGuide,
  foreignAttachedChoice,
  MAX_ATTACHED_IMAGES,
  maxAttachedImagesFor,
  providerModel,
  withAttachedLegend,
  type ProjectState,
} from "@/core";
import { composeImagePrompt, finalImagePrompt } from "@/adapters/ai/image-prompts.server";
import { attachedLimit } from "@/adapters/ai/generate-image.functions";

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PROD = uid(900);

/** Hovedressursen (1) og åtte andre ressurser med ett godkjent bilde hver. */
function fixture(): ProjectState {
  const base = emptyProjectState({ id: uid(999), name: "Testfilm" } as never);
  const assets: Record<string, unknown> = {};
  const variants: Record<string, unknown> = {};
  const versions: Record<string, unknown> = {};
  for (let i = 1; i <= 9; i++) {
    const a = uid(i), va = uid(100 + i), v = uid(200 + i);
    assets[a] = { id: a, name: `Figur${i}`, kind: "character", removed: false, names: [] };
    variants[va] = { id: va, assetId: a, name: "Standard", approvedVersionId: v, archived: false };
    versions[v] = { id: v, variantId: va, number: 1, mediaPath: `${uid(999)}/${a}/${v}/bilde.png`, mimeType: "image/png" };
  }
  const refs = [2, 3, 4, 5, 6, 7, 8].map((i) => uid(200 + i));
  return {
    ...base,
    productions: { [PROD]: { id: PROD } } as never,
    assets: assets as never,
    assetVariants: variants as never,
    assetVersions: versions as never,
    styleProfiles: {
      [uid(800)]: { id: uid(800), revision: 1, name: "Stil", isDefault: true, removed: false, guide: { ...emptyStyleGuide(), referenceVersionIds: refs } },
    } as never,
  };
}

const s = fixture();
const input = { assetId: uid(1), productionId: PROD, identityVersionId: uid(201), style: true };

describe("stilforbilder: brukerens valg", () => {
  it("standardutvalget er som før: identiteten først, høyst MAX_ATTACHED_IMAGES", () => {
    const a = attachedImages(s, input);
    expect(a).toHaveLength(MAX_ATTACHED_IMAGES);
    expect(a[0]).toMatchObject({ versionId: uid(201), role: "identity" });
  });

  it("et bortvalgt bilde sendes ikke, og neste forslag tar plassen", () => {
    const a = attachedImages(s, { ...input, choice: { excluded: [uid(202)], added: [] } });
    expect(a.map((x) => x.versionId)).not.toContain(uid(202));
    expect(a.map((x) => x.versionId)).toContain(uid(207));
    const row = attachedImageRows(s, { ...input, choice: { excluded: [uid(202)], added: [] } }).find(
      (r) => r.image.versionId === uid(202),
    );
    expect(row).toMatchObject({ included: false, excluded: true });
  });

  it("et bestemt bilde kan legges til med rollen «samme figur/gjenstand»", () => {
    const a = attachedImages(s, {
      ...input,
      choice: { excluded: [uid(203), uid(204), uid(205), uid(206)], added: [{ versionId: uid(209), role: "view" }] },
    });
    expect(a.find((x) => x.versionId === uid(209))).toMatchObject({ role: "view" });
  });

  it("grensen per modell håndheves; uten data brukes 6", () => {
    expect(maxAttachedImagesFor(providerModel("google", "gemini-3-pro-image"))).toBe(14);
    expect(maxAttachedImagesFor(providerModel("fal", "fal-ai/flux-pro/kontext"))).toBe(1);
    expect(maxAttachedImagesFor(null)).toBe(6);
    expect(attachedLimit({ provider: "lovable", model: null, purpose: "cutout" })).toBe(6);
    const many = { excluded: [], added: [uid(208), uid(209)].map((versionId) => ({ versionId, role: "style" as const })) };
    expect(attachedImages(s, { ...input, choice: many, max: 14 })).toHaveLength(8);
    const two = attachedImageRows(s, { ...input, choice: many, max: 2 });
    expect(two.filter((r) => r.included)).toHaveLength(2);
    expect(two.some((r) => r.overLimit)).toBe(true);
  });

  it("teksten om bildene følger valget: samme antall og rekkefølge som bildene som sendes", () => {
    const r = composeImagePrompt(s, {
      kind: "asset", assetId: uid(1), variantId: uid(101), referenceVersionId: uid(201), productionId: PROD,
      occurrenceId: null, style: true, excluded: [uid(202), uid(203)], added: [{ versionId: uid(209), role: "view" }],
      maxImages: 4, fullSize: false, family: "narrative", transparent: false,
    })!;
    expect(r.attached).toHaveLength(4);
    expect(r.attached.map((a) => a.versionId)).not.toContain(uid(202));
    const p = finalImagePrompt(r, "Tegn figuren.");
    expect(p).toContain("Exactly 4 image(s) are attached.");
    expect(p).not.toContain("Image 5:");
    expect(r.referencePaths).toEqual(r.attached.map((a) => a.path));
    expect(withAttachedLegend("x", "Figur1", [])).toBe("x");
  });

  it("serveren avviser bilder fra et annet prosjekt", () => {
    const foreign = { excluded: [], added: [{ versionId: uid(777), role: "style" as const }] };
    expect(foreignAttachedChoice(s, foreign)).toEqual([uid(777)]);
    expect(
      composeImagePrompt(s, {
        kind: "asset", assetId: uid(1), variantId: null, referenceVersionId: null, productionId: PROD,
        occurrenceId: null, style: true, added: foreign.added, fullSize: false, family: "narrative", transparent: false,
      }),
    ).toBeNull();
  });
});
