/**
 * Søk og filtrering i manus (REQ-0073–REQ-0075, REQ-0531). Bare visning: endrer aldri produksjonens
 * aktive innhold (REQ-0075).
 */
import type { ProjectState } from "../model";
import { blocksOfVariant, orderedOccurrences } from "../views";
import { formatHeading, type Page } from "./paginate";
import { annotationsByVariant } from "../notes";

/** Karakternavn uten tillegg som (O.S.), (V.O.), (CONT'D), (FORTS.). */
export function characterName(text: string): string {
  return text
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.:;,]+$/, "") // «ROLF.» i originalen er samme karakter som «ROLF»
    .trim()
    .toUpperCase();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const nameRes = new Map<string, RegExp>();
/**
 * Nevnes navnet i teksten? Som eget ord, skrevet med store bokstaver (MAJA – introduksjon) eller med stor
 * forbokstav (Maja). Små bokstaver teller ikke, så karakterer som FAR eller MOR ikke treffer «far» og «mor».
 */
export function mentions(text: string, name: string): boolean {
  if (!name) return false;
  let re = nameRes.get(name);
  if (!re) {
    // Stor forbokstav i hvert ord: «BESTEMOR ANNE» → «Bestemor Anne»
    const cap = name
      .toLocaleLowerCase("nb")
      .replace(
        /(^|[\s-])(\p{L})/gu,
        (_m, sep: string, ch: string) => sep + ch.toLocaleUpperCase("nb"),
      );
    const alt = name === cap ? escapeRe(name) : `${escapeRe(name)}|${escapeRe(cap)}`;
    re = new RegExp(`(^|[^\\p{L}\\p{N}])(${alt})($|[^\\p{L}\\p{N}])`, "u");
    if (nameRes.size > 500) nameRes.clear();
    nameRes.set(name, re);
  }
  return re.test(text);
}

export interface CharacterInfo {
  readonly name: string;
  /** Antall scener (forekomster) der karakteren har replikk eller nevnes i handlingen. */
  readonly scenes: number;
}

interface SceneText {
  readonly speakers: Set<string>;
  /** Handling og overskrift samlet (for å finne navn som nevnes). */
  readonly text: string;
  /** Ord i teksten som begynner med stor bokstav, med store bokstaver (rask forhåndssjekk for navn). */
  readonly capsWords: Set<string>;
  /** Alle ord i teksten med små bokstaver (for ord som begynner med et navn, f.eks. «vasen»). */
  readonly lowerWords: readonly string[];
}

const WORD_RE = /[\p{L}\p{N}]+/gu;

/** Per tilstand: tekst per variant. Nøklene er blokkene og variantene (overskrifter), så begge gir ny beregning. */
const sceneTextCache = new WeakMap<object, WeakMap<object, Map<string, SceneText>>>();

/** Replikknavn og handlingstekst per variant – beregnes én gang per tilstand. */
function sceneText(s: ProjectState, variantId: string): SceneText {
  let byVariants = sceneTextCache.get(s.blocks);
  if (!byVariants) {
    byVariants = new WeakMap();
    sceneTextCache.set(s.blocks, byVariants);
  }
  let byVariant = byVariants.get(s.variants);
  if (!byVariant) {
    byVariant = new Map();
    byVariants.set(s.variants, byVariant);
  }
  let t = byVariant.get(variantId);
  if (!t) {
    const speakers = new Set<string>();
    const parts: string[] = [];
    for (const b of blocksOfVariant(s, variantId)) {
      if (b.kind === "character") {
        const n = characterName(b.text);
        if (n) speakers.add(n);
      } else if (b.kind === "action" || b.kind === "shot") parts.push(b.text);
    }
    const v = s.variants[variantId];
    if (v) parts.push(formatHeading(v.heading));
    const text = parts.join("\n");
    const capsWords = new Set<string>();
    const lower = new Set<string>();
    for (const m of text.matchAll(WORD_RE)) {
      const w = m[0];
      const first = w.charAt(0);
      if (first !== first.toLocaleLowerCase("nb")) capsWords.add(w.toLocaleUpperCase("nb"));
      lower.add(w.toLocaleLowerCase("nb"));
    }
    t = { speakers, text, capsWords, lowerWords: [...lower] };
    byVariant.set(variantId, t);
  }
  return t;
}

/** Nevnes navnet (stor forbokstav eller store bokstaver) i handling/overskrift? Rask sjekk via ordlisten. */
function textMentions(t: SceneText, name: string): boolean {
  const words = name.match(WORD_RE);
  if (!words) return false;
  for (const w of words) if (!t.capsWords.has(w.toLocaleUpperCase("nb"))) return false;
  return words.length === 1 ? true : mentions(t.text, name);
}

/** Nevnes navnet i scenen (som eget ord med stor forbokstav eller store bokstaver)? */
export function sceneMentions(s: ProjectState, variantId: string, name: string): boolean {
  return textMentions(sceneText(s, variantId), name);
}

/**
 * Finnes et ord som begynner med navnet, uansett store/små bokstaver («vase» treffer «vasen»)?
 * Navn med flere ord må stå i sammenheng.
 */
export function sceneHasWordPrefix(s: ProjectState, variantId: string, name: string): boolean {
  const t = sceneText(s, variantId);
  const key = name.toLocaleLowerCase("nb").trim();
  if (key.length < 2) return false;
  const words = key.match(WORD_RE);
  if (!words) return false;
  if (words.length === 1) return t.lowerWords.some((w) => w.startsWith(words[0]!));
  if (!words.slice(0, -1).every((w) => t.lowerWords.includes(w))) return false;
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(key)}`, "iu");
  return re.test(t.text);
}

/** Karakterene i en produksjon (alle med replikk), sortert etter antall scener. */
export function charactersInProduction(s: ProjectState, productionId: string): CharacterInfo[] {
  const occs = orderedOccurrences(s, productionId);
  const texts = occs.map((o) => sceneText(s, o.variantId));
  const names = new Set<string>();
  for (const t of texts) for (const n of t.speakers) names.add(n);
  return [...names]
    .map((name) => ({
      name,
      scenes: texts.filter((t) => t.speakers.has(name) || textMentions(t, name)).length,
    }))
    .sort((a, b) => b.scenes - a.scenes || a.name.localeCompare(b.name, "nb"));
}

/** Opptrer karakteren i scenen? Har replikk, eller nevnes i handling eller sceneoverskrift. */
export function sceneHasCharacter(s: ProjectState, variantId: string, name: string): boolean {
  const target = characterName(name);
  if (!target) return false;
  const t = sceneText(s, variantId);
  return t.speakers.has(target) || textMentions(t, target);
}

/** Har karakteren replikk i scenen (under ett av navnene)? */
export function sceneSpeakers(s: ProjectState, variantId: string): ReadonlySet<string> {
  return sceneText(s, variantId).speakers;
}

/** Handling og overskrift i scenen (der navn kan nevnes). */
export function sceneActionText(s: ProjectState, variantId: string): string {
  return sceneText(s, variantId).text;
}

export interface SceneFilter {
  /** Fritekst i overskrift, handling, replikker m.m. */
  readonly text?: string;
  /** Vis bare scener der denne karakteren opptrer (REQ-0074). */
  readonly character?: string;
  /**
   * Alle navnene til karakteren fra ressursbiblioteket (foretrukket + alternative, REQ-0126).
   * Når satt, opptrer karakteren i scenen hvis ett av navnene gjør det (KI-29).
   */
  readonly characterNames?: readonly string[];
}

export function isFilterActive(f: SceneFilter): boolean {
  return Boolean(f.text?.trim() || f.character);
}

/** Forekomstene i produksjonen som matcher filteret (alle hvis filteret er tomt). */
export function matchingOccurrences(
  s: ProjectState,
  productionId: string,
  f: SceneFilter,
): Set<string> {
  const text = f.text?.trim().toLocaleLowerCase("nb") ?? "";
  const out = new Set<string>();
  for (const o of orderedOccurrences(s, productionId)) {
    if (f.character) {
      const names = f.characterNames?.length ? f.characterNames : [f.character];
      if (!names.some((n) => sceneHasCharacter(s, o.variantId, n))) continue;
    }
    if (text) {
      const v = s.variants[o.variantId];
      const hay = [
        o.productionNumber ?? "",
        v ? formatHeading(v.heading) : "",
        ...blocksOfVariant(s, o.variantId).map((b) => b.text),
        // Notater gir også treff (REQ-0539)
        ...(annotationsByVariant(s).get(o.variantId) ?? []).map((a) => a.text),
      ]
        .join("\n")
        .toLocaleLowerCase("nb");
      if (!hay.includes(text)) continue;
    }
    out.add(o.id);
  }
  return out;
}

/**
 * Sidene med bare linjene til de valgte forekomstene. Sidetall og plassering beholdes (sidene brytes ikke
 * på nytt), og sider uten treff utelates.
 */
export function filterPages(pages: readonly Page[], occurrenceIds: ReadonlySet<string>): Page[] {
  const out: Page[] = [];
  for (const p of pages) {
    const lines = p.lines.filter((l) => occurrenceIds.has(l.occurrenceId));
    if (lines.length) out.push({ number: p.number, lines });
  }
  return out;
}
