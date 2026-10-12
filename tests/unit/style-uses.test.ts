/** Stilprofiler per bruk (REQ-0148, DEC-0071). */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  buildContextImagePrompt,
  buildScenePrompt,
  emptyStyleGuide,
  filmClips,
  mainProduction,
  planSegments,
  sortedAssets,
  styleProfileFor,
  toRow,
  type ProjectState,
} from "@/core";
import { mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const main = mainProduction(s0)!;

function run(s: ProjectState, command: unknown) {
  return applyCommand(s, {
    id: "00000000-0000-7000-8000-00000000f0f2" as never,
    actor: "00000000-0000-7000-8000-000000000001" as never,
    at: new Date().toISOString(),
    command: command as never,
  });
}

function withProfiles() {
  const def = tid<"style_profile">();
  const night = tid<"style_profile">();
  let s = s0;
  for (const p of Object.values(s.styleProfiles))
    s = mustApply(s, { type: "SetStyleProfileRemoved", profileId: p.id, removed: true } as never);
  s = mustApply(s, {
    type: "CreateStyleProfile",
    profileId: def,
    fields: {
      name: "Film",
      isDefault: true,
      guide: { ...emptyStyleGuide(), visualStyle: "Soft watercolour" },
    },
  } as never);
  s = mustApply(s, {
    type: "CreateStyleProfile",
    profileId: night,
    fields: {
      name: "Video",
      isDefault: false,
      guide: { ...emptyStyleGuide(), visualStyle: "Bold ink lines" },
    },
  } as never);
  s = mustApply(s, {
    type: "SetStyleAppliesTo",
    profileId: night,
    appliesTo: ["ai_video", "location"],
  } as never);
  return { s, def, night };
}

describe("stilprofil per bruk", () => {
  it("riktig profil brukes for AI-video og steder; standarden for resten", () => {
    const { s, def, night } = withProfiles();
    expect(styleProfileFor(s, "ai_video")!.id).toBe(night);
    expect(styleProfileFor(s, "location")!.id).toBe(night);
    expect(styleProfileFor(s, "character")!.id).toBe(def);
    const clip = filmClips(s, main.id)[0]!;
    const seg = planSegments(s, clip, 10)[0]!;
    const video = buildScenePrompt(s, {
      clip,
      productionId: main.id,
      segment: seg,
      index: 0,
      count: 1,
    });
    expect(video).toContain("Bold ink lines");
    const ch = sortedAssets(s).find((a) => a.kind === "character")!;
    const img = buildContextImagePrompt(s, {
      assetId: ch.id,
      variantId: null,
      productionId: main.id,
      occurrenceId: null,
      withReference: false,
    });
    expect(img).toContain("Soft watercolour");
    expect(toRow("styleProfiles", s.styleProfiles[night]!, s.project.id)["applies_to"]).toEqual([
      "location",
      "ai_video",
    ]);
  });

  it("en bruk kan bare ha én profil; angring virker; gjenoppretting kan ikke gi dobbelt", () => {
    const { s, def, night } = withProfiles();
    expect(run(s, { type: "SetStyleAppliesTo", profileId: def, appliesTo: ["ai_video"] }).ok).toBe(
      false,
    );
    expect(run(s, { type: "SetStyleAppliesTo", profileId: def, appliesTo: ["tull"] }).ok).toBe(
      false,
    );
    const r = run(s, { type: "SetStyleAppliesTo", profileId: night, appliesTo: [] });
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(mustApply(r.state, r.inverse as never).styleProfiles[night]!.appliesTo).toEqual([
        "location",
        "ai_video",
      ]);
    // Fjern «Video», gi «ai_video» til en ny profil, prøv å hente «Video» fram igjen
    let t = mustApply(s, {
      type: "SetStyleProfileRemoved",
      profileId: night,
      removed: true,
    } as never);
    const third = tid<"style_profile">();
    t = mustApply(t, {
      type: "CreateStyleProfile",
      profileId: third,
      fields: { name: "Ny", isDefault: false, guide: emptyStyleGuide() },
    } as never);
    t = mustApply(t, {
      type: "SetStyleAppliesTo",
      profileId: third,
      appliesTo: ["ai_video"],
    } as never);
    expect(run(t, { type: "SetStyleProfileRemoved", profileId: night, removed: false }).ok).toBe(
      false,
    );
  });

  it("en profil for bestemte bruk blir aldri reserve for alt; angring av opprettelsen avvises da (gjennomgang DEC-0071)", () => {
    const { s, def, night } = withProfiles();
    const noDefault = mustApply(s, {
      type: "SetStyleProfileRemoved",
      profileId: def,
      removed: true,
    } as never);
    expect(styleProfileFor(noDefault, "character")).toBe(null);
    expect(styleProfileFor(noDefault, "ai_video")!.id).toBe(night);
    expect(run(s, { type: "UndoCreateStyleProfile", profileId: night }).ok).toBe(false);
  });
});
