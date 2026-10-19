// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatAnimationTime, formatFrameGap, clampAnimationWindow, animationRuler, resizeAnimationWindow } from "@/core/animation/time-format";

describe("CA frame time", () => {
  const fps = { num: 24, den: 1 };
  it("shows subsecond frames", () => expect(formatFrameGap(7, fps)).toBe("7 f"));
  it("shows seconds and padded remaining frames", () => expect(formatFrameGap(28, fps)).toBe("1 s 04 f"));
  it("never shows zero frames", () => {
    expect(formatFrameGap(0, fps)).toBe("");
    expect(formatFrameGap(24, fps)).toBe("1 s");
  });
  it("uses the project rate", () => expect(formatFrameGap(29, { num: 25, den: 1 })).toBe("1 s 04 f"));
  it("allows minute fields above 59", () => expect(formatAnimationTime(61 * 60 * 24 + 28, fps)).toBe("61:01:04"));
  it("keeps the navigator within the scene", () => {
    expect(clampAnimationWindow(100, 20, 110)).toEqual({ from: 90, span: 20 });
    expect(clampAnimationWindow(-5, 200, 110)).toEqual({ from: 0, span: 110 });
  });
  it("aligns second labels to nice whole seconds", () => {
    const r = animationRuler(20, 240, fps, 500);
    expect(r.step).toBe(48);
    expect(r.ticks[0]).toEqual({ frame: 48, label: "00:02" });
  });
  it("uses frame labels and minor ticks at close zoom", () => {
    const r = animationRuler(0, 10, fps, 500);
    expect(r.step).toBe(2);
    expect(r.ticks[1]?.label).toBe("00:00:02");
    expect(r.frames).toHaveLength(10);
  });
  it("resizes navigator edges without moving the opposite edge", () => {
    expect(resizeAnimationWindow(20, 40, 10, "from", 100)).toEqual({ from: 30, span: 30 });
    expect(resizeAnimationWindow(20, 40, 200, "to", 100)).toEqual({ from: 20, span: 80 });
    expect(resizeAnimationWindow(20, 40, 100, "from", 100)).toEqual({ from: 59, span: 1 });
  });
});
