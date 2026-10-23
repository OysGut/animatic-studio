import { describe, expect, it } from "vitest";
import { dirOf, isRtlText } from "@/core/rtl";

describe("dirOf (G-4)", () => {
  it("arabisk, hebraisk og persisk er rtl", () => {
    expect(dirOf("مرحبا بالعالم")).toBe("rtl");
    expect(dirOf("שלום עולם")).toBe("rtl");
    expect(dirOf("سلام دنیا")).toBe("rtl");
  });
  it("latinsk, CJK og tall først er ltr", () => {
    expect(dirOf("Hello")).toBe("ltr");
    expect(dirOf("映画")).toBe("ltr");
    expect(dirOf("123 مرحبا")).toBe("ltr");
    expect(dirOf("")).toBe("ltr");
  });
  it("blandet tekst følger det første sterke tegnet", () => {
    expect(dirOf("مشهد 12 – Sara")).toBe("rtl");
    expect(dirOf("Scene שלום")).toBe("ltr");
  });
  it("isRtlText samsvarer med dirOf", () => {
    expect(isRtlText("مرحبا")).toBe(true);
    expect(isRtlText("Hei")).toBe(false);
  });
});
