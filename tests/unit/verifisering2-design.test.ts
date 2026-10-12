// @vitest-environment node
/**
 * Verifisering av krav (DEC-0074): designtokens i src/styles.css – mørkt standardtema (REQ-0012) og
 * tekstkontrast etter WCAG AA i hele fargesettet (REQ-0425, den målbare delen). Fargene regnes om fra oklch
 * til sRGB og kontrasten beregnes etter WCAG 2.x.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(join(__dirname, "../../src/styles.css"), "utf8");

/** Tokenene i standardtemaet (blokken «:root, .dark»). */
function rootTokens(): Map<string, string> {
  const start = CSS.indexOf(":root,\n.dark");
  expect(start).toBeGreaterThanOrEqual(0);
  const block = CSS.slice(start, CSS.indexOf("}", start));
  const out = new Map<string, string>();
  for (const m of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) out.set(m[1]!, m[2]!.trim());
  return out;
}

const TOKENS = rootTokens();

/** oklch(L C h) → lineær sRGB (0–1), klippet til skjermens fargerom. */
function linearRgb(token: string): [number, number, number] {
  const v = TOKENS.get(token);
  const m = v?.match(/^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/);
  if (!m) throw new Error(`Token --${token} er ikke en ugjennomsiktig oklch-farge: ${v}`);
  const [L, C, h] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  return [
    clamp(4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s),
  ];
}

function luminance(token: string): number {
  const [r, g, b] = linearRgb(token);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = ["bg-app", "surface-1", "surface-2", "surface-3", "background", "card", "popover"];

describe("REQ-0012 – mørkt standardtema definert som designtokens", () => {
  it("REQ-0012: standardtemaet er mørkt: flatene er mørke, teksten lys, og nettleseren får beskjed om mørkt fargeskjema", () => {
    for (const s of SURFACES) expect(luminance(s), s).toBeLessThan(0.05);
    for (const t of ["text-primary", "foreground", "script-ink"])
      expect(luminance(t), t).toBeGreaterThan(0.6);
    expect(TOKENS.get("color-scheme") ?? CSS.match(/color-scheme:\s*(\w+)/)?.[1]).toBe("dark");
    // Flatene går fra mørkest (appen) til lysere (paneler, menyer) – ett sammenhengende trinnsett
    const steps = ["bg-app", "surface-1", "surface-2", "surface-3"].map(luminance);
    for (let i = 1; i < steps.length; i++) expect(steps[i]!).toBeGreaterThan(steps[i - 1]!);
    // Tailwind-fargene peker på tokenene (komponentene bruker samme sett)
    for (const name of ["surface-1", "text-primary", "status-danger", "accent-brand"])
      expect(CSS).toContain(`--color-${name}: var(--${name});`);
  });
});

describe("REQ-0425 – tekstkontrast etter WCAG AA", () => {
  const TEXT = [
    "text-primary",
    "text-secondary",
    "text-tertiary",
    "foreground",
    "muted-foreground",
    "accent-brand",
    "accent-warm",
    "note",
    "status-neutral",
    "status-running",
    "status-success",
    "status-danger",
    "status-discrepancy",
    "status-uncertain",
    "status-moved",
  ];

  it.each(TEXT)("REQ-0425: --%s har minst 4,5:1 mot alle flatene", (fg) => {
    for (const bg of SURFACES)
      expect(contrast(fg, bg), `${fg} på ${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  it("REQ-0425: tekst på fargede knapper og manusarket har minst 4,5:1", () => {
    const pairs: [string, string][] = [
      ["accent-fg", "accent-brand"],
      ["primary-foreground", "primary"],
      ["destructive-foreground", "destructive"],
      ["script-ink", "script-paper"],
      ["script-ink-light", "script-paper-light"],
      ["popover-foreground", "popover"],
      ["card-foreground", "card"],
    ];
    for (const [fg, bg] of pairs)
      expect(contrast(fg, bg), `${fg} på ${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  it("REQ-0425: kontrollprøve – beregningen gir kjente verdier (svart/hvitt 21:1)", () => {
    TOKENS.set("test-white", "oklch(1 0 0)");
    TOKENS.set("test-black", "oklch(0 0 0)");
    expect(contrast("test-white", "test-black")).toBeCloseTo(21, 1);
    expect(contrast("test-white", "test-white")).toBeCloseTo(1, 6);
    TOKENS.delete("test-white");
    TOKENS.delete("test-black");
  });
});
