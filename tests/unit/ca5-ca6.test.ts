/** CA5/CA6: leppesynk, mønstre og atferd – validering, determinisme, angre/gjør om. */
import { describe, expect, it } from "vitest";
import { applyCommand, emptyProjectState, type Command, type ProjectState } from "@/core";
import { envelope } from "../helpers/fixtures";
function apply(s: ProjectState, c: Command) { const r = applyCommand(s, envelope(c)); if (!r.ok) throw new Error(r.error.message); return r; }
import { audioHashOf, lipsyncError, mergeRegenerated, ruleLipsync, spansFromRhubarb, textHashOf, visemeAt, type LipsyncResult } from "@/core/animation/lipsync";
import { DEFAULT_BLINK_SPEC, mulberry32, patternError, patternEventAt, planPatternEvents, type AnimationPattern, type PatternSpec } from "@/core/animation/patterns";
import { eyeStateAt, mouthVisemeAt, overlayEventsAt } from "@/core/animation/evaluate";

const id = (n: number) => `${"0".repeat(8)}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const fps = { num: 24, den: 1 };

function baseState(): ProjectState {
  const s = emptyProjectState();
  return {
    ...s,
    project: { ...s.project, id: id(1), fps },
    occurrences: { [id(2)]: { id: id(2), revision: 1, variantId: id(3), activeTakeId: id(9), active: true, removed: false } as never },
    variants: { [id(3)]: { id: id(3), revision: 1, sceneId: id(4), removed: false } as never },
    blocks: { [id(5)]: { id: id(5), revision: 1, text: "Hallo verden", removed: false } as never },
    takes: { [id(9)]: { id: id(9), revision: 1 } as never },
    audioClips: { [id(6)]: { id: id(6), revision: 1, occurrenceId: id(2), kind: "dialogue", blockId: id(5), offsetMs: 1000, sourceInMs: 0, lengthMs: 2000, removed: false } as never },
  };
}

const result = (over: Partial<LipsyncResult> = {}): LipsyncResult => ({
  id: id(7), revision: 1, clipId: id(6), takeId: id(9), blockId: id(5), source: "rule", algorithmVersion: 1,
  audioHash: "abc123", textHash: "def456", spans: [{ frame: 0, endFrame: 12, viseme: "A" }, { frame: 12, endFrame: 24, viseme: "D" }],
  overrides: [], enabled: true, removed: false, ...over,
});

describe("CA5 leppesynk", () => {
  it("visemeAt: overstyringer vinner over spennet, ellers spennet, ellers X", () => {
    const r = result();
    expect(visemeAt(r, 5)).toBe("A");
    expect(visemeAt(r, 20)).toBe("D");
    expect(visemeAt(r, 30)).toBe("X");
    expect(visemeAt({ ...r, overrides: [{ frame: 5, viseme: "G" }] }, 5)).toBe("G");
  });
  it("lipsyncError avviser ugyldige visemer og overlappende spenn", () => {
    expect(lipsyncError(result())).toBeNull();
    expect(lipsyncError(result({ spans: [{ frame: 0, endFrame: 5, viseme: "Q" as never }] }))).not.toBeNull();
    expect(lipsyncError(result({ spans: [{ frame: 0, endFrame: 10, viseme: "A" }, { frame: 5, endFrame: 9, viseme: "B" }] }))).not.toBeNull();
    expect(lipsyncError(result({ overrides: [{ frame: -1, viseme: "A" }] }))).not.toBeNull();
  });
  it("mergeRegenerated beholder overstyringer og øker revisjonen (§32)", () => {
    const old = result({ overrides: [{ frame: 3, viseme: "H" }] });
    const next = mergeRegenerated(old, { ...result(), spans: [{ frame: 0, endFrame: 48, viseme: "E" }], source: "rhubarb" });
    expect(next.overrides).toEqual([{ frame: 3, viseme: "H" }]);
    expect(next.revision).toBe(2);
    expect(next.source).toBe("rhubarb");
    expect(visemeAt(next, 3)).toBe("H");
  });
  it("spansFromRhubarb konverterer sekunder til frames og slår sammen like naboer", () => {
    const spans = spansFromRhubarb([{ start: 0, end: 0.5, value: "A" }, { start: 0.5, end: 1, value: "A" }, { start: 1, end: 1.5, value: "B" }], 24);
    expect(spans).toEqual([{ frame: 0, endFrame: 24, viseme: "A" }, { frame: 24, endFrame: 36, viseme: "B" }]);
  });
  it("ruleLipsync er deterministisk og gir X uten energi", () => {
    const energies = [0, 0, 0.5, 0.6, 0, 0.4, 0.5, 0];
    const words = [{ startMs: 80, endMs: 250, text: "pappa" }];
    const a = ruleLipsync(energies, words, 24);
    expect(a).toEqual(ruleLipsync(energies, words, 24));
    expect(a.every(s => s.endFrame > s.frame)).toBe(true);
    expect(ruleLipsync([0, 0, 0], [], 24).every(s => s.viseme === "X")).toBe(true);
  });
  it("hasj er stabil og endres med innholdet", () => {
    expect(audioHashOf(new Uint8Array([1, 2, 3]))).toBe(audioHashOf(new Uint8Array([1, 2, 3])));
    expect(audioHashOf(new Uint8Array([1, 2, 3]))).not.toBe(audioHashOf(new Uint8Array([1, 2, 4])));
    expect(textHashOf("hallo")).toBe(textHashOf("hallo"));
    expect(textHashOf("hallo")).not.toBe(textHashOf("hallo!"));
  });
  it("SaveLipsyncResult lagrer via kommando, med invers og angre/gjør om", () => {
    const s = baseState();
    const r = result();
    const one = apply(s, { type: "SaveLipsyncResult", result: r });
    expect(one.state.lipsyncResults[r.id]).toEqual(r);
    const undone = apply(one.state, one.inverse);
    expect(undone.state.lipsyncResults[r.id]).toBeUndefined();
    const redone = apply(undone.state, undone.inverse);
    expect(redone.state.lipsyncResults[r.id]).toEqual(r);
  });
  it("SaveLipsyncResult avviser duplikat per klipp og take, og ukjent klipp", () => {
    const s = baseState();
    const one = apply(s, { type: "SaveLipsyncResult", result: result() });
    expect(() => apply(one.state, { type: "SaveLipsyncResult", result: result({ id: id(8) }) })).toThrow();
    expect(() => apply(s, { type: "SaveLipsyncResult", result: result({ clipId: id(99) }) })).toThrow();
  });
  it("SetLipsyncEnabled og SetLipsyncOverrides endrer bare raden, med angre", () => {
    const s = apply(baseState(), { type: "SaveLipsyncResult", result: result() }).state;
    const off = apply(s, { type: "SetLipsyncEnabled", lipsyncId: id(7), enabled: false });
    expect(off.state.lipsyncResults[id(7)]?.enabled).toBe(false);
    expect(apply(off.state, off.inverse).state.lipsyncResults[id(7)]?.enabled).toBe(true);
    const ov = apply(s, { type: "SetLipsyncOverrides", lipsyncId: id(7), overrides: [{ frame: 1, viseme: "F" }] });
    expect(visemeAt(ov.state.lipsyncResults[id(7)]!, 1)).toBe("F");
  });
  it("mouthVisemeAt bruker bare aktivert leppesynk i klippets tidsrom", () => {
    const s = apply(baseState(), { type: "SaveLipsyncResult", result: result() }).state;
    expect(mouthVisemeAt(s, id(2), 24)).toBe("A"); // klippet starter på frame 24 (1 s)
    expect(mouthVisemeAt(s, id(2), 10)).toBe("X");
    const off = apply(s, { type: "SetLipsyncEnabled", lipsyncId: id(7), enabled: false }).state;
    expect(mouthVisemeAt(off, id(2), 24)).toBe("X");
  });
});

describe("CA6 mønstre og blinking", () => {
  const spec: PatternSpec = { ...DEFAULT_BLINK_SPEC };
  it("planPatternEvents er deterministisk for samme seed (§63)", () => {
    const a = planPatternEvents(spec, 0, 480, 24);
    expect(a).toEqual(planPatternEvents(spec, 0, 480, 24));
    expect(a.length).toBeGreaterThan(0);
    expect(planPatternEvents({ ...spec, seed: 1 }, 0, 480, 24)).not.toEqual(planPatternEvents({ ...spec, seed: 2 }, 0, 480, 24));
  });
  it("utsnitt endrer ikke hendelsene (stabilt ved panorering)", () => {
    const whole = planPatternEvents(spec, 0, 480, 24);
    const part = planPatternEvents(spec, 100, 300, 24);
    expect(part).toEqual(whole.filter(e => e.endFrame > 100 && e.frame < 300));
  });
  it("hendelser holder seg innen min/maks (§64)", () => {
    for (const e of planPatternEvents(spec, 0, 2000, 24)) {
      expect(e.endFrame - e.frame).toBeGreaterThanOrEqual(spec.durationMinFrames);
      expect(e.endFrame - e.frame).toBeLessThanOrEqual(spec.durationMaxFrames);
      expect(e.intensity).toBeGreaterThan(0);
      expect(e.intensity).toBeLessThanOrEqual(1);
    }
  });
  it("patternError avviser ugyldig spec og navn", () => {
    const p: AnimationPattern = { id: id(20), revision: 1, rigId: null, name: "Nervøs", color: "#a1b2c3", spec, removed: false };
    expect(patternError(p)).toBeNull();
    expect(patternError({ ...p, name: "" })).not.toBeNull();
    expect(patternError({ ...p, color: "red" })).not.toBeNull();
    expect(patternError({ ...p, spec: { ...spec, intervalMaxMs: spec.intervalMinMs - 1 } })).not.toBeNull();
    expect(patternError({ ...p, spec: { ...spec, seed: -1 } })).not.toBeNull();
  });
  it("mulberry32 er ren og deterministisk", () => {
    const a = mulberry32(18427), b = mulberry32(18427);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it("SaveAnimationPattern og RemoveAnimationPattern med angre/gjør om", () => {
    const s = baseState();
    const p: AnimationPattern = { id: id(20), revision: 1, rigId: null, name: "Nervøs blinking", color: "#a1b2c3", spec, removed: false };
    const one = apply(s, { type: "SaveAnimationPattern", pattern: p });
    expect(one.state.animationPatterns[p.id]).toEqual(p);
    const two = apply(one.state, { type: "RemoveAnimationPattern", patternId: p.id });
    expect(two.state.animationPatterns[p.id]?.removed).toBe(true);
    const back = apply(two.state, two.inverse);
    expect(back.state.animationPatterns[p.id]?.removed).toBe(false);
    expect(apply(back.state, back.inverse).state.animationPatterns[p.id]?.removed).toBe(true);
  });
  it("eyeStateAt: manuelle blink vinner, avslått blinking er åpen, mønsteret bestemmer ellers", () => {
    const s = apply(baseState(), { type: "SaveAnimationPattern", pattern: { id: id(20), revision: 1, rigId: null, name: "B", color: "#a1b2c3", spec, removed: false } }).state;
    const use = { behavior: { manualBlinks: [{ eye: "left" as const, frame: 10, endFrame: 14, intensity: 0.5 }] } };
    expect(eyeStateAt(s, use, id(30), "left", 12, 480).closed).toBe(0.5);
    expect(eyeStateAt(s, use, id(30), "right", 12, 480).closed).toBe(0);
    expect(eyeStateAt(s, { behavior: { blinkEnabled: false } }, id(30), "left", 50, 480).closed).toBe(0);
    const withPattern = { behavior: { leftEyePatternId: id(20), seed: 18427 } };
    const events = planPatternEvents(spec, 0, 480, 24);
    const hit = patternEventAt(events, events[0]!.frame)!;
    expect(eyeStateAt(s, withPattern, id(30), "left", events[0]!.frame, 480).closed).toBe(hit.intensity);
  });
  it("overlayEventsAt henter bare aktive overleggsmønstre", () => {
    const overlay: AnimationPattern = { id: id(21), revision: 1, rigId: null, name: "Pust", color: "#3fae7a", spec: { ...spec, target: "overlay" }, removed: false };
    const s = apply(baseState(), { type: "SaveAnimationPattern", pattern: overlay }).state;
    const events = planPatternEvents(overlay.spec, 0, 480, 24);
    const frame = events[0]!.frame;
    expect(overlayEventsAt(s, { behavior: { overlayPatternIds: [id(21)] } }, frame, 480)).toHaveLength(1);
    expect(overlayEventsAt(s, { behavior: { overlayPatternIds: [id(21)] } }, 0, 480).filter(() => true).length).toBeLessThanOrEqual(1);
    expect(overlayEventsAt(s, {}, frame, 480)).toHaveLength(0);
  });
  it("SetAnimationBehavior validerer mønstre, seed og blink, med angre", () => {
    const s: ProjectState = {
      ...baseState(),
      layers: { [id(40)]: { id: id(40), revision: 1, compositionId: id(41), assetId: id(42), removed: false } as never },
      compositions: { [id(41)]: { id: id(41), revision: 1, variantId: id(3), removed: false } as never },
      assetVariants: { [id(43)]: { id: id(43), revision: 1, assetId: id(42), archived: false, removed: false } as never },
      assetVersions: { [id(44)]: { id: id(44), revision: 1, variantId: id(43), mimeType: "image/png", removed: false } as never },
    };
    const rig = apply(s, { type: "CreateRig", rigId: id(45), variantId: id(43) }).state;
    const ver = apply(rig, { type: "SaveRigVersion", rigId: id(45), versionId: id(46), sourceVersionId: id(44), spec: { format: 1, anchors: {} } }).state;
    const used = apply(ver, { type: "AttachAnimationUse", useId: id(47), layerId: id(40), occurrenceId: id(2), rigVersionId: id(46) }).state;
    const b = apply(used, { type: "SetAnimationBehavior", useId: id(47), behavior: { seed: 42, manualBlinks: [{ eye: "both", frame: 4, endFrame: 8, intensity: 1 }] } });
    expect(b.state.animationUses[id(47)]?.behavior?.seed).toBe(42);
    expect(apply(b.state, b.inverse).state.animationUses[id(47)]?.behavior).toBeUndefined();
    expect(() => apply(used, { type: "SetAnimationBehavior", useId: id(47), behavior: { seed: -1 } })).toThrow();
    expect(() => apply(used, { type: "SetAnimationBehavior", useId: id(47), behavior: { leftEyePatternId: id(99) } })).toThrow();
  });
});
