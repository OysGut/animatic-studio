// @vitest-environment node
/**
 * Bildeverktøy i stor visning (Mars 15.10.2026): delelinjer som kan flyttes i «Del opp», «Fjern luften
 * rundt» også for hvit/ensfarget bakgrunn, beskrivelsen til «Lag variasjoner» og til deler av et bilde.
 */
import { describe, expect, it } from "vitest";
import {
  buildPartPrompt,
  buildVariationPrompt,
  cellAt,
  cellsFromLines,
  evenLines,
  findTrim,
  gridCells,
  moveLine,
  solidBackground,
  solidBounds,
  tileName,
  type ImageBrief,
} from "@/core";

/** Et bilde med bakgrunnsfarge `bg` og et rektangel i fargen `fg` (x0–x1, y0–y1, inklusive). */
function picture(
  w: number,
  h: number,
  bg: readonly [number, number, number, number],
  fg: readonly [number, number, number, number],
  r: { x0: number; y0: number; x1: number; y1: number } | null,
) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = r && x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1 ? fg : bg;
      px.set(c, (y * w + x) * 4);
    }
  return px;
}

describe("delelinjer i «Del opp» (Mars 15.10.2026)", () => {
  it("jevnt fordelte linjer gir samme ruter som gridCells", () => {
    expect(evenLines(4)).toEqual([0.25, 0.5, 0.75]);
    expect(evenLines(1)).toEqual([]);
    expect(cellsFromLines(400, 300, evenLines(4), evenLines(2))).toEqual(gridCells(400, 300, 4, 2));
  });

  it("flyttede linjer gir ruter med ulik bredde, i leserekkefølge, uten hull eller overlapp", () => {
    const cells = cellsFromLines(1000, 500, [0.1, 0.7], [0.4]);
    expect(cells).toHaveLength(6);
    expect(cells.map((c) => c.w).slice(0, 3)).toEqual([100, 600, 300]);
    expect(cells[0]).toEqual({ x: 0, y: 0, w: 100, h: 200 });
    expect(cells[3]).toEqual({ x: 0, y: 200, w: 100, h: 300 });
    const area = cells.reduce((s, c) => s + c.w * c.h, 0);
    expect(area).toBe(1000 * 500);
  });

  it("linjene sorteres og ugyldige verdier ignoreres", () => {
    expect(cellsFromLines(100, 100, [0.8, 0.2, 2, -1, Number.NaN], [])).toHaveLength(3);
  });

  it("en linje flyttes for seg og kan ikke krysse naboene (minst 2 % avstand)", () => {
    const xs = [0.25, 0.5, 0.75];
    expect(moveLine(xs, 1, 0.6)).toEqual([0.25, 0.6, 0.75]);
    expect(moveLine(xs, 1, 0.9)).toEqual([0.25, 0.73, 0.75]);
    expect(moveLine(xs, 1, 0.1)[1]).toBeCloseTo(0.27);
    expect(moveLine(xs, 0, -5)[0]).toBeCloseTo(0.02);
    expect(moveLine(xs, 2, 5)[2]).toBeCloseTo(0.98);
    expect(xs).toEqual([0.25, 0.5, 0.75]); // originalen endres ikke
  });

  it("klikk finner ruten, og tomt navn blir prefiks + nummer", () => {
    const cells = cellsFromLines(300, 100, [1 / 3, 2 / 3], []);
    expect(cellAt(cells, 150, 50)).toBe(1);
    expect(cellAt(cells, 299, 99)).toBe(2);
    expect(cellAt(cells, 400, 50)).toBe(-1);
    expect(tileName(["Front", "  ", ""], 0, "Rev")).toBe("Front");
    expect(tileName(["Front", "  "], 1, "Rev")).toBe("Rev 2");
    expect(tileName([], 3, "Rev")).toBe("Rev 4");
  });
});

describe("«Fjern luften rundt» (Mars 15.10.2026: virket bare på gjennomsiktig kant)", () => {
  const WHITE = [255, 255, 255, 255] as const;
  const RED = [200, 30, 30, 255] as const;
  const CLEAR = [0, 0, 0, 0] as const;

  it("finner hvit bakgrunn fra kanten og figuren inni", () => {
    const px = picture(100, 80, WHITE, RED, { x0: 30, y0: 20, x1: 59, y1: 49 });
    const bg = solidBackground(px, 100, 80);
    expect(bg).not.toBeNull();
    expect(bg![0]).toBeGreaterThan(250);
    expect(solidBounds(px, 100, 80, bg!)).toEqual({ x: 30, y: 20, w: 30, h: 30 });
    expect(findTrim(px, 100, 80)).toEqual({
      kind: "ok",
      by: "color",
      box: { x: 30, y: 20, w: 30, h: 30 },
    });
  });

  it("virker også på farget, litt støyete bakgrunn (innenfor toleransen)", () => {
    const px = picture(60, 60, [40, 90, 160, 255], [250, 220, 20, 255], {
      x0: 10,
      y0: 15,
      x1: 29,
      y1: 44,
    });
    // Litt støy i bakgrunnen (JPEG-aktig): ±6 i hver kanal
    for (let i = 0; i < px.length; i += 4)
      if (px[i] === 40) {
        px[i] = 40 + ((i / 4) % 7) - 3;
        px[i + 2] = 160 - ((i / 4) % 5) + 2;
      }
    const t = findTrim(px, 60, 60);
    expect(t.kind).toBe("ok");
    if (t.kind === "ok") expect(t.box).toEqual({ x: 10, y: 15, w: 20, h: 30 });
  });

  it("gjennomsiktig kant brukes først (som før)", () => {
    const px = picture(50, 50, CLEAR, RED, { x0: 5, y0: 5, x1: 14, y1: 24 });
    expect(findTrim(px, 50, 50)).toEqual({
      kind: "ok",
      by: "alpha",
      box: { x: 5, y: 5, w: 10, h: 20 },
    });
  });

  it("utsnitt med gjennomsiktige hjørner og hvit bakgrunn inni: fargen avgjøres av de synlige kantpikslene", () => {
    const w = 40;
    const h = 40;
    const px = picture(w, h, WHITE, RED, { x0: 15, y0: 12, x1: 24, y1: 27 });
    // Hjørnene gjennomsiktige (som utenfor en fri markering)
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        px[(y * w + x) * 4 + 3] = 0;
        px[(y * w + (w - 1 - x)) * 4 + 3] = 0;
      }
    const t = findTrim(px, w, h);
    expect(t).toEqual({ kind: "ok", by: "color", box: { x: 15, y: 12, w: 10, h: 16 } });
  });

  it("forklarer hvorfor ingenting fjernes", () => {
    // Én eneste farge over hele bildet: bare bakgrunn
    expect(
      findTrim(picture(20, 20, WHITE, RED, { x0: 0, y0: 0, x1: 19, y1: 19 }), 20, 20).kind,
    ).toBe("empty");
    // Figuren fyller (nesten) hele bildet
    const full = picture(100, 100, WHITE, RED, { x0: 1, y0: 1, x1: 98, y1: 98 });
    expect(findTrim(full, 100, 100).kind).toBe("full");
    // Bare bakgrunn
    expect(findTrim(picture(20, 20, WHITE, RED, null), 20, 20).kind).toBe("empty");
    expect(findTrim(picture(20, 20, CLEAR, RED, null), 20, 20).kind).toBe("empty");
    // Ingen dominerende kantfarge (stripete kant)
    const striped = new Uint8ClampedArray(30 * 30 * 4);
    for (let i = 0; i < 30 * 30; i++) {
      const x = i % 30;
      striped.set(x % 3 === 0 ? RED : x % 3 === 1 ? WHITE : [20, 120, 40, 255], i * 4);
    }
    expect(solidBackground(striped, 30, 30)).toBeNull();
    expect(findTrim(striped, 30, 30).kind).toBe("no-background");
  });
});

function brief(over: Partial<ImageBrief> = {}): ImageBrief {
  return {
    task: "design",
    purpose: "cutout",
    subject: { name: "Døra", kind: "object", facts: [], notes: [], appearance: null },
    views: ["front"],
    style: {
      look: "Flat 2D cut-paper look",
      technique: "Digital gouache",
      design: "",
      colours: ["deep navy (#1b2a3a)"],
      colourNote: "",
      mood: "",
      fromGuide: true,
    },
    film: "",
    setting: null,
    moodExcerpt: null,
    lighting: "soft",
    composition: "Centred",
    transparent: false,
    references: [
      { index: 1, role: "identity", label: "Døra – Animatic v3" },
      { index: 2, role: "style", label: "Rev v1" },
    ],
    avoid: [],
    instructions: "",
    ...over,
  };
}

describe("beskrivelsen for «Lag variasjoner» (Mars 15.10.2026)", () => {
  it("bildet er originalen, bare det brukeren ber om endres, og teksten sendes med", () => {
    const r = buildVariationPrompt(brief(), "døren står åpen", {
      index: 0,
      count: 1,
      family: "narrative",
    });
    expect(r.negative).toBeNull();
    expect(r.prompt).toContain('"døren står åpen"');
    expect(r.prompt).toContain("using image 1 as the original");
    expect(r.prompt).toMatch(/Keep everything else exactly as in the original/);
    expect(r.prompt).toContain("Match the drawing style of image 2");
    expect(r.prompt).toContain("Flat 2D cut-paper look");
    expect(r.prompt).toMatch(/pure white background/);
    expect(r.prompt).not.toMatch(/variation 1 of/);
  });

  it("flere variasjoner blir litt ulike; kort form har negativ beskrivelse; bakgrunner beholder bakgrunnen", () => {
    const many = buildVariationPrompt(brief(), "med snø på taket", {
      index: 2,
      count: 4,
      family: "narrative",
    });
    expect(many.prompt).toContain("variation 3 of 4");
    const compact = buildVariationPrompt(brief({ transparent: true }), "åpen", {
      index: 0,
      count: 1,
      family: "compact",
    });
    expect(compact.prompt).toMatch(/^Edit image 1: Døra/);
    expect(compact.prompt).toContain("Transparent background");
    expect(compact.negative).toContain("different style");
    const bg = buildVariationPrompt(brief({ purpose: "background" }), "natt", {
      index: 0,
      count: 1,
      family: "narrative",
    });
    expect(bg.prompt).toContain("Keep the same background");
  });
});

describe("beskrivelsen for deler av et bilde (Mars 15.10.2026)", () => {
  it("bare delen tegnes, hel, i samme stil og vinkel, uten de andre delene", () => {
    const r = buildPartPrompt(brief(), "dørblad", ["dørramme", "dørblad"], "narrative");
    expect(r.prompt).toContain('"dørblad"');
    expect(r.prompt).toContain("Do not draw the other parts (dørramme)");
    expect(r.prompt).toMatch(/complete and whole/);
    expect(r.prompt).toContain("Using image 1 of Døra");
    const c = buildPartPrompt(brief({ transparent: true }), "dørramme", [], "compact");
    expect(c.prompt).toContain("Transparent background");
    expect(c.negative).toContain("other parts");
  });
});
