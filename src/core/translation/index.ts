/**
 * Språkversjoner av manuset (M7 del 2, DEC-0058, mandat kap. 23, REQ-0329–0339, REQ-0349/0351).
 *
 * Norsk er hovedmanuset. En oversettelse hører til en manuslinje (samme narrative replikk, REQ-0339) eller
 * et scenehode, og endrer aldri det norske (REQ-0331). Er den norske teksten endret siden oversettelsen ble
 * laget, må den gjennomgås (REQ-0330).
 *
 * Import av et ferdig oversatt manus (REQ-0332–0335): de oversatte scenene kobles til de norske etter
 * rekkefølge, scenenummer, hvem som snakker, INT./EXT., tid på døgnet og antall replikker (ikke bare nummer
 * eller ordrett tekst, REQ-0334). Linjene i en scene kobles etter type og hvem som snakker. Usikre koblinger
 * godkjennes av brukeren.
 */
import type { ProjectState, ScriptBlock, SceneHeading, Translation } from "../model";
import type { ParsedScene, ParsedScreenplay } from "../screenplay/types";
import { parseHeading } from "../screenplay/parse";
import { characterName } from "../screenplay/filter";
import { formatHeading } from "../screenplay/paginate";
import { blocksOfVariant, isScriptOccurrence, orderedOccurrences } from "../views";
import { textAtRevision } from "../assembly/discrepancy";
import { blockSpans, filmClips } from "../assembly/film";
import { framesToSeconds } from "../time";
import { getLanguage } from "../i18n";
import { tLocalized } from "@/core/i18n/keyed";

export const LANGUAGE_LABEL: Record<string, string> = tLocalized({ nb: "core-translation-index.language-label.nb.ce9fb99403a7", en: "core-translation-index.language-label.en.6c5aa1625678" });

/** Språknavnet midt i en setning: «norsk» på norsk, «Norwegian» på engelsk. */
export function languageWord(l: string): string {
  const name = LANGUAGE_LABEL[l] ?? l;
  return getLanguage() === "en" ? name : name.toLowerCase();
}

const live = (t: Translation, lang: string) => !t.removed && t.language === lang;

const indexCache = new WeakMap<object, Map<string, Translation>>();

/** Oversettelsene per mål (blokk- eller variant-ID) og språk, beregnet én gang per tilstand. */
function index(s: ProjectState): Map<string, Translation> {
  let m = indexCache.get(s.translations);
  if (!m) {
    m = new Map();
    for (const t of Object.values(s.translations))
      if (!t.removed) m.set(`${t.blockId ?? t.variantId}:${t.language}`, t);
    indexCache.set(s.translations, m);
  }
  return m;
}

export function translationOf(s: ProjectState, targetId: string, lang: string): Translation | null {
  return index(s).get(`${targetId}:${lang}`) ?? null;
}

/** Er den norske teksten endret siden oversettelsen ble laget (og ikke endret tilbake)? (REQ-0330) */
export function needsReview(s: ProjectState, t: Translation): boolean {
  if (!t.blockId) {
    // Scenehode: endret siden oversettelsen
    const v = t.variantId ? s.variants[t.variantId] : undefined;
    return !!v && v.revision > t.basedOnRev;
  }
  const b = s.blocks[t.blockId];
  if (!b || b.currentRev === t.basedOnRev) return false;
  const old = textAtRevision(s, b.id, t.basedOnRev);
  return old === null || old !== b.text;
}

export interface TranslationStatus {
  /** Linjer (uten scenehoder) i aktive scener. */
  readonly lines: number;
  readonly translated: number;
  readonly uncertain: number;
  readonly review: number;
  /** Blokk-ID-er som mangler oversettelse, er usikre eller må gjennomgås. */
  readonly missingIds: ReadonlySet<string>;
  readonly uncertainIds: ReadonlySet<string>;
  readonly reviewIds: ReadonlySet<string>;
}

/** Status for oversettelsen av en produksjon. */
export function translationStatus(
  s: ProjectState,
  productionId: string,
  lang: string,
): TranslationStatus {
  const missingIds = new Set<string>();
  const uncertainIds = new Set<string>();
  const reviewIds = new Set<string>();
  let lines = 0;
  let translated = 0;
  const seen = new Set<string>();
  for (const o of orderedOccurrences(s, productionId)) {
    if (!o.active || seen.has(o.variantId) || !isScriptOccurrence(o)) continue;
    seen.add(o.variantId);
    for (const b of blocksOfVariant(s, o.variantId)) {
      if (b.kind === "heading" || !b.text.trim()) continue;
      lines++;
      const t = translationOf(s, b.id, lang);
      if (!t) {
        missingIds.add(b.id);
        continue;
      }
      translated++;
      if (t.status === "uncertain") uncertainIds.add(b.id);
      if (needsReview(s, t)) reviewIds.add(b.id);
    }
  }
  return {
    lines,
    translated,
    uncertain: uncertainIds.size,
    review: reviewIds.size,
    missingIds,
    uncertainIds,
    reviewIds,
  };
}

const translatedCache = new WeakMap<object, Map<string, ProjectState>>();

/**
 * Tilstanden med teksten på et annet språk: linjer og scenehoder som er oversatt, får oversettelsen; resten
 * beholder norsk. Brukes bare til visning og eksport (REQ-0349) – aldri til endringer.
 */
export function translatedState(s: ProjectState, lang: string): ProjectState {
  if (lang === "nb") return s;
  let byLang = translatedCache.get(s);
  if (!byLang) translatedCache.set(s, (byLang = new Map()));
  const hit = byLang.get(lang);
  if (hit) return hit;
  const blocks: Record<string, ScriptBlock> = { ...s.blocks };
  const variants = { ...s.variants };
  for (const t of Object.values(s.translations)) {
    if (!live(t, lang) || !t.text.trim()) continue;
    if (t.blockId && blocks[t.blockId]) blocks[t.blockId] = { ...blocks[t.blockId]!, text: t.text };
    if (t.variantId && variants[t.variantId]) {
      const v = variants[t.variantId]!;
      variants[t.variantId] = { ...v, heading: headingFromText(t.text, v.heading) };
    }
  }
  // B-050: approved correspondence affects translated projection only, never source state.
  for (const link of Object.values(s.translationLineLinks ?? {})) {
    if (link.removed || link.language !== lang || !["approved","manual"].includes(link.origin)) continue;
    const texts=link.targetTranslationIds.flatMap(id=>{const t=s.translations[id]??s.translationLines?.[id];return t && !t.removed && t.language===lang ? [t.text] : [];});
    if (!texts.length) continue;
    link.sourceBlockIds.forEach((id,index)=> {
      const b=blocks[id];
      if (!b || b.variantId !== link.variantId) return;
      // n:1 appears once instead of duplicating a merged translated line.
      blocks[id]={...b,text:index===0 ? texts.join("\n") : ""};
    });
  }
  const out = { ...s, blocks, variants };
  byLang.set(lang, out);
  return out;
}

/** Oversatt scenehode som tekst → felt (INT./EXT., sted, tid). Faller tilbake til originalen ved tom tekst. */
export function headingFromText(text: string, fallback: SceneHeading): SceneHeading {
  const t = text.trim();
  if (!t) return fallback;
  const h = parseHeading(t);
  return h.location || h.intExt ? h : { ...fallback, location: t };
}

// ---------- Import og kobling (REQ-0332–0335) ----------

/** Tid på døgnet på norsk og engelsk (for sammenligning av scenehoder). */
const TIME_WORDS: Record<string, string> = {
  DAG: "day",
  DAY: "day",
  KVELD: "evening",
  EVENING: "evening",
  NATT: "night",
  NIGHT: "night",
  MORGEN: "morning",
  MORNING: "morning",
  ETTERMIDDAG: "afternoon",
  AFTERNOON: "afternoon",
  SKUMRING: "dusk",
  DUSK: "dusk",
  DAWN: "dawn",
  GRY: "dawn",
  SOLOPPGANG: "dawn",
  SUNRISE: "dawn",
  SOLNEDGANG: "dusk",
  SUNSET: "dusk",
  CONTINUOUS: "cont",
  SAMME: "cont",
  LATER: "later",
  SENERE: "later",
};

function timeKey(t: string): string {
  const w = t
    .toUpperCase()
    .replace(/[^A-ZÆØÅ ]/g, " ")
    .trim()
    .split(/\s+/);
  for (const x of w) if (TIME_WORDS[x]) return TIME_WORDS[x]!;
  return "";
}

const intExtKey = (x: string) => x.toUpperCase().replace(/[^A-Z/]/g, "");

interface SceneSig {
  readonly number: string | null;
  readonly intExt: string;
  readonly time: string;
  readonly speakers: ReadonlySet<string>;
  readonly dialogues: number;
  readonly elements: number;
}

function sigOfParsed(p: ParsedScene): SceneSig {
  const speakers = new Set<string>();
  let dialogues = 0;
  for (const e of p.elements) {
    if (e.kind === "character") speakers.add(characterName(e.text));
    if (e.kind === "dialogue") dialogues++;
  }
  return {
    number: p.number,
    intExt: intExtKey(p.heading.intExt),
    time: timeKey(p.heading.time),
    speakers,
    dialogues,
    elements: p.elements.filter((e) => e.kind !== "heading").length,
  };
}

function sigOfBlocks(
  number: string | null,
  heading: SceneHeading,
  blocks: readonly ScriptBlock[],
): SceneSig {
  const speakers = new Set<string>();
  let dialogues = 0;
  for (const b of blocks) {
    if (b.kind === "character") speakers.add(characterName(b.text));
    if (b.kind === "dialogue") dialogues++;
  }
  return {
    number,
    intExt: intExtKey(heading.intExt),
    time: timeKey(heading.time),
    speakers,
    dialogues,
    elements: blocks.filter((b) => b.kind !== "heading").length,
  };
}

/** Likhet mellom to scener (0–1). Navn på karakterer er ofte like på tvers av språk. */
function sceneSimilarity(a: SceneSig, b: SceneSig): number {
  let score = 0;
  let weight = 0;
  // Scenenummer (sterkt når det finnes, men ikke alene – REQ-0334)
  if (a.number && b.number) {
    weight += 3;
    if (a.number === b.number) score += 3;
  }
  // Hvem som snakker
  if (a.speakers.size || b.speakers.size) {
    weight += 4;
    const inter = [...a.speakers].filter((x) => b.speakers.has(x)).length;
    const union = new Set([...a.speakers, ...b.speakers]).size;
    score += union ? (4 * inter) / union : 0;
  }
  // Oppbygging: antall replikker og elementer
  weight += 2;
  const ratio = (x: number, y: number) =>
    Math.max(x, y) === 0 ? 1 : Math.min(x, y) / Math.max(x, y);
  score += ratio(a.dialogues, b.dialogues) + ratio(a.elements, b.elements);
  // INT./EXT. og tid på døgnet
  if (a.intExt && b.intExt) {
    weight += 0.5;
    if (a.intExt === b.intExt) score += 0.5;
  }
  if (a.time && b.time) {
    weight += 0.5;
    if (a.time === b.time) score += 0.5;
  }
  return weight ? score / weight : 0;
}

export type LinkCertainty = "sure" | "uncertain";

/**
 * Gir hver tolket scene en midlertidig ID én gang (REQ-0037): `ps-1`, `ps-2` … etter rekkefølgen i filen.
 * Scener som allerede har ID, beholder den, så koblinger overlever at listen sorteres, filtreres eller
 * tolkes på nytt i samme import.
 */
export function identifyParsedScenes(parsed: ParsedScreenplay): ParsedScreenplay {
  if (parsed.scenes.every((p) => typeof p.id === "string")) return parsed;
  const used = new Set(parsed.scenes.map((p) => p.id).filter((x): x is string => typeof x === "string"));
  let n = 0;
  const next = () => {
    let id: string;
    do id = `ps-${++n}`;
    while (used.has(id));
    used.add(id);
    return id;
  };
  return { ...parsed, scenes: parsed.scenes.map((p) => (typeof p.id === "string" ? p : { ...p, id: next() })) };
}

/** Den importerte scenen en kobling peker på (slått opp på ID), eller undefined. */
export function parsedSceneOf(
  parsed: ParsedScreenplay,
  link: { readonly parsedId?: string; readonly parsedIndex?: number },
): ParsedScene | undefined {
  // Et manus som ikke er identifisert ennå, får de samme ID-ene som alignTranslation gir det
  const doc = identifyParsedScenes(parsed);
  // Eldre kobling uten ID (bare plass): plassen oversettes én gang til scenens ID, deretter slås ID-en opp
  const id =
    link.parsedId ??
    (typeof link.parsedIndex === "number" ? doc.scenes[link.parsedIndex]?.id : undefined);
  return id === undefined ? undefined : doc.scenes.find((p) => p.id === id);
}

export interface LinePair {
  readonly blockId: string;
  readonly text: string;
}

export interface SceneLink {
  /** Den importerte scenen: midlertidig ID fra tolkingen (REQ-0037). Identiteten i importen. */
  readonly parsedId: string;
  /** Plassen i det importerte manuset (bare til visning og som etikett i én AI-forespørsel, aldri nøkkel). */
  readonly parsedIndex: number;
  readonly parsedHeading: string;
  readonly parsedNumber: string | null;
  /** Den norske scenen (forekomst) – null når ingen passer. */
  readonly occurrenceId: string | null;
  readonly similarity: number;
  readonly certainty: LinkCertainty;
  readonly lines: readonly LinePair[];
  /** Importerte linjer som ikke fikk en norsk linje. */
  readonly unmatched: number;
}

/** Terskler for kobling: sikker over SURE, usikker mellom MIN og SURE. */
const SURE = 0.62;
const MIN = 0.3;

/**
 * Koble et importert (oversatt) manus til produksjonens scener: rekkefølgen bevares (en scene kan mangle i
 * det ene manuset), og scenene parres der de ligner mest.
 */
export function alignTranslation(
  s: ProjectState,
  productionId: string,
  input: ParsedScreenplay,
): SceneLink[] {
  // Koblingene peker på scenenes ID; gi dem ID nå hvis kallet ikke har gjort det (samme ID-er som i dialogen)
  const parsed = identifyParsedScenes(input);
  const occs = orderedOccurrences(s, productionId).filter(isScriptOccurrence);
  const P = parsed.scenes.filter((p) => !p.isContinuation || p.elements.length);
  const pSig = P.map(sigOfParsed);
  const nSig = occs.map((o) =>
    sigOfBlocks(
      o.productionNumber,
      s.variants[o.variantId]!.heading,
      blocksOfVariant(s, o.variantId),
    ),
  );
  // Sekvensjustering (Needleman–Wunsch) med «hopp over» for scener som bare finnes i det ene manuset
  const n = P.length;
  const m = occs.length;
  const GAP = -0.15;
  const score: Float64Array[] = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const move: Uint8Array[] = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
  for (let i = 1; i <= n; i++) {
    score[i]![0] = i * GAP;
    move[i]![0] = 1;
  }
  for (let j = 1; j <= m; j++) {
    score[0]![j] = j * GAP;
    move[0]![j] = 2;
  }
  const sim = (i: number, j: number) => sceneSimilarity(pSig[i]!, nSig[j]!);
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) {
      const d = score[i - 1]![j - 1]! + (sim(i - 1, j - 1) - MIN);
      const u = score[i - 1]![j]! + GAP;
      const l = score[i]![j - 1]! + GAP;
      if (d >= u && d >= l) {
        score[i]![j] = d;
        move[i]![j] = 0;
      } else if (u >= l) {
        score[i]![j] = u;
        move[i]![j] = 1;
      } else {
        score[i]![j] = l;
        move[i]![j] = 2;
      }
    }
  const pairs: (number | null)[] = new Array(n).fill(null);
  for (let i = n, j = m; i > 0 || j > 0;) {
    const mv = move[i]![j]!;
    if (i > 0 && j > 0 && mv === 0) {
      pairs[i - 1] = j - 1;
      i--;
      j--;
    } else if (i > 0 && (j === 0 || mv === 1)) i--;
    else j--;
  }
  return P.map((p, i) => {
    const j = pairs[i];
    const similarity = j === null || j === undefined ? 0 : sim(i, j);
    const occ = j === null || j === undefined || similarity < MIN ? null : occs[j]!;
    const { lines, unmatched } = occ
      ? alignLines(p, blocksOfVariant(s, occ.variantId))
      : { lines: [], unmatched: p.elements.length };
    return {
      parsedId: p.id!,
      parsedIndex: parsed.scenes.indexOf(p),
      parsedHeading: p.rawHeading || formatHeading(p.heading),
      parsedNumber: p.number,
      occurrenceId: occ?.id ?? null,
      similarity,
      certainty: similarity >= SURE ? "sure" : "uncertain",
      lines,
      unmatched,
    };
  });
}

/** Koble linjene i en scene: samme type, og samme navn for karakterlinjer. */
export function alignLines(
  p: ParsedScene,
  blocks: readonly ScriptBlock[],
): { lines: LinePair[]; unmatched: number; unpaired: UnpairedLine[] } {
  const E = p.elements.filter((e) => e.kind !== "heading" && e.text.trim());
  const B = blocks.filter((b) => b.kind !== "heading");
  const n = E.length;
  const m = B.length;
  const GAP = -0.4;
  const sim = (i: number, j: number) => {
    const e = E[i]!;
    const b = B[j]!;
    if (e.kind !== b.kind) {
      // Handling og overgang/bilde kan være tolket ulikt; replikk mot karakter aldri
      const loose = new Set(["action", "shot", "transition", "note"]);
      return loose.has(e.kind) && loose.has(b.kind) ? 0.1 : -1;
    }
    if (e.kind === "character") return characterName(e.text) === characterName(b.text) ? 1.5 : 0.2;
    const r =
      Math.min(e.text.length, b.text.length) / Math.max(1, Math.max(e.text.length, b.text.length));
    return 0.6 + 0.4 * r;
  };
  const score: Float64Array[] = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const move: Uint8Array[] = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
  for (let i = 1; i <= n; i++) {
    score[i]![0] = i * GAP;
    move[i]![0] = 1;
  }
  for (let j = 1; j <= m; j++) {
    score[0]![j] = j * GAP;
    move[0]![j] = 2;
  }
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) {
      const d = score[i - 1]![j - 1]! + sim(i - 1, j - 1);
      const u = score[i - 1]![j]! + GAP;
      const l = score[i]![j - 1]! + GAP;
      if (d >= u && d >= l) {
        score[i]![j] = d;
        move[i]![j] = 0;
      } else if (u >= l) {
        score[i]![j] = u;
        move[i]![j] = 1;
      } else {
        score[i]![j] = l;
        move[i]![j] = 2;
      }
    }
  const lines: LinePair[] = [];
  const unpaired: UnpairedLine[] = [];
  let unmatched = 0;
  const keep = (i: number) => unpaired.push({ ord: i, kind: E[i]!.kind, text: E[i]!.text });
  for (let i = n, j = m; i > 0 || j > 0;) {
    const mv = move[i]![j]!;
    if (i > 0 && j > 0 && mv === 0) {
      if (sim(i - 1, j - 1) > 0) lines.push({ blockId: B[j - 1]!.id, text: E[i - 1]!.text });
      else {
        unmatched++;
        keep(i - 1);
      }
      i--;
      j--;
    } else if (i > 0 && (j === 0 || mv === 1)) {
      unmatched++;
      keep(i - 1);
      i--;
    } else j--;
  }
  return { lines: lines.reverse(), unmatched, unpaired: unpaired.reverse() };
}

/** B-050: an imported line the rules could not pair; kept so AI or the user can link it later. */
export interface UnpairedLine {
  readonly ord: number;
  readonly kind: string;
  readonly text: string;
}

/**
 * B-050: imported lines without a rule pair for the linked scenes, as fields for AddTranslationLines.
 * Older unpaired lines of the same scenes and language are listed for retirement (never hard-deleted).
 */
export function unpairedTranslationLines(
  s: ProjectState,
  lang: string,
  links: readonly { readonly link: SceneLink }[],
  parsed: ParsedScreenplay,
): { items: { variantId: string; language: string; ord: number; kind: string; text: string }[]; retire: string[] } {
  const items: { variantId: string; language: string; ord: number; kind: string; text: string }[] = [];
  const variants = new Set<string>();
  for (const { link } of links) {
    const o = link.occurrenceId ? s.occurrences[link.occurrenceId] : undefined;
    const p = parsedSceneOf(parsed, link);
    if (!o || !p || variants.has(o.variantId)) continue;
    variants.add(o.variantId);
    for (const u of alignLines(p, blocksOfVariant(s, o.variantId)).unpaired)
      if (u.text.trim()) items.push({ variantId: o.variantId, language: lang, ord: u.ord, kind: u.kind.slice(0, 30), text: u.text.slice(0, 5000) });
  }
  const retire = Object.values(s.translationLines ?? {})
    .filter((u) => !u.removed && u.language === lang && variants.has(u.variantId))
    .map((u) => u.id);
  return { items, retire };
}

export interface TranslationItem {
  readonly existingId: string | null;
  readonly blockId: string | null;
  readonly variantId: string | null;
  readonly text: string;
  readonly basedOnRev: number;
  readonly status: "approved" | "uncertain";
}

/**
 * Oversettelsene som skal lagres for de valgte koblingene: linjene og scenehodet. Koblinger brukeren har
 * godkjent, lagres som godkjent; ellers som usikre (REQ-0335). Eksisterende oversettelser oppdateres.
 */
export function translationItems(
  s: ProjectState,
  lang: string,
  links: readonly { readonly link: SceneLink; readonly approved: boolean }[],
  parsed: ParsedScreenplay,
): TranslationItem[] {
  const out: TranslationItem[] = [];
  const seen = new Set<string>();
  for (const { link, approved } of links) {
    if (!link.occurrenceId) continue;
    const o = s.occurrences[link.occurrenceId];
    if (!o) continue;
    const status = approved ? "approved" : "uncertain";
    const p = parsedSceneOf(parsed, link);
    // En oversettelse brukeren har godkjent, overskrives bare av en godkjent kobling
    const keep = (existing: Translation | null) =>
      !!existing && existing.status === "approved" && !approved;
    if (p && !seen.has(o.variantId)) {
      seen.add(o.variantId);
      let heading = (p.rawHeading || formatHeading(p.heading)).trim();
      // Scenenummeret i margen (bare nøyaktig det, ikke tall i stedsnavnet)
      if (p.number) {
        const n = p.number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        heading = heading.replace(new RegExp(`^${n}\\s+`), "").replace(new RegExp(`\\s+${n}$`), "");
      }
      const existing = translationOf(s, o.variantId, lang);
      if (heading.trim() && !keep(existing))
        out.push({
          existingId: existing?.id ?? null,
          blockId: null,
          variantId: o.variantId,
          text: heading.trim(),
          basedOnRev: s.variants[o.variantId]!.revision,
          status,
        });
    }
    for (const l of link.lines) {
      if (seen.has(l.blockId)) continue;
      seen.add(l.blockId);
      const b = s.blocks[l.blockId];
      if (!b || !l.text.trim()) continue;
      const existing = translationOf(s, b.id, lang);
      if (keep(existing)) continue;
      out.push({
        existingId: existing?.id ?? null,
        blockId: b.id,
        variantId: null,
        text: l.text,
        basedOnRev: b.currentRev,
        status,
      });
    }
  }
  return out;
}

// ---------- Undertekster (REQ-0351) ----------

export interface SubtitleCue {
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

function stamp(ms: number, sep: "," | "."): string {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3600000);
  const m = Math.floor((t % 3600000) / 60000);
  const s = Math.floor((t % 60000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(t % 1000, 3)}`;
}

/** Underteksten som vises på tidspunktet (ms i filmen), eller null. Undertekstene er sortert etter start. */
export function cueAt(cues: readonly SubtitleCue[], ms: number): SubtitleCue | null {
  let lo = 0;
  let hi = cues.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid]!.startMs <= ms) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  // Overlappende undertekster: den siste som har startet og ikke sluttet
  for (let i = found; i >= 0 && i > found - 4; i--) {
    const c = cues[i]!;
    if (ms < c.endMs) return c;
  }
  return null;
}

/** Undertekster i SubRip-format (.srt). */
export function toSrt(cues: readonly SubtitleCue[]): string {
  return cues
    .map((c, i) => `${i + 1}\n${stamp(c.startMs, ",")} --> ${stamp(c.endMs, ",")}\n${c.text}\n`)
    .join("\n");
}

/** Undertekster i WebVTT-format (.vtt). Tegn med egen betydning i WebVTT skrives som tegnreferanser. */
export function toVtt(cues: readonly SubtitleCue[]): string {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return (
    "WEBVTT\n\n" +
    cues
      .map((c) => `${stamp(c.startMs, ".")} --> ${stamp(c.endMs, ".")}\n${esc(c.text)}\n`)
      .join("\n")
  );
}

/** Del en lang replikk i linjer på høyst `max` tegn (to linjer per undertekst er vanlig). */
export function wrapSubtitle(text: string, max = 42): string {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur + " " + w).length > max) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines.join("\n");
}

/**
 * Undertekstene for en produksjon på et språk: replikkene med tiden de har i filmen (koblet lyd eller
 * fordelt etter tekstmengde). Replikker uten oversettelse tas ikke med (de telles i `missing`).
 */
export function subtitleCues(
  s: ProjectState,
  productionId: string,
  lang: string,
): { cues: SubtitleCue[]; missing: number } {
  const fps = s.project.fps;
  const ms = (f: number) => Math.round(framesToSeconds(f, fps) * 1000);
  const cues: SubtitleCue[] = [];
  let missing = 0;
  for (const clip of filmClips(s, productionId)) {
    for (const sp of blockSpans(s, clip)) {
      const b = s.blocks[sp.blockId];
      if (!b || b.kind !== "dialogue" || !b.text.trim()) continue;
      // Replikker som ikke er med i filmen (kuttet bort, eller tid utenfor klippet)
      if (sp.uncovered || sp.endFrame <= sp.startFrame) continue;
      const text = lang === "nb" ? b.text : translationOf(s, b.id, lang)?.text;
      if (!text?.trim()) {
        missing++;
        continue;
      }
      const start = ms(sp.startFrame);
      const end = Math.max(start + 700, ms(sp.endFrame));
      // Høyst to linjer per undertekst: lengre replikker deles i flere, med tiden fordelt etter tekst
      const lines = wrapSubtitle(text).split("\n");
      const parts: string[] = [];
      for (let i = 0; i < lines.length; i += 2) parts.push(lines.slice(i, i + 2).join("\n"));
      const total = parts.reduce((n, x) => n + x.length, 0) || 1;
      let at = start;
      parts.forEach((x, i) => {
        const to =
          i === parts.length - 1 ? end : at + Math.round(((end - start) * x.length) / total);
        cues.push({ startMs: at, endMs: to, text: x });
        at = to;
      });
    }
  }
  cues.sort((a, b) => a.startMs - b.startMs);
  // Ingen overlapp: en undertekst slutter når den neste begynner
  const out = cues
    .map((c, i) => {
      const next = cues[i + 1];
      return next && c.endMs > next.startMs ? { ...c, endMs: next.startMs } : c;
    })
    // For korte til å kunne leses (etter overlapp) tas ikke med
    .filter((c) => c.endMs - c.startMs >= 300);
  return { cues: out, missing };
}
