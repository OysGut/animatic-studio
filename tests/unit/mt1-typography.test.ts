import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  applyMotionPreset,
  defaultTextSpec,
  estimateMeasurer,
  layoutText,
  normalizeTextSpec,
  unitStates,
  MAX_TEXT_CHARS,
} from "@/core";

describe("MT1 tekstmodell", () => {
  it("æ, ø og å plasseres som egne tegn", () => {
    const l = layoutText({ ...defaultTextSpec("ÆØÅ æøå"), wrap: false }, 1000, 200, estimateMeasurer);
    expect(l.glyphs.map((g) => g.char).join("")).toBe("ÆØÅæøå");
  });
  it("over 2000 tegn avvises med melding, ingenting kuttes", () => {
    const r = normalizeTextSpec(defaultTextSpec("a".repeat(MAX_TEXT_CHARS + 1)));
    expect(r.ok).toBe(false);
    expect(normalizeTextSpec(defaultTextSpec("a".repeat(MAX_TEXT_CHARS))).ok).toBe(true);
  });
});

describe("MT3 bokstavanimasjon og oppsett", () => {
  it("F → FI → FIL → FILM", () => {
    const anim = { unit: "letter", effect: "appear", direction: "up", startFrame: 0, delayFrames: 5, durationFrames: 1, order: "start", seed: 1, distance: 0 } as const;
    const shown = (f: number) => unitStates(anim, 4, f).filter((s) => s.opacity > 0).length;
    expect([shown(0), shown(5), shown(10), shown(15)]).toEqual([1, 2, 3, 4]);
  });
  it("innfade lager vanlige nøkkelbilder", () => {
    const k = applyMotionPreset(
      { transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 }, keyframes: [] },
      "fade",
      { phase: "in", startFrame: 0, durationFrames: 10, direction: "up", distance: 0 },
    );
    expect(k.map((x) => [x.frame, x.value])).toEqual([[0, 0], [10, 1]]);
  });
});

describe("Arkitektur: tekstlag tegnes bare i canvas.ts", () => {
  it("ingen andre filer leser tegnene fra renderFrame", () => {
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((f) => {
        const p = join(d, f);
        return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
      });
    const root = join(__dirname, "../../src");
    const bad = walk(root).filter(
      (f) =>
        /\.glyphs\b/.test(readFileSync(f, "utf8")) &&
        !/compositor[\\/]canvas\.ts$|composition[\\/]render\.ts$|typography[\\/]layout\.ts$/.test(f),
    );
    expect(bad).toEqual([]);
  });
});
