// @vitest-environment node
/**
 * AI skriver bildebeskrivelsen, og filmens bilder sendes med (DEC-0066, REQ-0589, REQ-0246).
 * Selve kallene til Lovable AI Gateway er i adapterne; her testes det som avgjør hva som sendes.
 */
import { describe, expect, it } from "vitest";
import {
  aiUsage,
  monthStartUtc,
  attachedImages,
  buildContextImagePrompt,
  cleanWrittenPrompt,
  describeAttached,
  emptyStyleGuide,
  jobFromRow,
  mainProduction,
  stripAttachedSection,
  withAttachedLegend,
  orderedOccurrences,
  promptWriterUserText,
  MAX_ATTACHED_IMAGES,
  MAX_PROMPT_CHARS,
  PROMPT_WRITER_SYSTEM,
  type ProjectState,
} from "@/core";
import { mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const main = mainProduction(s0)!;
const byName = (n: string) => Object.values(s0.assets).find((a) => a.name === n)!;
const imageVersions = Object.values(s0.assetVersions).filter((v) =>
  v.mimeType.startsWith("image/"),
);
const assetOf = (versionId: string) =>
  s0.assetVariants[s0.assetVersions[versionId]!.variantId]!.assetId;

function withRefs(ids: string[], s: ProjectState = s0): ProjectState {
  return mustApply(s, {
    type: "CreateStyleProfile",
    profileId: tid<"style_profile">(),
    fields: {
      name: "Stil",
      isDefault: true,
      guide: { ...emptyStyleGuide(), technique: "Gouache", referenceVersionIds: ids },
    },
  });
}

describe("bildene som sendes med til bildemodellen", () => {
  it("dagens bilde først (beholdes), så filmens forbilder – aldri ressursens egne som stil", () => {
    const maja = byName("Maja");
    const own = imageVersions.find((v) => assetOf(v.id) === maja.id)!;
    const others = imageVersions.filter((v) => assetOf(v.id) !== maja.id).slice(0, 2);
    expect(own).toBeTruthy();
    expect(others.length).toBeGreaterThan(0);
    const s = withRefs([own.id, ...others.map((v) => v.id)]);
    const att = attachedImages(s, {
      assetId: maja.id,
      productionId: main.id,
      identityVersionId: own.id,
      style: true,
    });
    expect(att[0]).toMatchObject({ versionId: own.id, role: "identity", path: own.mediaPath });
    expect(att.filter((a) => a.versionId === own.id)).toHaveLength(1);
    for (const v of others) expect(att.map((a) => a.versionId)).toContain(v.id);
    expect(att.slice(1).every((a) => a.role === "style")).toBe(true);
    expect(att.length).toBeLessThanOrEqual(MAX_ATTACHED_IMAGES);
    expect(new Set(att.map((a) => a.versionId)).size).toBe(att.length);
  });

  it("uten stilforbilder sendes bare dagens bilde; ingen bilder uten noe valgt", () => {
    const maja = byName("Maja");
    const own = imageVersions.find((v) => assetOf(v.id) === maja.id)!;
    const s = withRefs(
      imageVersions
        .filter((v) => assetOf(v.id) !== maja.id)
        .map((v) => v.id)
        .slice(0, 3),
    );
    expect(
      attachedImages(s, {
        assetId: maja.id,
        productionId: main.id,
        identityVersionId: own.id,
        style: false,
      }).map((a) => a.versionId),
    ).toEqual([own.id]);
    expect(
      attachedImages(s0, {
        assetId: maja.id,
        productionId: main.id,
        identityVersionId: null,
        style: false,
      }),
    ).toEqual([]);
  });

  it("godkjente bilder fra de samme scenene: figurer for en figur, aldri figurer for en bakgrunn", () => {
    const maja = byName("Maja");
    const majaApproved = Object.values(s0.assetVariants).find(
      (v) => v.assetId === maja.id && v.approvedVersionId,
    )!.approvedVersionId!;
    // Bestemor Anne er i scener med Maja: Majas godkjente bilde er stilforbilde
    const anne = attachedImages(s0, {
      assetId: byName("Bestemor Anne").id,
      productionId: main.id,
      identityVersionId: null,
      style: true,
    });
    expect(anne.map((a) => a.versionId)).toContain(majaApproved);
    expect(anne.find((a) => a.versionId === majaApproved)!.label).toContain("Maja");
    // Stua er også i scener med Maja, men en bakgrunn skal ikke få figurer
    const stua = byName("Stua");
    const occ = orderedOccurrences(s0, main.id).find((o) =>
      s0.variants[o.variantId]!.heading.location.includes("STUA"),
    )!;
    const att = attachedImages(s0, {
      assetId: stua.id,
      productionId: main.id,
      occurrenceId: occ.id,
      identityVersionId: null,
      style: true,
    });
    expect(att.map((a) => a.versionId)).not.toContain(majaApproved);
    for (const a of att)
      expect(["location", "environment"]).toContain(s0.assets[assetOf(a.versionId)]!.kind);
  });

  it("beskrivelsen forteller hva hvert bilde er, i samme rekkefølge", () => {
    const maja = byName("Maja");
    const va = Object.values(s0.assetVariants).find((v) => v.assetId === maja.id)!;
    const own = imageVersions.find((v) => assetOf(v.id) === maja.id)!;
    const s = withRefs(
      imageVersions
        .filter((v) => assetOf(v.id) !== maja.id)
        .map((v) => v.id)
        .slice(0, 2),
    );
    const attached = attachedImages(s, {
      assetId: maja.id,
      productionId: main.id,
      identityVersionId: own.id,
      style: true,
    });
    const p = buildContextImagePrompt(s, {
      assetId: maja.id,
      variantId: va.id,
      productionId: main.id,
      withReference: true,
      attached,
    });
    expect(p).toContain("ATTACHED IMAGES");
    expect(p).toContain("Image 1: the current design of Maja");
    expect(p).toContain(`Image ${attached.length}:`);
    expect(p).toContain("Style reference only");
    expect(p).toContain("Keep Maja identical to image 1");
    // Ved sending byttes listen ut med en fersk (ingen dobbel liste)
    const sent = withAttachedLegend(p, "Maja", attached);
    expect(sent.match(/ATTACHED IMAGES/g)).toHaveLength(1);
    expect(sent.endsWith(`this list is what counts.`)).toBe(true);
    // Uten bilder: ingen slik del
    const q = buildContextImagePrompt(s, {
      assetId: maja.id,
      variantId: va.id,
      productionId: main.id,
      withReference: false,
    });
    expect(q).not.toContain("ATTACHED IMAGES");
  });

  it("listen over bildene er alltid fersk, og beskrivelsen kortes – aldri listen", () => {
    const style = (n: number) => ({
      versionId: `v${n}`,
      path: `p/${n}.png`,
      mimeType: "image/png",
      role: "style" as const,
      label: `Ref ${n}`,
    });
    const identity = { ...style(0), role: "identity" as const, label: "Rev v1" };
    // En gammel liste (dagens bilde først) byttes ut når dagens bilde ikke lenger sendes
    const old = `A fox.\n\n${describeAttached("Rev", [identity, style(1)])}\n\nAVOID\nText.`;
    const now = withAttachedLegend(old, "Rev", [style(1)]);
    expect(now).not.toContain("current design of Rev");
    expect(now).toContain("Image 1: Ref 1");
    expect(now).toContain("AVOID\nText.");
    expect(now.match(/ATTACHED IMAGES/g)).toHaveLength(1);
    // Ingen bilder: ingen liste
    expect(withAttachedLegend(old, "Rev", [])).not.toContain("ATTACHED IMAGES");
    expect(stripAttachedSection(old)).toBe("A fox.\n\nAVOID\nText.");
    // For lang: beskrivelsen kortes, listen står helt
    const long = withAttachedLegend("x".repeat(MAX_PROMPT_CHARS), "Rev", [identity, style(1)]);
    expect(long.length).toBeLessThanOrEqual(MAX_PROMPT_CHARS);
    expect(long).toContain("Image 2: Ref 1");
    expect(long.endsWith("this list is what counts.")).toBe(true);
    // Deler ikke et tegn på to UTF-16-enheter
    const emoji = withAttachedLegend("🦊".repeat(MAX_PROMPT_CHARS), "Rev", [style(1)]);
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(emoji)).toBe(false);
  });
});

describe("AI skriver beskrivelsen", () => {
  it("instruksen krever engelsk, tekniske krav, bildene og det som skal unngås", () => {
    for (const part of [
      "English only",
      "transparent background",
      "image 1",
      "Avoid:",
      "no markdown",
    ])
      expect(PROMPT_WRITER_SYSTEM).toContain(part);
    const t = promptWriterUserText({
      brief: "FILM\nA 2D animated film.",
      purpose: "cutout",
      imageLabels: ["Maja – Vinter v2 (character)"],
    });
    expect(t).toContain("transparent background");
    expect(t).toContain("Image 1: Maja – Vinter v2");
    expect(t).toContain("BRIEF:\nFILM");
    expect(promptWriterUserText({ brief: "x", purpose: "background", imageLabels: [] })).toContain(
      "No images will be attached",
    );
  });

  it("svaret renses for kodeblokk, innledning og anførselstegn, og kortes ned", () => {
    expect(cleanWrittenPrompt("```\nA fox.\n```")).toBe("A fox.");
    expect(cleanWrittenPrompt("Here is the prompt:\nA fox in snow.")).toBe("A fox in snow.");
    expect(cleanWrittenPrompt('"A fox."')).toBe("A fox.");
    expect(cleanWrittenPrompt("Prompt: A fox.")).toBe("A fox.");
    expect(cleanWrittenPrompt("  \n ")).toBe(null);
    const long = "A sentence about snow. ".repeat(600);
    const c = cleanWrittenPrompt(long)!;
    expect(c.length).toBeLessThanOrEqual(MAX_PROMPT_CHARS);
    expect(c.endsWith(".")).toBe(true);
  });

  it("AI-skrevne beskrivelser teller ikke i bildebudsjettet", () => {
    const now = new Date("2026-10-11T12:00:00Z");
    const row = (kind: string) => ({
      id: tid(),
      kind,
      provider: "lovable",
      model: "m",
      prompt: "p",
      status: "done",
      created_at: "2026-10-11T10:00:00Z",
      created_by: "u",
      result_text: kind === "prompt" ? "skrevet" : null,
    });
    const jobs = [row("image"), row("prompt"), row("prompt")].map(jobFromRow);
    expect(jobs[1]!.kind).toBe("prompt");
    expect(jobs[1]!.resultText).toBe("skrevet");
    const u = aiUsage({ aiMonthLimit: 5 }, jobs, monthStartUtc(now));
    expect(u.used).toBe(1);
    expect(u.remaining).toBe(4);
  });
});

describe("ukjent modell hos Lovable", () => {
  it("bare feil om modellnavnet gir neste modell", async () => {
    const { isUnknownModelError } = await import("@/adapters/ai/gateway");
    expect(isUnknownModelError(400, '{"error":"Unknown model: google/x"}')).toBe(true);
    expect(isUnknownModelError(404, "model google/x not found")).toBe(true);
    expect(isUnknownModelError(400, "This model's maximum context length is exceeded")).toBe(false);
    expect(isUnknownModelError(400, "image too large for model")).toBe(false);
    expect(isUnknownModelError(402, "Unknown model")).toBe(false);
  });
});
