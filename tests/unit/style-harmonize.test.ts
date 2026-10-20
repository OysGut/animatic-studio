// @vitest-environment node
/** P8: AI-stilharmonisering (REQ-0137–0145, REQ-0400–0402). Ingen ekte AI-kall – bare regler og kommandoer. */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  buildHarmonizePrompt,
  diffStates,
  emptyProjectState,
  emptyStyleGuide,
  harmonizationError,
  harmonizationOf,
  harmonizeAttachments,
  harmonizeNote,
  harmonizedVariantName,
  preferredReferenceError,
  preferredStyleReference,
  stateFromRows,
  type AssetMedia,
  type ProjectState,
  type StyleGuide,
  type StyleHarmonizationFields,
} from "@/core";
import { envelope, mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const byName = (n: string) => Object.values(s0.assets).find((a) => a.name === n)!;
const anImage = (s: ProjectState = s0) =>
  Object.values(s.assetVersions).find((x) => x.mimeType.startsWith("image/"))!;

const guide: StyleGuide = {
  ...emptyStyleGuide(),
  visualStyle: "Hand-painted watercolour with soft edges",
  technique: "Watercolour and gouache on textured paper",
  lighting: "Warm low winter sun",
  mood: "Warm and a little mysterious",
  characterDesign: "Simple rounded shapes, few details",
  palette: { colors: ["#0d1b2a", "#d9a441"], description: "Winter blues with warm amber" },
  avoid: "Photorealism, 3D rendering",
  instructions: "Always paint snow with a slight blue tint.",
};

function withGuide(s: ProjectState = s0) {
  const profileId = tid<"style_profile">();
  return {
    s: mustApply(s, {
      type: "CreateStyleProfile",
      profileId,
      fields: { name: "Filmens visuelle stil", isDefault: true, guide },
    }),
    profileId,
  };
}

function media(s: ProjectState): AssetMedia {
  return {
    path: `${s.project.id}/assets/generated/x/ai-2026-10-20.png`,
    mimeType: "image/png",
    width: 1024,
    height: 1536,
    byteSize: 12345,
    sha256: "a".repeat(64),
  };
}

function fields(s: ProjectState, profileId: string, versionId: string, sourceId: string): StyleHarmonizationFields {
  return {
    versionId,
    sourceVersionId: sourceId,
    model: "google/gemini-3-pro-image",
    qualityProfile: { id: tid(), name: "Endelig", spec: { effort: "premium" } },
    styleProfileId: profileId,
    referenceVersionId: null,
    use: "variant",
    note: harmonizeNote("Filmens visuelle stil", "google/gemini-3-pro-image"),
  };
}

/** Harmoniserer Majas første bilde: ny variant, ny versjon og metadata, i én kommando. */
function harmonize(s: ProjectState, profileId: string) {
  const source = anImage(s);
  const assetId = s.assetVariants[source.variantId]!.assetId;
  const versionId = tid<"asset_version">();
  const variantId = tid<"asset_variant">();
  const harmonizationId = tid<"command">();
  const r = applyCommand(
    s,
    envelope({
      type: "ApplyHarmonizedImage",
      harmonizationId,
      variantId,
      versionId,
      media: media(s),
      note: harmonizeNote("Filmens visuelle stil", "google/gemini-3-pro-image"),
      fields: fields(s, profileId, versionId, source.id),
      newVariant: {
        assetId,
        fields: { name: harmonizedVariantName("Filmens visuelle stil"), style: "illustrated", appearance: "" },
      },
    }),
  );
  return { r, source, assetId, versionId, variantId, harmonizationId };
}

describe("harmoniseringsprompten (REQ-0138, REQ-0139)", () => {
  it("dekker alle seks dimensjonene, bevarer identiteten og tar med det som skal unngås", () => {
    const { s, profileId } = withGuide();
    const source = anImage(s);
    const assetId = s.assetVariants[source.variantId]!.assetId;
    const p = buildHarmonizePrompt(s, { assetId, versionId: source.id, styleProfileId: profileId, referenceVersionId: null })!;
    for (const part of [
      "Drawing style: Hand-painted watercolour",
      "Colour palette: Winter blues with warm amber; #0d1b2a, #d9a441",
      "Lighting: Warm low winter sun",
      "Texture: Watercolour and gouache",
      "Level of detail: Simple rounded shapes",
      "Atmosphere: Warm and a little mysterious",
      "identity",
      "never who the subject is",
      "Leave out: Photorealism, 3D rendering",
      "Always paint snow with a slight blue tint.",
    ])
      expect(p, part).toContain(part);
    expect(p.length).toBeLessThanOrEqual(8000);
    // Ingen hemmeligheter eller nøkler i beskrivelsen
    expect(p).not.toMatch(/key|secret|token/i);
  });

  it("kan bære stilen fra et referansebilde alene, og krever en stilkilde", () => {
    const source = anImage();
    const assetId = s0.assetVariants[source.variantId]!.assetId;
    expect(buildHarmonizePrompt(s0, { assetId, versionId: source.id, styleProfileId: null, referenceVersionId: null })).toBe(null);
    const ref = Object.values(s0.assetVersions).find((x) => x.mimeType.startsWith("image/") && x.id !== source.id)!;
    const p = buildHarmonizePrompt(s0, { assetId, versionId: source.id, styleProfileId: null, referenceVersionId: ref.id })!;
    expect(p).toContain("all six dimensions");
    expect(p).toContain("style reference");
  });

  it("sender identiteten først, så profilens forbildebilder, uten dubletter", () => {
    const source = anImage();
    const { s, profileId } = withGuide();
    const attached = harmonizeAttachments(s, { assetId: s0.assetVariants[source.variantId]!.assetId, versionId: source.id, styleProfileId: profileId, referenceVersionId: source.id });
    expect(attached[0]).toMatchObject({ versionId: source.id, role: "identity" });
    expect(new Set(attached.map((a) => a.versionId)).size).toBe(attached.length);
    expect(attached.length).toBeLessThanOrEqual(6);
  });
});

describe("harmonisert bilde lagres ikke-destruktivt (REQ-0141/0142)", () => {
  it("ny variant, ny versjon og metadata i én angrbar kommando; originalen er uendret", () => {
    const { s, profileId } = withGuide();
    const { r, source, versionId, variantId, harmonizationId } = harmonize(s, profileId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const t = r.state;
    // Originalen finnes uendret; resultatet er en egen versjon på en egen variant
    expect(t.assetVersions[source.id]).toEqual(s.assetVersions[source.id]);
    expect(t.assetVariants[source.variantId]).toEqual(s.assetVariants[source.variantId]);
    expect(t.assetVersions[versionId]!.variantId).toBe(variantId);
    expect(t.assetVariants[variantId]!.name).toBe("Harmonisert – Filmens visuelle stil");
    const h = harmonizationOf(t, versionId)!;
    expect(h).toMatchObject({ id: harmonizationId, sourceVersionId: source.id, use: "variant", styleProfileId: profileId });
    expect(h.note).toContain("Filmens visuelle stil");
    expect(h.qualityProfile?.name).toBe("Endelig");
    // Angring fjerner alt, og gjør-om gjennopretter det samme
    const back = mustApply(t, r.inverse);
    expect(back.assetVersions[versionId]).toBeUndefined();
    expect(back.assetVariants[variantId]).toBeUndefined();
    expect(back.styleHarmonizations[harmonizationId]).toBeUndefined();
    const fwd = mustApply(back, r.inverse ? (applyCommand(back, envelope(r.inverse as never)) as never) : (null as never));
    expect(fwd).toBeTruthy();
    // Rundtur gjennom databaseradene
    const cs = diffStates(emptyProjectState(s.project), t);
    const rows = Object.fromEntries(Object.entries(cs.inserts)) as Record<string, unknown[]>;
    const read = stateFromRows({ project: fixture.project, ...rows, script_block_revisions: cs.blockRevisions } as never);
    expect(read.styleHarmonizations[harmonizationId]).toEqual(t.styleHarmonizations[harmonizationId]);
  });

  it("bruksvalget kan endres (lokal overstyring → variant → publisert) og angres", () => {
    const { s, profileId } = withGuide();
    const { r, versionId, harmonizationId } = harmonize(s, profileId);
    if (!r.ok) throw new Error("apply failed");
    const h = r.state.styleHarmonizations[harmonizationId]!;
    const r2 = applyCommand(r.state, envelope({ type: "SetStyleHarmonization", harmonizationId, fields: { ...h, use: "published" } }));
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.state.styleHarmonizations[harmonizationId]!.use).toBe("published");
    expect(harmonizationOf(r2.state, versionId)!.use).toBe("published");
    const back = mustApply(r2.state, r2.inverse);
    expect(back.styleHarmonizations[harmonizationId]!.use).toBe("variant");
  });

  it("ugyldig metadata avvises", () => {
    const { s, profileId } = withGuide();
    const source = anImage(s);
    const f = fields(s, profileId, tid(), source.id);
    expect(harmonizationError(s, { ...f, versionId: source.id })).not.toBe(null); // resultat = kilde
    expect(harmonizationError(s, { ...f, styleProfileId: null, referenceVersionId: null })).not.toBe(null);
    expect(harmonizationError(s, { ...f, use: "auto" as never })).not.toBe(null);
    expect(harmonizationError(s, { ...f, model: "" })).not.toBe(null);
    expect(harmonizationError(s, { ...f, styleProfileId: tid() })).not.toBe(null);
    expect(harmonizationError(s, { ...f, versionId: tid() })).not.toBe(null);
  });

  it("et bilde med harmoniseringsmetadata kan ikke angres bort alene", () => {
    const { s, profileId } = withGuide();
    const { r, versionId } = harmonize(s, profileId);
    if (!r.ok) throw new Error("apply failed");
    expect(applyCommand(r.state, envelope({ type: "UndoAddAssetVersion", versionId } as never)).ok).toBe(false);
  });
});

describe("foretrukket referanse per (karakter, stilprofil) (REQ-0144)", () => {
  it("nøyaktig én per par; byttet er atomisk og kan angres og gjøres om", () => {
    const { s, profileId } = withGuide();
    const maja = byName("Maja");
    const variants = Object.values(s.assetVariants).filter((v) => v.assetId === maja.id);
    expect(variants.length).toBeGreaterThan(0);
    const v1 = variants[0]!;
    const ref1 = tid();
    const r1 = applyCommand(s, envelope({ type: "SetPreferredStyleReference", referenceId: ref1, fields: { assetId: maja.id, styleProfileId: profileId, variantId: v1.id } }));
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(preferredStyleReference(r1.state, maja.id, profileId)?.variantId).toBe(v1.id);
    // En annen variant tar over: den gamle merkes fjernet i samme kommando
    const v2 = tid<"asset_variant">();
    const s2 = mustApply(r1.state, { type: "CreateAssetVariant", variantId: v2, assetId: maja.id as never, fields: { name: "Vinter", style: "illustrated", appearance: "" } });
    const ref2 = tid();
    const r2 = applyCommand(s2, envelope({ type: "SetPreferredStyleReference", referenceId: ref2, fields: { assetId: maja.id, styleProfileId: profileId, variantId: v2 } }));
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(preferredStyleReference(r2.state, maja.id, profileId)?.variantId).toBe(v2);
    expect(r2.state.stylePreferredReferences[ref1]!.removed).toBe(true);
    // Angring: den gamle er foretrukket igjen, den nye er borte
    const back = mustApply(r2.state, r2.inverse);
    expect(preferredStyleReference(back, maja.id, profileId)?.variantId).toBe(v1.id);
    expect(back.stylePreferredReferences[ref2]).toBeUndefined();
    // Gjør om
    const fwd = mustApply(back, r2.inverse ? (applyCommand(back, envelope(r2.inverse as never)) as { ok: true; state: ProjectState; inverse: never }) : (null as never));
    expect(preferredStyleReference(fwd.state, maja.id, profileId)?.variantId).toBe(v2);
    // Ugyldige valg avvises
    expect(preferredReferenceError(s, { assetId: maja.id, styleProfileId: tid(), variantId: v1.id })).not.toBe(null);
    expect(preferredReferenceError(s, { assetId: maja.id, styleProfileId: profileId, variantId: tid() })).not.toBe(null);
  });

  it("en variant som er foretrukket referanse kan ikke fjernes", () => {
    const { s, profileId } = withGuide();
    const maja = byName("Maja");
    const v1 = Object.values(s.assetVariants).find((v) => v.assetId === maja.id)!;
    const r1 = mustApply(s, { type: "SetPreferredStyleReference", referenceId: tid(), fields: { assetId: maja.id as never, styleProfileId: profileId as never, variantId: v1.id as never } } as never);
    expect(applyCommand(r1, envelope({ type: "UndoCreateAssetVariant", variantId: v1.id } as never)).ok).toBe(false);
  });
});
