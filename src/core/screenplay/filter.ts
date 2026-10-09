/**
 * Søk og filtrering i manus (REQ-0073–REQ-0075, REQ-0531). Bare visning: endrer aldri produksjonens
 * aktive innhold (REQ-0075).
 */
import type { ProjectState } from "../model";
import { blocksOfVariant, orderedOccurrences } from "../views";
import { formatHeading, type Page } from "./paginate";

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
function mentions(text: string, name: string): boolean {
  if (!name) return false;
  let re = nameRes.get(name);
  if (!re) {
    const cap = name.charAt(0) + name.slice(1).toLocaleLowerCase("nb");
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
}

const sceneTextCache = new WeakMap<object, Map<string, SceneText>>();

/** Replikknavn og handlingstekst per variant – beregnes én gang per tilstand. */
function sceneText(s: ProjectState, variantId: string): SceneText {
  let byVariant = sceneTextCache.get(s.blocks);
  if (!byVariant) {
    byVariant = new Map();
    sceneTextCache.set(s.blocks, byVariant);
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
    t = { speakers, text: parts.join("\n") };
    byVariant.set(variantId, t);
  }
  return t;
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
      scenes: texts.filter((t) => t.speakers.has(name) || mentions(t.text, name)).length,
    }))
    .sort((a, b) => b.scenes - a.scenes || a.name.localeCompare(b.name, "nb"));
}

/** Opptrer karakteren i scenen? Har replikk, eller nevnes i handling eller sceneoverskrift. */
export function sceneHasCharacter(s: ProjectState, variantId: string, name: string): boolean {
  const target = characterName(name);
  if (!target) return false;
  const t = sceneText(s, variantId);
  return t.speakers.has(target) || mentions(t.text, target);
}

export interface SceneFilter {
  /** Fritekst i overskrift, handling, replikker m.m. */
  readonly text?: string;
  /** Vis bare scener der denne karakteren opptrer (REQ-0074). */
  readonly character?: string;
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
    if (f.character && !sceneHasCharacter(s, o.variantId, f.character)) continue;
    if (text) {
      const v = s.variants[o.variantId];
      const hay = [
        o.productionNumber ?? "",
        v ? formatHeading(v.heading) : "",
        ...blocksOfVariant(s, o.variantId).map((b) => b.text),
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
