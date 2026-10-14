// @vitest-environment node
/** Filmens visuelle stil og bildebeskrivelser med sammenheng (DEC-0065, REQ-0147, REQ-0245, REQ-0589). */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  buildContextImagePrompt,
  defaultStyleProfile,
  diffStates,
  emptyProjectState,
  emptyStyleGuide,
  detectSeasons,
  detectTimeOfDay,
  hasStyleGuide,
  mainProduction,
  orderedOccurrences,
  stateFromRows,
  styleGuideError,
  suggestStyleGuide,
  type ProjectState,
  type StyleGuide,
} from "@/core";
import { envelope, mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const main = mainProduction(s0)!;
const byName = (n: string) => Object.values(s0.assets).find((a) => a.name === n)!;
const guide: StyleGuide = {
  ...emptyStyleGuide(),
  premise: "A girl spends Christmas with her grandmother on a farm in Dovre.",
  technique: "Watercolour and gouache on textured paper",
  mood: "Warm and a little mysterious",
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

describe("filmens visuelle stil", () => {
  it("lagres, endres og angres; høyst én standard; ugyldige verdier avvises", () => {
    expect(hasStyleGuide(s0)).toBe(false);
    const { s, profileId } = withGuide();
    expect(defaultStyleProfile(s)?.id).toBe(profileId);
    expect(hasStyleGuide(s)).toBe(true);
    // To standarder: avvist
    expect(
      applyCommand(
        s,
        envelope({
          type: "CreateStyleProfile",
          profileId: tid<"style_profile">(),
          fields: { name: "Annen", isDefault: true, guide },
        }),
      ).ok,
    ).toBe(false);
    // Ugyldige verdier
    expect(styleGuideError({ ...guide, palette: { colors: ["rød"], description: "" } })).not.toBe(
      null,
    );
    expect(styleGuideError({ ...guide, mood: "x".repeat(2000) })).not.toBe(null);
    expect(styleGuideError({ ...guide, hemmelig: 1 } as never)).not.toBe(null);
    // Endring og angring
    const r = applyCommand(
      s,
      envelope({
        type: "UpdateStyleProfile",
        profileId,
        fields: {
          name: "Filmens visuelle stil",
          isDefault: true,
          guide: { ...guide, mood: "Cosy" },
        },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.styleProfiles[profileId]!.guide.mood).toBe("Cosy");
    const back = mustApply(r.state, r.inverse);
    expect(back.styleProfiles[profileId]!.guide.mood).toBe(guide.mood);
    // Rundtur gjennom databaseradene
    const cs = diffStates(emptyProjectState(s.project), s);
    const rows = Object.fromEntries(Object.entries(cs.inserts)) as Record<string, unknown[]>;
    const read = stateFromRows({
      project: fixture.project,
      ...rows,
      script_block_revisions: cs.blockRevisions,
    } as never);
    expect(read.styleProfiles[profileId]).toEqual(s.styleProfiles[profileId]);
  });

  it("et forbildebilde kan ikke angres bort så lenge stilen bruker det", () => {
    const v = Object.values(s0.assetVersions).find((x) => x.mimeType.startsWith("image/"))!;
    const s = mustApply(s0, {
      type: "CreateStyleProfile",
      profileId: tid<"style_profile">(),
      fields: { name: "Stil", isDefault: true, guide: { ...guide, referenceVersionIds: [v.id] } },
    });
    const r = applyCommand(s, envelope({ type: "UndoAddAssetVersion", versionId: v.id } as never));
    expect(r.ok).toBe(false);
  });
});

describe("bildebeskrivelse med sammenheng", () => {
  const occs = orderedOccurrences(s0, main.id);

  it("tar med filmen, stilen, scenen med lys, andre i scenen, godkjente bilder og det som skal unngås", () => {
    const { s } = withGuide();
    const stua = byName("Stua");
    const occ = occs.find((o) => s.variants[o.variantId]!.heading.location.includes("STUA"))!;
    const p = buildContextImagePrompt(s, {
      assetId: stua.id,
      variantId: null,
      productionId: main.id,
      occurrenceId: occ.id,
      withReference: false,
    });
    // DEC-0080: én sammenhengende bestilling uten skjemaoverskrifter og uten filmtittel (som kan havne
    // som tekst i bildet); farger med navn og kode; scenelyset til bakgrunnen
    for (const part of [
      "Create a wide background painting of Stua",
      guide.premise!,
      guide.technique!,
      "deep navy (#0d1b2a)",
      guide.mood!,
      "fills the whole frame",
      "empty of people and characters",
      "Lighting: day",
      "Leave out:",
      "Photorealism",
      guide.instructions!,
    ])
      expect(p, part).toContain(part);
    expect(p).not.toContain("Jula på Dovre");
    expect(p).not.toMatch(/^(FILM|VISUAL STYLE|THIS IMAGE)$/m);
    expect(p.length).toBeLessThan(8000);
  });

  it("en figur blir frilagt med gjennomsiktig bakgrunn og får utseendet sitt i scenen", () => {
    const { s } = withGuide();
    const maja = byName("Maja");
    const va = Object.values(s.assetVariants).find((v) => v.assetId === maja.id)!;
    const p = buildContextImagePrompt(s, {
      assetId: maja.id,
      variantId: va.id,
      productionId: main.id,
      occurrenceId: null,
      withReference: true,
    });
    // Flat hvit bakgrunn (friegges etterpå), nøytralt lys – ikke scenelyset – og ingen replikker
    expect(p).toContain("plain, flat, pure white background");
    expect(p).toContain("soft, even, neutral light");
    expect(p).toContain("Keep Maja identical to the attached reference image");
    expect(p).not.toContain("says:");
    // Modellen kan lage gjennomsiktig bakgrunn: da bes det om det
    const t = buildContextImagePrompt(s, {
      assetId: maja.id,
      variantId: va.id,
      productionId: main.id,
      occurrenceId: null,
      withReference: true,
      transparent: true,
    });
    expect(t).toContain("fully transparent background");
  });

  it("uten stil virker den fortsatt, og utkastet foreslår verden og stil fra manuset", () => {
    const maja = byName("Maja");
    const p = buildContextImagePrompt(s0, {
      assetId: maja.id,
      variantId: null,
      productionId: main.id,
      occurrenceId: null,
      withReference: false,
    });
    expect(p).toContain("Style: simple, readable animatic style");
    const g = suggestStyleGuide(s0, main.id);
    expect(styleGuideError(g)).toBe(null);
    expect(g.world).toContain("STUA");
    expect(g.world).toMatch(/Christmas|winter/);
  });
});

describe("tid på døgnet og årstid fra manuset", () => {
  it("kjenner igjen norske former og gir ikke falske treff", () => {
    expect(detectTimeOfDay("DAGEN ETTER")).toBe("day");
    expect(detectTimeOfDay("MORGENGRY")).toBe("morning");
    expect(detectTimeOfDay("KVELD")).toBe("evening");
    expect(detectTimeOfDay("NATTEN")).toBe("night");
    expect(detectTimeOfDay("middag")).toBe(null);
    expect(detectSeasons("Det er snø ute.")).toEqual(["winter, snow"]);
    expect(detectSeasons("Jula nærmer seg")).toEqual(["Christmas time"]);
    expect(detectSeasons("I juli reiser de. Julie ler.")).toEqual([]);
    expect(detectSeasons("I alle fall. Spring, Maja!")).toEqual([]);
    expect(detectSeasons("Høsten kommer")).toEqual(["autumn"]);
    expect(detectSeasons("Vi går til vår gård")).toEqual([]);
  });
});
