/**
 * G-1b punkt 5: skriftsystemer for innebygde Noto-fonter i PDF (manus, plakat, presentasjon).
 * Ren kjerne: bestemmer hvilket skriftsystem et tegn tilhører, deler tekst i løp per skriftsystem og
 * sier hvilke fontfiler en eksport trenger. Selve lastingen skjer i nettleseren (src/engine/export/pdf-fonts.ts),
 * og bare fontene teksten faktisk bruker lastes. Alle fontene er SIL OFL 1.1 (public/fonts/pdf/OFL.txt).
 */

export type NotoScript = "latin" | "jp" | "kr" | "sc" | "arabic" | "hebrew" | "devanagari" | "thai";

/** Rekkefølgen fontene lastes og registreres i (latin først som reserve). */
export const NOTO_SCRIPTS: readonly NotoScript[] = ["latin", "jp", "kr", "sc", "arabic", "hebrew", "devanagari", "thai"];

/** Høyre-til-venstre-skrift: løpet må snus til visuell rekkefølge før det tegnes. */
export const RTL_SCRIPTS: ReadonlySet<NotoScript> = new Set(["arabic", "hebrew"]);

type Range = readonly [number, number];
const RANGES: readonly (readonly [NotoScript, readonly Range[]])[] = [
  ["kr", [[0x1100, 0x11ff], [0x3130, 0x318f], [0xa960, 0xa97f], [0xac00, 0xd7af], [0xd7b0, 0xd7ff]]],
  ["jp", [[0x3040, 0x30ff], [0x31f0, 0x31ff], [0xff65, 0xff9f]]],
  ["arabic", [[0x0600, 0x06ff], [0x0750, 0x077f], [0x08a0, 0x08ff], [0xfb50, 0xfdff], [0xfe70, 0xfeff]]],
  ["hebrew", [[0x0590, 0x05ff], [0xfb1d, 0xfb4f]]],
  ["devanagari", [[0x0900, 0x097f], [0xa8e0, 0xa8ff]]],
  ["thai", [[0x0e00, 0x0e7f]]],
  // Latin, gresk og kyrillisk (Noto Sans dekker dem), pluss vanlig tegnsetting og valuta
  ["latin", [[0x0020, 0x024f], [0x0250, 0x02ff], [0x0300, 0x036f], [0x0370, 0x03ff], [0x0400, 0x052f], [0x1c80, 0x1c8f], [0x1e00, 0x1fff], [0x2000, 0x206f], [0x20a0, 0x20cf], [0x2100, 0x214f], [0x2150, 0x218f], [0x2190, 0x21ff], [0x2c60, 0x2c7f], [0x2de0, 0x2dff], [0xa640, 0xa69f], [0xa720, 0xa7ff]]],
];
/** Han-tegn og CJK-tegnsetting: delt mellom japansk, kinesisk og koreansk. */
const HAN: readonly Range[] = [[0x2e80, 0x2fdf], [0x3000, 0x303f], [0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xf900, 0xfaff], [0xff00, 0xff64], [0xffa0, 0xffef]];

const inRanges = (c: number, rs: readonly Range[]) => rs.some(([a, b]) => c >= a && c <= b);

/** Skriftsystemet for ett tegn; null = ingen av fontene dekker det (for eksempel emoji). */
export function notoScriptOfChar(ch: string, hanFont: "jp" | "sc" | "kr" = "jp"): NotoScript | null {
  const c = ch.codePointAt(0)!;
  if (c < 0x20) return "latin";
  for (const [s, rs] of RANGES) if (inRanges(c, rs)) return s;
  if (inRanges(c, HAN)) return hanFont;
  return null;
}

/**
 * Hvilken font Han-tegnene skal bruke: koreansk tekst → KR, japansk kana → JP, ellers forenklet kinesisk
 * når språket er kinesisk. Språket (BCP-47) avgjør når teksten bare har Han-tegn.
 */
export function hanFontFor(text: string, language?: string): "jp" | "sc" | "kr" {
  if (/[\uac00-\ud7af\u1100-\u11ff]/u.test(text)) return "kr";
  if (/[\u3040-\u30ff]/u.test(text)) return "jp";
  const base = (language ?? "").toLowerCase().split("-")[0];
  if (base === "zh") return "sc";
  if (base === "ko") return "kr";
  return "jp";
}

export interface ScriptRun {
  readonly script: NotoScript;
  readonly text: string;
}

/** Deler teksten i løp med samme skriftsystem. Mellomrom og tegnsetting følger løpet de står i. */
export function scriptRuns(text: string, language?: string): ScriptRun[] {
  const han = hanFontFor(text, language);
  const out: { script: NotoScript; text: string }[] = [];
  for (const ch of text) {
    const s = notoScriptOfChar(ch, han) ?? "latin";
    const neutral = /[\s\p{P}\p{N}]/u.test(ch) && s === "latin";
    const last = out[out.length - 1];
    if (last && (last.script === s || neutral)) last.text += ch;
    else out.push({ script: s, text: ch });
  }
  return out;
}

/** Fontene en eksport trenger (latin er alltid med som reserve). */
export function notoScriptsNeeded(texts: Iterable<string>, language?: string): NotoScript[] {
  const s = new Set<NotoScript>(["latin"]);
  for (const t of texts) for (const r of scriptRuns(t, language)) s.add(r.script);
  return NOTO_SCRIPTS.filter((k) => s.has(k));
}

/** Tegn ingen av Noto-fontene dekker (unike, i rekkefølgen de først forekommer). */
export function notoUncovered(texts: Iterable<string>): string[] {
  const seen = new Set<string>();
  for (const t of texts)
    for (const ch of t) if (ch !== "\n" && ch !== "\r" && ch !== "\t" && notoScriptOfChar(ch) === null) seen.add(ch);
  return [...seen];
}
