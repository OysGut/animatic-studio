// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatAnimationTime, formatFrameGap, clampAnimationWindow } from "@/core/animation/time-format";

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
});
