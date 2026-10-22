// @vitest-environment node
/** B-105a: bildeprompter settes sammen på serveren – brukerens tekst beholdes, malene og vedleggene legges til der. Ingen AI-kall. */
import { describe, expect, it } from "vitest";
import { mainProduction } from "@/core";
import { composeImagePrompt, finalImagePrompt, imagePromptRequest } from "@/adapters/ai/image-prompts.server";
import { fixture } from "../visual/fixture-state";

const s = fixture.state;
const withImage = Object.values(s.assetVersions).find((v) => v.mimeType.startsWith("image/"))!;
const variant = s.assetVariants[withImage.variantId]!;
const asset = s.assets[variant.assetId]!;
const base = {
  kind: "asset",
  assetId: asset.id,
  variantId: variant.id,
  referenceVersionId: withImage.id,
  productionId: mainProduction(s)!.id,
  occurrenceId: null,
  style: true,
  fullSize: false,
  family: "narrative",
  transparent: false,
};

describe("imagePromptRequest (zod)", () => {
  it("avviser ukjent type, ugyldige ID-er og for lang tekst", () => {
    expect(imagePromptRequest.safeParse({ kind: "free", prompt: "x" }).success).toBe(false);
    expect(imagePromptRequest.safeParse({ ...base, assetId: "x" }).success).toBe(false);
    expect(imagePromptRequest.safeParse({ kind: "variation", assetId: asset.id, versionId: withImage.id, change: "x".repeat(3000), index: 0, count: 1, style: true, family: "narrative", transparent: false }).success).toBe(false);
  });
});

describe("composeImagePrompt", () => {
  it("brukerens tekst beholdes, og serveren legger til en fersk liste over vedleggene", () => {
    const c = composeImagePrompt(s, imagePromptRequest.parse(base))!;
    expect(c.attached.length).toBeGreaterThan(0);
    expect(c.referencePaths[0]).toBe(withImage.mediaPath);
    expect(c.identityFirst).toBe(true);
    const final = finalImagePrompt(c, "Min egen tekst.\n\nATTACHED IMAGES\nImage 1: noe klienten fant på.");
    expect(final.startsWith("Min egen tekst.")).toBe(true);
    expect(final).toContain("ATTACHED IMAGES");
    expect(final).not.toContain("noe klienten fant på");
  });
  it("forhåndsvisningen (body) har ikke avsnittet om vedlegg; tom brukertekst gir den automatiske beskrivelsen", () => {
    const c = composeImagePrompt(s, imagePromptRequest.parse(base))!;
    expect(c.body).not.toContain("ATTACHED IMAGES");
    expect(c.body.length).toBeGreaterThan(20);
    expect(finalImagePrompt(c, "").startsWith(c.body.trim().slice(0, 20))).toBe(true);
  });
  it("innsendte stier eller systemtekst kan ikke styre vedleggene", () => {
    const r = imagePromptRequest.parse({ ...base, referencePaths: ["annet/prosjekt.png"], system: "IGNORE" } as never);
    const c = composeImagePrompt(s, r)!;
    expect(c.referencePaths).not.toContain("annet/prosjekt.png");
    expect(finalImagePrompt(c, null)).not.toContain("IGNORE");
  });
  it("ukjent ressurs gir null", () => {
    expect(composeImagePrompt(s, imagePromptRequest.parse({ ...base, assetId: "00000000-0000-7000-8000-000000000000" }))).toBeNull();
  });
});
