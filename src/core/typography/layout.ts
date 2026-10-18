/**
 * Tekstoppsett og bokstavanimasjon (MTS §9, §29, §60–61). Ren beregning: linjebryting, plassering av hvert
 * tegn og tilstanden til hver animert enhet på et bilde. Målingen av tekst er en port (`TextMeasurer`) som
 * nettleseren og eksporten fyller med samme Canvas-måling (src/engine/compositor/canvas.ts). Uten registrert
 * måler brukes et fast anslag (tester, server).
 */
import type { LetterAnimation, TextSpec } from "./types";
import { cssFont } from "./fonts";

/** Bredden av `text` i piksler med CSS-fonten `font`. */
export type TextMeasurer = (font: string, text: string) => number;

/** Fast anslag: 0,55 × størrelse per tegn (samme for alle; brukes når ingen måler er registrert). */
export const estimateMeasurer: TextMeasurer = (font, text) => {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  const size = m ? Number(m[1]) : 16;
  return [...text].length * size * 0.55;
};

let measurer: TextMeasurer = estimateMeasurer;

/** Registrerer måleren (gjøres én gang av lerretet). Returnerer den forrige. */
export function registerTextMeasurer(m: TextMeasurer): TextMeasurer {
  const prev = measurer;
  measurer = m;
  return prev;
}

export function currentTextMeasurer(): TextMeasurer {
  return measurer;
}

export interface Glyph {
  readonly char: string;
  /** Venstre kant og grunnlinje i lagets koordinater (midten av laget er 0,0). */
  readonly x: number;
  readonly y: number;
  /** Indeksen til enheten (bokstav, ord eller linje) tegnet hører til. */
  readonly unit: number;
}

export interface TextLayout {
  readonly font: string;
  readonly lines: readonly string[];
  readonly glyphs: readonly Glyph[];
  readonly units: number;
}

/** Linjer etter bryting innenfor `width` (ord bevares; et for langt ord får egen linje). */
export function wrapLines(spec: TextSpec, width: number, m: TextMeasurer = measurer): string[] {
  const font = cssFont(spec);
  const w = (t: string) => m(font, t) + spec.letterSpacing * Math.max(0, [...t].length - 1);
  const out: string[] = [];
  for (const para of spec.content.split("\n")) {
    if (!spec.wrap) {
      out.push(para);
      continue;
    }
    let line = "";
    for (const word of para.split(/(\s+)/)) {
      const next = line + word;
      if (line && w(next.trimEnd()) > width) {
        out.push(line.trimEnd());
        line = word.trimStart();
      } else line = next;
    }
    out.push(line.trimEnd());
  }
  return out;
}

/** Plassering av hvert tegn i en tekstboks på `width` × `height` (samme i editor og eksport). */
export function layoutText(
  spec: TextSpec,
  width: number,
  height: number,
  m: TextMeasurer = measurer,
): TextLayout {
  const font = cssFont(spec);
  const lines = wrapLines(spec, width, m);
  const lh = spec.size * spec.lineHeight;
  const total = lines.length * lh;
  const top =
    spec.vAlign === "top" ? -height / 2 : spec.vAlign === "bottom" ? height / 2 - total : -total / 2;
  const glyphs: Glyph[] = [];
  let letter = 0;
  let word = 0;
  lines.forEach((line, li) => {
    const chars = [...line];
    const lw = m(font, line) + spec.letterSpacing * Math.max(0, chars.length - 1);
    const left =
      spec.align === "left" ? -width / 2 : spec.align === "right" ? width / 2 - lw : -lw / 2;
    // Grunnlinjen: ca. 0,8 av størrelsen ned i linjen (samme regel overalt)
    const y = top + li * lh + (lh - spec.size) / 2 + spec.size * 0.8;
    let prefix = "";
    let inWord = false;
    chars.forEach((ch, i) => {
      const x = left + m(font, prefix) + spec.letterSpacing * i;
      prefix += ch;
      const space = /\s/.test(ch);
      if (!space && !inWord) inWord = true;
      if (space && inWord) {
        inWord = false;
        word++;
      }
      if (space) return;
      const unit =
        spec.letterAnim?.unit === "line" ? li : spec.letterAnim?.unit === "word" ? word : letter;
      glyphs.push({ char: ch, x, y, unit });
      letter++;
    });
    if (inWord) word++;
  });
  const units =
    spec.letterAnim?.unit === "line" ? lines.length : spec.letterAnim?.unit === "word" ? word : letter;
  return { font, lines, glyphs, units };
}

export interface UnitState {
  readonly opacity: number;
  readonly dx: number;
  readonly dy: number;
  readonly scale: number;
}

const FULL: UnitState = { opacity: 1, dx: 0, dy: 0, scale: 1 };

/** Rekkefølgen enhetene kommer i: rang per enhet. */
export function unitRanks(n: number, order: LetterAnimation["order"], seed: number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  if (order === "end") return idx.map((i) => n - 1 - i);
  if (order === "center") {
    const c = (n - 1) / 2;
    const sorted = [...idx].sort((a, b) => Math.abs(a - c) - Math.abs(b - c) || a - b);
    const rank = new Array<number>(n);
    sorted.forEach((u, r) => (rank[u] = r));
    return rank;
  }
  if (order === "random") {
    let x = (seed | 0) || 1;
    const rnd = () => {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      return ((x >>> 0) % 1_000_000) / 1_000_000;
    };
    const perm = [...idx];
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [perm[i], perm[j]] = [perm[j]!, perm[i]!];
    }
    const rank = new Array<number>(n);
    perm.forEach((u, r) => (rank[u] = r));
    return rank;
  }
  return idx;
}

/** Tilstanden til hver enhet på `localFrame` (bilder fra lagets start). */
export function unitStates(
  anim: LetterAnimation | null | undefined,
  units: number,
  localFrame: number,
): UnitState[] {
  if (!anim) return Array.from({ length: units }, () => FULL);
  const ranks = unitRanks(units, anim.order, anim.seed);
  return ranks.map((r) => {
    const start = anim.startFrame + r * anim.delayFrames;
    if (anim.effect === "appear") return localFrame >= start ? FULL : { ...FULL, opacity: 0 };
    const lin = Math.min(1, Math.max(0, (localFrame - start) / Math.max(1, anim.durationFrames)));
    const p = 1 - (1 - lin) ** 3;
    if (anim.effect === "fade") return { ...FULL, opacity: p };
    if (anim.effect === "scale") return { opacity: p, dx: 0, dy: 0, scale: p };
    const d = (1 - p) * anim.distance;
    const dx = anim.direction === "left" ? -d : anim.direction === "right" ? d : 0;
    const dy = anim.direction === "up" ? -d : anim.direction === "down" ? d : 0;
    return { opacity: p, dx, dy, scale: 1 };
  });
}

/** Siste bilde der bokstavanimasjonen fortsatt endrer noe (for varighet og forhåndsvisning). */
export function letterAnimEnd(anim: LetterAnimation, units: number): number {
  const last = anim.startFrame + Math.max(0, units - 1) * anim.delayFrames;
  return anim.effect === "appear" ? last : last + anim.durationFrames;
}
