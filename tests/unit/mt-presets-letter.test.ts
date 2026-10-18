import { describe, expect, it } from "vitest";
import { applyMotionPreset, letterAnimWith, normalizeLetterAnim, presetWindow } from "../../src/core";

const layer = {
  transform: { x: 100, y: 100, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, anchorX: 0.5, anchorY: 0.5 },
  keyframes: [],
  activeRange: null,
} as never;

describe("MT3 inn- og utanimasjon", () => {
  it("inn og ut på samme lag gir begge settene, uten overlapp", () => {
    const opt = { frame: 0, sceneFrames: 100, durationFrames: 12 };
    const wIn = presetWindow(layer, "in", opt);
    const wOut = presetWindow(layer, "out", opt);
    expect(wIn).toEqual({ ok: true, startFrame: 0 });
    expect(wOut).toEqual({ ok: true, startFrame: 88 });
    const k1 = applyMotionPreset(layer, "fade", { phase: "in", startFrame: 0, durationFrames: 12, direction: "left", distance: 200 });
    const k2 = applyMotionPreset({ ...(layer as object), keyframes: k1 } as never, "fade", { phase: "out", startFrame: 88, durationFrames: 12, direction: "left", distance: 200 });
    expect(k2.map((k) => [k.frame, k.value])).toEqual([[0, 0], [12, 1], [88, 1], [100, 0]]);
  });
  it("ut slutter ved slutten av lagets område, inn kan starte ved hodet inne i området", () => {
    const l = { ...(layer as object), activeRange: { from: 20, to: 80 } } as never;
    expect(presetWindow(l, "out", { frame: 0, sceneFrames: 200, durationFrames: 10 })).toEqual({ ok: true, startFrame: 70 });
    expect(presetWindow(l, "in", { frame: 30, sceneFrames: 200, durationFrames: 10 })).toEqual({ ok: true, startFrame: 30 });
    expect(presetWindow(l, "in", { frame: 0, sceneFrames: 200, durationFrames: 10 })).toEqual({ ok: true, startFrame: 20 });
    // Hodet så sent at inn ville gått inn i ut: inn starter ved starten av området
    expect(presetWindow(l, "in", { frame: 65, sceneFrames: 200, durationFrames: 10 })).toEqual({ ok: true, startFrame: 20 });
  });
  it("for kort lag for begge gir en tydelig melding", () => {
    const r = presetWindow(layer, "in", { frame: 0, sceneFrames: 20, durationFrames: 12 });
    expect(r.ok).toBe(false);
  });
});

describe("MT3 bokstavanimasjon", () => {
  it("lag uten bokstavanimasjon får standardverdier og godkjennes", () => {
    const a = letterAnimWith(null, { effect: "appear" });
    expect(a.unit).toBe("letter");
    expect(a.delayFrames).toBeGreaterThan(0);
    expect(a.durationFrames).toBeGreaterThan(0);
    expect(normalizeLetterAnim(a).ok).toBe(true);
  });
  it("ugyldige verdier avvises med melding", () => {
    const r = normalizeLetterAnim(letterAnimWith(null, { delayFrames: -1 }));
    expect(r.ok).toBe(false);
  });
});
