/** KI-178 (REQ-0415): nye filer i egen mappe per kategori; eldre stier tolkes som før. */
import { describe, expect, it } from "vitest";
import {
  assetFilePath,
  assetVersionIdOfPath,
  estimateUncertainty,
  filmFilePath,
  lastFramePath,
  storedCategoryOf,
  takeIdFromLastFrame,
  takeIdFromResultPath,
  versionIdFromResultPath,
} from "@/core";

const P = "00000000-0000-7000-8000-000000000001";
const A = "00000000-0000-7000-8000-0000000000a1";
const V = "00000000-0000-7000-8000-0000000000b1";
const T = "00000000-0000-7000-8000-0000000000c1";

describe("REQ-0415 – lagringskategorier i egne mapper", () => {
  it("REQ-0415: nye stier har kategori rett under prosjektet", () => {
    expect(assetFilePath(P, "source", A, V, "maja.png")).toBe(`${P}/source/${A}/${V}/maja.png`);
    expect(assetFilePath(P, "generated", A, V, "ai.png")).toBe(`${P}/generated/${A}/${V}/ai.png`);
    expect(filmFilePath(P, "generated", T, "ai-video.mp4")).toBe(
      `${P}/generated/films/${T}/ai-video.mp4`,
    );
    expect(storedCategoryOf(`${P}/generated/films/${T}/x.mp4`)).toBe("generated");
    expect(storedCategoryOf(`${P}/${A}/${V}/x.png`)).toBe(null);
  });

  it("REQ-0415: versjon, take og siste bilde leses fra både nye og eldre stier", () => {
    for (const p of [`${P}/${A}/${V}/f.png`, `${P}/generated/${A}/${V}/f.png`])
      expect(versionIdFromResultPath(p)).toBe(V);
    for (const p of [`${P}/films/${T}/ai-video.mp4`, `${P}/generated/films/${T}/ai-video.mp4`]) {
      expect(takeIdFromResultPath(p)).toBe(T);
      const lf = lastFramePath(p)!;
      expect(lf.endsWith(`films/${T}/last-frame.png`)).toBe(true);
      expect(lf.startsWith(p.slice(0, p.indexOf("films")))).toBe(true);
      expect(takeIdFromLastFrame(P, lf)).toBe(T);
    }
    expect(takeIdFromResultPath(`${P}/generated/${A}/${V}/f.png`)).toBe(null);
  });
});

describe("REQ-0110 – usikre estimater vises som et spenn", () => {
  it("REQ-0110: montasje uten dialog er usikker; dialogscene er det ikke", () => {
    const montage = estimateUncertainty({ dialogueWords: 0, actionLines: 8, seconds: 21 });
    expect(montage.uncertain).toBe(true);
    expect(montage.lowSeconds).toBeLessThan(21);
    expect(montage.highSeconds).toBeGreaterThan(40);
    const talk = estimateUncertainty({ dialogueWords: 150, actionLines: 2, seconds: 66 });
    expect(talk).toEqual({ uncertain: false, lowSeconds: 66, highSeconds: 66 });
  });
});
