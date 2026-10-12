/** Myke overganger mellom deler i en scene (DEC-0071, REQ-0265). */
import { describe, expect, it } from "vitest";
import {
  compositionOfVariant,
  editableParts,
  filmClips,
  mainProduction,
  orderedOccurrences,
  partBlendAt,
  setPartTransition,
  splitParts,
  toRow,
  type ClipPartFields,
} from "@/core";
import { mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const main = mainProduction(s0)!;
const occ = orderedOccurrences(s0, main.id).find(
  (o) => o.active && compositionOfVariant(s0, o.variantId),
)!;
const fps = s0.project.fps;

function withParts(transitionMs: number) {
  const parts: ClipPartFields[] = [
    { partId: tid<"clip_part">(), source: "composition", takeId: null, inMs: 0, outMs: 2000 },
    {
      partId: tid<"clip_part">(),
      source: "composition",
      takeId: null,
      inMs: 0,
      outMs: 2000,
      transitionMs,
    },
  ];
  return mustApply(s0, {
    type: "SetSceneEdit",
    occurrenceId: occ.id,
    activeTakeId: null,
    parts,
  } as never);
}

describe("myk overgang mellom deler", () => {
  it("lagres på delen, regnes om til bilder og tones jevnt rundt skjøten", () => {
    const s = withParts(1000);
    const clip = filmClips(s, main.id).find((c) => c.occurrenceId === occ.id)!;
    expect(clip.parts[1]!.transitionMs).toBe(1000);
    const t = clip.parts[1]!.transitionFrames!;
    const b = clip.parts[1]!.startFrame;
    expect(partBlendAt(clip, b - t, fps)).toBe(null);
    const before = partBlendAt(clip, b - 1, fps)!;
    const after = partBlendAt(clip, b, fps)!;
    // Like før skjøten: neste del nesten halvt synlig; like etter: forrige del nesten halvt synlig
    expect(before.alpha).toBeGreaterThan(0.4);
    expect(before.alpha).toBeLessThan(0.5);
    expect(after.alpha).toBeLessThanOrEqual(0.5);
    expect(after.alpha).toBeGreaterThan(0.4);
    expect(partBlendAt(clip, b + Math.ceil(t / 2), fps)).toBe(null);
    // Scenen blir ikke kortere
    expect(clip.parts.reduce((x, p) => x + p.durationFrames, 0)).toBe(
      filmClips(withParts(0), main.id)
        .find((c) => c.occurrenceId === occ.id)!
        .parts.reduce((x, p) => x + p.durationFrames, 0),
    );
    // Lagres som transition_ms
    const row = toRow("clipParts", s.clipParts[clip.parts[1]!.id!]!, s.project.id);
    expect(row["transition_ms"]).toBe(1000);
  });

  it("redigering beholder overgangen, splitting gir den ikke videre, og den kan ikke være for lang", () => {
    const s = withParts(500);
    const clip = filmClips(s, main.id).find((c) => c.occurrenceId === occ.id)!;
    const parts = editableParts(clip, () => tid<"clip_part">())!;
    expect(parts[0]!.transitionMs).toBeUndefined();
    expect(parts[1]!.transitionMs).toBe(500);
    expect(setPartTransition(parts, 1, 9000)![1]!.transitionMs).toBe(2000);
    expect(setPartTransition(parts, 1, 0)![1]!.transitionMs).toBeUndefined();
    expect(setPartTransition(parts, 0, 500)).toBe(null);
    const split = splitParts(clip, clip.parts[1]!.startFrame + 10, fps, () => tid<"clip_part">())!;
    expect(split[1]!.transitionMs).toBe(500);
    expect(split[2]!.transitionMs).toBeUndefined();
  });

  it("overgangen kortes inn til delen før, og vinduet når aldri forbi nabodelen (gjennomgang DEC-0071)", () => {
    const short: ClipPartFields[] = [
      { partId: tid<"clip_part">(), source: "composition", takeId: null, inMs: 0, outMs: 2000 },
      { partId: tid<"clip_part">(), source: "composition", takeId: null, inMs: 0, outMs: 400 },
      {
        partId: tid<"clip_part">(),
        source: "composition",
        takeId: null,
        inMs: 0,
        outMs: 2000,
        transitionMs: 1500,
      },
    ];
    const s = mustApply(s0, {
      type: "SetSceneEdit",
      occurrenceId: occ.id,
      activeTakeId: null,
      parts: short,
    } as never);
    expect(s.clipParts[short[2]!.partId]!.transitionMs).toBe(400);
    // Selv om lagret verdi er for lang (eldre data), blandes bare naboene inn
    const clip = filmClips(s, main.id).find((c) => c.occurrenceId === occ.id)!;
    const raw = {
      ...clip,
      parts: clip.parts.map((p, i) => (i === 2 ? { ...p, transitionFrames: 1000 } : p)),
    };
    const p1 = raw.parts[1]!;
    for (let f = 0; f < raw.parts[2]!.startFrame + 5; f++) {
      const b = partBlendAt(raw, f, fps);
      if (b && f < p1.startFrame) throw new Error(`blander inn i første del (bilde ${f})`);
    }
  });
});
