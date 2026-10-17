/**
 * Fase 2, bolk E (DEC-0096, E3): lydmotoren spiller romlyd med jevn effekt i krysstoningene. Tale tones lineært
 * som før (bolk C). Forhåndsavspilling og eksport bruker samme `renderComposition`, så de er like.
 */
import { describe, expect, it } from "vitest";
import type { AudioSegment } from "@/core";
import { gainPoints, segmentGainAt } from "@/engine/audio/composition";

const seg = (over: Partial<AudioSegment>): AudioSegment => ({
  id: "00000000-0000-7000-8000-000000000001",
  versionId: "00000000-0000-7000-8000-00000000a001",
  track: 0,
  atMs: 0,
  sourceInMs: 0,
  lengthMs: 400,
  gainDb: 0,
  fadeInMs: 40,
  fadeOutMs: 40,
  ...over,
});

describe("toning av romlyd", () => {
  it("to biter romlyd som krysstones, holder effekten jevn", () => {
    const a = seg({ role: "room" });
    const b = seg({ role: "room", atMs: 360 });
    for (let t = 360; t <= 400; t += 5) {
      const ga = segmentGainAt(a, t - a.atMs);
      const gb = segmentGainAt(b, t - b.atMs);
      expect(ga * ga + gb * gb).toBeCloseTo(1, 5);
    }
  });

  it("tale tones fortsatt lineært", () => {
    const s = seg({});
    expect(segmentGainAt(s, 20)).toBeCloseTo(0.5, 5);
    expect(segmentGainAt(s, 380)).toBeCloseTo(0.5, 5);
    expect(segmentGainAt(s, 200)).toBe(1);
    expect(gainPoints(s, 0, 400)).toEqual([0, 40, 360, 400]);
  });

  it("volumkurven for romlyd følger kurven med flere punkter", () => {
    const p = gainPoints(seg({ role: "room" }), 0, 400);
    expect(p.length).toBe(2 + 2 * 8);
    expect(p[0]).toBe(0);
    expect(p[p.length - 1]).toBe(400);
    expect(gainPoints(seg({ role: "room" }), 100, 300)).toEqual([100, 300]);
  });
});
