/**
 * Forslag til ressursbiblioteket fra manuset (REQ-0128, DEC-0034).
 * Gratis, regelbasert gjenkjenning – ingen AI. Alt er forslag; ingenting legges til før brukeren velger det.
 *
 * 1. Karakterer: replikknavn ryddes («MARTIN 9» → MARTIN, «LAURITS OG ROLF» → to karakterer,
 *    «MALIN TIL MAJA» → MALIN, «OLA SMILENDE» → OLA) og stavevarianter slås sammen («LAURIT» → LAURITS).
 * 2. Navngitte ting uten replikk: ord med stor forbokstav midt i en setning i handlingen («Svarten»).
 * 3. Lokasjoner: «PÅ TUNET» og «GÅRD, TUNET» slås sammen med «TUNET».
 * 4. Objekter/rekvisitter: substantiv som går igjen i handlingen i flere scener («en sekk» … «sekken»).
 * 5. Hvert forslag viser hvor det kommer fra (scener og skrivemåter), og usikre forslag merkes.
 * Skrivemåtene som slås sammen, blir alternative navn når forslaget legges til, så bruken i manuset finnes.
 */
import type { Asset, AssetKind, ProjectState } from "../model";
import { blocksOfVariant, orderedOccurrences } from "../views";
import { characterName, sceneMentions } from "../screenplay/filter";

export type SuggestionReason = "speaker" | "named" | "heading" | "object";

export type SourceNote =
  | "number" // «MARTIN 9»
  | "group" // «LAURITS OG ROLF»
  | "addressed" // «MALIN TIL MAJA»
  | "descriptor" // «OLA SMILENDE»
  | "typo" // «LAURIT»
  | "preposition" // «PÅ TUNET»
  | "compound" // «GÅRD, TUNET»
  | "form"; // «KJØKKENET» / «KJØKKEN»

export const SOURCE_NOTE_LABEL: Record<SourceNote, string> = {
  number: "med tall",
  group: "flere som snakker samtidig",
  addressed: "snakker til noen",
  descriptor: "med beskrivelse",
  typo: "mulig skrivefeil",
  preposition: "med preposisjon",
  compound: "del av et sammensatt sted",
  form: "annen bøyning",
};

export const REASON_LABEL: Record<SuggestionReason, string> = {
  speaker: "har replikk",
  named: "nevnes med navn i handlingen",
  heading: "sted i sceneoverskriften",
  object: "går igjen i handlingen",
};

export interface SuggestionSource {
  /** Skrivemåten slik den står i manuset. */
  readonly name: string;
  readonly scenes: number;
  readonly note: SourceNote;
}

export interface LibrarySuggestion {
  readonly kind: AssetKind;
  /** Navnet slik det står i manuset (karakterer og steder med store bokstaver, objekter i grunnform). */
  readonly name: string;
  /** Antall scener der forslaget opptrer (alle skrivemåter samlet). */
  readonly scenes: number;
  /** Mulig samme som en eksisterende ressurs (usikker kobling – brukeren avgjør). */
  readonly possibleMatch: { readonly assetId: string; readonly assetName: string } | null;
  readonly reason: SuggestionReason;
  /** Andre skrivemåter som er slått sammen hit. Blir alternative navn når forslaget legges til. */
  readonly sources: readonly SuggestionSource[];
  /** Usikkert forslag (gjetning) – vises dempet og er ikke valgt på forhånd. */
  readonly uncertain: boolean;
  /** Typen er en gjetning (navngitte ting kan være karakter, dyr eller objekt). */
  readonly kindUncertain: boolean;
  /** Scenenumre der forslaget finnes (de første seks), som bevis. */
  readonly sceneNumbers: readonly string[];
}

// ---------- Hjelpere ----------

const WORD = /[\p{L}\p{N}]+/gu;

/** Avstand mellom to ord (antall tegn som må endres), for å finne mulige stavevarianter. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

/** Ligner navnet på et eksisterende navn? (inneholder det som eget ord, eller nesten lik stavemåte) */
export function similarName(candidate: string, existing: string): boolean {
  if (!candidate || !existing) return false;
  const words = (x: string) => x.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3);
  const cw = words(candidate);
  const ew = words(existing);
  if (cw.some((w) => ew.includes(w))) return true;
  if (Math.min(candidate.length, existing.length) >= 4) {
    const limit = Math.min(candidate.length, existing.length) >= 7 ? 2 : 1;
    return editDistance(candidate, existing) <= limit;
  }
  return false;
}

const upper = (s: string) => s.toLocaleUpperCase("nb");
const lower = (s: string) => s.toLocaleLowerCase("nb");

function assetKeys(a: Pick<Asset, "name" | "names">): string[] {
  return [a.name, ...a.names.map((n) => n.name)].map(characterName).filter(Boolean);
}

/** Tallet i «MARTIN 9», «MAJA 12A» – scenenummer eller lignende som har havnet i replikknavnet. */
const TRAILING_NUMBER = /\s+\d+[A-ZÆØÅ]?$/u;
const LEADING_NUMBER = /^\d+[A-ZÆØÅ]?\s+/u;
/** Ord som beskriver hvordan noen snakker, ikke hvem («OLA SMILENDE», «MAJA HVISKER»). */
const DESCRIPTORS = new Set([
  "HVISKER",
  "HVISKENDE",
  "ROPER",
  "SINT",
  "GLAD",
  "TRIST",
  "REDD",
  "LAVT",
  "HØYT",
  "STILLE",
  "FORTSATT",
  "IGJEN",
  "FORTS",
  "CONT'D",
  "CONTD",
  "OFF",
]);

export interface CleanedSpeaker {
  readonly names: readonly string[];
  readonly note: SourceNote | null;
}

/** Rydder et replikknavn: fjerner tall og beskrivelser, deler grupper og «X TIL Y». */
export function cleanSpeaker(raw: string): CleanedSpeaker {
  let name = characterName(raw);
  let note: SourceNote | null = null;
  if (TRAILING_NUMBER.test(name) || LEADING_NUMBER.test(name)) {
    name = name.replace(TRAILING_NUMBER, "").replace(LEADING_NUMBER, "").trim();
    note = "number";
  }
  const til = name.split(/\s+TIL\s+/u);
  if (til.length === 2 && til[0] && til[1]) {
    name = til[0].trim();
    note = "addressed";
  }
  const group = name
    .split(/\s+(?:OG|&|\+)\s+|\s*\/\s*|\s*,\s*/u)
    .map((x) => x.trim())
    .filter(Boolean);
  if (group.length > 1) {
    return { names: group.map((g) => stripDescriptor(g).name), note: "group" };
  }
  const d = stripDescriptor(name);
  return { names: [d.name], note: d.stripped ? "descriptor" : note };
}

function stripDescriptor(name: string): { name: string; stripped: boolean } {
  const words = name.split(/\s+/u);
  if (words.length < 2) return { name, stripped: false };
  const last = words[words.length - 1]!;
  if (DESCRIPTORS.has(last) || (last.length >= 6 && last.endsWith("ENDE"))) {
    return { name: words.slice(0, -1).join(" "), stripped: true };
  }
  return { name, stripped: false };
}

/** Preposisjoner foran et sted: «PÅ TUNET» er samme sted som «TUNET». */
const LOCATION_PREFIX = /^(?:INNE I|UTE PÅ|OPPE PÅ|NEDE I|OPPE I|NEDE PÅ|INNI|PÅ|I|VED)\s+/u;

export function cleanLocation(raw: string): { name: string; note: SourceNote | null } {
  const name = upper(raw.replace(/\s+/g, " ").trim());
  const stripped = name.replace(LOCATION_PREFIX, "");
  if (stripped !== name && stripped) return { name: stripped, note: "preposition" };
  return { name, note: null };
}

// ---------- Ordlister for navngitte ting og objekter ----------

/** Ord med stor forbokstav som ikke er navn på ting i filmen. */
const NAMED_STOP = new Set(
  [
    "jeg",
    "du",
    "han",
    "hun",
    "vi",
    "de",
    "den",
    "det",
    "dette",
    "der",
    "her",
    "og",
    "men",
    "så",
    "da",
    "når",
    "hvis",
    "gud",
    "herre",
    "jul",
    "julaften",
    "nyttår",
    "påske",
    "mandag",
    "tirsdag",
    "onsdag",
    "torsdag",
    "fredag",
    "lørdag",
    "søndag",
    "januar",
    "februar",
    "mars",
    "april",
    "mai",
    "juni",
    "juli",
    "august",
    "september",
    "oktober",
    "november",
    "desember",
    "norge",
    "ok",
    "int",
    "ext",
    "dag",
    "natt",
    "kveld",
    "morgen",
    "cont",
    "forts",
  ].map(upper),
);

/** Ord som kan stå etter «en/ei/et» uten å være en ting man kan vise (adjektiv, mengde, tid, abstrakt). */
const OBJECT_STOP = new Set([
  "liten",
  "lita",
  "lite",
  "stor",
  "stort",
  "gammel",
  "gammelt",
  "ny",
  "nytt",
  "god",
  "godt",
  "lang",
  "langt",
  "kort",
  "annen",
  "anna",
  "annet",
  "hel",
  "helt",
  "slik",
  "slikt",
  "sånn",
  "sånt",
  "eneste",
  "par",
  "del",
  "gang",
  "stund",
  "øyeblikk",
  "sekund",
  "minutt",
  "time",
  "dag",
  "natt",
  "kveld",
  "morgen",
  "uke",
  "år",
  "lyd",
  "smil",
  "blikk",
  "pust",
  "pause",
  "rop",
  "skrik",
  "latter",
  "tanke",
  "følelse",
  "bevegelse",
  "slags",
  "mengde",
  "rekke",
  "måte",
  "grunn",
  "ting",
  "sted",
  "side",
  "bit",
  "stykke",
  "hånd",
  "fot",
  "hode",
  "ansikt",
  "øye",
  "munn",
  "kropp",
  "mann",
  "kvinne",
  "dame",
  "gutt",
  "jente",
  "barn",
  "menneske",
  "person",
  "fyr",
  "kjempe",
  "veldig",
  "nesten",
  "bare",
  "også",
  "ganske",
  "svært",
  "mørk",
  "mørkt",
  "lys",
  "lyst",
  "kald",
  "kaldt",
  "varm",
  "varmt",
  "rød",
  "rødt",
  "hvit",
  "hvitt",
  "svart",
  "blå",
  "blått",
  "grønn",
  "grønt",
  "gul",
  "gult",
  "brun",
  "brunt",
  "grå",
  "tung",
  "tungt",
  "lett",
  "rar",
  "rart",
  "fin",
  "fint",
  "pen",
  "pent",
  "trist",
  "glad",
  "sint",
  "redd",
  "plutselig",
  "stille",
  "høy",
  "høyt",
  "lav",
  "lavt",
  "vill",
  "vilt",
]);

/** Småord som aldri er ting (preposisjoner, pronomen, adverb, tall, vanlige verb). */
const FUNCTION_WORDS = new Set(
  (
    "med til fra inn ut opp ned før etter der her litt mer flere bort bak ved som hun han de den det dem " +
    "seg sin si sitt sine hans hennes deres får fikk er var blir ble har hadde kan kunne skal skulle vil " +
    "ville må måtte ikke også så og eller men i på av for om mot over under gjennom mellom rundt fast " +
    "ferdig sakte en ei et to tre fire fem seks sju syv åtte ni ti hele mange noen ingen alle alt andre " +
    "hver mens når da nå enda igjen bare like rett fram frem hjem hjemme borte inne ute oppe nede videre " +
    "tilbake sammen alene langs mot nok jo vel tar tok går gikk ser så kommer kom står sto sitter satt " +
    "ligger lå sier sa gjør gjorde holder holdt øyn hod hend hånd arm kinn hår hjert hjerte skritt " +
    "mor far bror søster lillebror storebror lillesøster bestemor bestefar onkel tante reise nikk svar " +
    "siste små bekymret lei drag retning plass fange feste spark skikkelig tett vakkert vakker vennlig " +
    "ekstra ekstr rygg steg hull"
  ).split(" "),
);

const ARTICLES = new Set(["en", "ei", "et"]);
const POSTPOSED = new Set(["sin", "si", "sitt", "sine", "hans", "hennes", "deres"]);

/** Bøyningsformer av et substantiv i ubestemt form: sekk → sekken, sekker, sekkene … */
function nounForms(w: string): string[] {
  const forms = [w, `${w}en`, `${w}et`, `${w}a`, `${w}er`, `${w}ene`, `${w}ane`];
  if (w.endsWith("e")) {
    const s = w.slice(0, -1);
    forms.push(`${w}n`, `${w}t`, `${s}a`, `${w}r`, `${w}ne`);
  }
  return forms;
}

/** Ubestemt form av et ord i bestemt form («sekken» → «sekk», «lykta» → «lykt»), om det ser slik ut. */
function indefinite(w: string): string | null {
  for (const suf of ["ene", "ane", "en", "et", "a"]) {
    if (w.length > suf.length + 2 && w.endsWith(suf)) return w.slice(0, -suf.length);
  }
  return null;
}

// ---------- Selve forslagene ----------

interface Scene {
  readonly variantId: string;
  readonly number: string;
  /** Rå replikknavn i scenen. */
  readonly rawSpeakers: ReadonlySet<string>;
  /** Handlingstekst (uten overskrift og replikker). */
  readonly action: string;
  readonly location: string;
}

function scenesOf(s: ProjectState, productionId: string): Scene[] {
  return orderedOccurrences(s, productionId).map((o) => {
    const rawSpeakers = new Set<string>();
    const parts: string[] = [];
    for (const b of blocksOfVariant(s, o.variantId)) {
      if (b.kind === "character") {
        const n = characterName(b.text);
        if (n) rawSpeakers.add(n);
      } else if (b.kind === "action" || b.kind === "shot") parts.push(b.text);
    }
    return {
      variantId: o.variantId,
      number: o.productionNumber ?? "",
      rawSpeakers,
      action: parts.join("\n"),
      location: s.variants[o.variantId]?.heading.location ?? "",
    };
  });
}

/** Samler scener per navn (indeks i scenelisten) og skrivemåtene som førte dit. */
class Tally {
  readonly scenes = new Map<string, Set<number>>();
  readonly sources = new Map<string, Map<string, { scenes: Set<number>; note: SourceNote }>>();
  add(name: string, scene: number, raw?: string, note?: SourceNote | null): void {
    if (!name) return;
    let set = this.scenes.get(name);
    if (!set) this.scenes.set(name, (set = new Set()));
    set.add(scene);
    if (raw && note && raw !== name) {
      let m = this.sources.get(name);
      if (!m) this.sources.set(name, (m = new Map()));
      let src = m.get(raw);
      if (!src) m.set(raw, (src = { scenes: new Set(), note }));
      src.scenes.add(scene);
    }
  }
  /** Slår navnet `from` sammen inn i `into` (som skrivefeil e.l.). */
  merge(from: string, into: string, note: SourceNote): void {
    const fromScenes = this.scenes.get(from);
    if (!fromScenes) return;
    for (const i of fromScenes) this.add(into, i, from, note);
    for (const [raw, src] of this.sources.get(from) ?? [])
      for (const i of src.scenes) this.add(into, i, raw, src.note);
    this.scenes.delete(from);
    this.sources.delete(from);
  }
  sourcesOf(name: string): SuggestionSource[] {
    return [...(this.sources.get(name) ?? [])]
      .map(([n, src]) => ({ name: n, scenes: src.scenes.size, note: src.note }))
      .sort((a, b) => b.scenes - a.scenes || a.name.localeCompare(b.name, "nb"));
  }
}

function numbersOf(scenes: readonly Scene[], idx: ReadonlySet<number>): string[] {
  return [...idx]
    .sort((a, b) => a - b)
    .slice(0, 6)
    .map((i) => scenes[i]!.number || "uten nr.");
}

function findSimilar(
  key: string,
  assets: readonly Asset[],
): { assetId: string; assetName: string } | null {
  // Den mest like ressursen (likt navn, ellers minst stavavstand); stabil rekkefølge ved likhet
  let best: { a: Asset; score: number } | null = null;
  for (const a of [...assets].sort((x, y) => x.id.localeCompare(y.id)))
    for (const n of assetKeys(a)) {
      if (!similarName(key, n)) continue;
      const score = n === key ? -1 : editDistance(key, n);
      if (!best || score < best.score) best = { a, score };
    }
  return best ? { assetId: best.a.id, assetName: best.a.name } : null;
}

/** Slår sammen sjeldne navn som nesten staves likt som et hyppigere navn («LAURIT» → «LAURITS»). */
function mergeTypos(t: Tally, known: ReadonlySet<string>, minLength = 4): void {
  const names = [...t.scenes.keys()].sort(
    (a, b) => t.scenes.get(b)!.size - t.scenes.get(a)!.size || a.localeCompare(b, "nb"),
  );
  for (let i = names.length - 1; i >= 0; i--) {
    const n = names[i]!;
    if (known.has(n) || n.length < minLength) continue;
    const size = t.scenes.get(n)?.size ?? 0;
    // Bare sjeldne skrivemåter (én scene): KARL i to scener er trolig en annen person enn KARI
    if (size !== 1) continue;
    const target = names.find(
      (m) =>
        m !== n &&
        !known.has(m) && // finnes allerede i biblioteket: vises som mulig treff i stedet
        t.scenes.has(m) &&
        (t.scenes.get(m)!.size >= 2 * size || t.scenes.get(m)!.size > size + 1) &&
        Math.min(m.length, n.length) >= minLength &&
        editDistance(m, n) === 1,
    );
    if (target) t.merge(n, target, "typo");
  }
}

function characterSuggestions(
  s: ProjectState,
  scenes: readonly Scene[],
  all: readonly Asset[],
): LibrarySuggestion[] {
  const t = new Tally();
  scenes.forEach((sc, i) => {
    for (const raw of sc.rawSpeakers) {
      const c = cleanSpeaker(raw);
      for (const n of c.names) t.add(n, i, raw, c.note);
    }
  });
  // Nevnt med navn (stor forbokstav) i scener uten replikk teller også
  for (const name of [...t.scenes.keys()])
    scenes.forEach((sc, i) => {
      if (!t.scenes.get(name)!.has(i) && sceneMentions(s, sc.variantId, name)) t.add(name, i);
    });
  const knownKeys = new Set(all.filter((a) => a.kind === "character").flatMap(assetKeys));
  mergeTypos(t, knownKeys);
  const charAssets = all.filter((a) => a.kind === "character" && !a.archived);
  const out: LibrarySuggestion[] = [];
  for (const [name, idx] of t.scenes) {
    if (knownKeys.has(name)) continue;
    const sources = t.sourcesOf(name).filter((x) => !knownKeys.has(x.name));
    out.push({
      kind: "character",
      name,
      scenes: idx.size,
      possibleMatch: findSimilar(name, charAssets),
      reason: "speaker",
      sources,
      // Bare én scene: kan være en lyd eller feiltolket linje («DYNAMITT»).
      // Sammenslått skrivefeil: brukeren må bekrefte at det er samme person.
      uncertain: idx.size === 1 || sources.some((x) => x.note === "typo"),
      kindUncertain: false,
      sceneNumbers: numbersOf(scenes, idx),
    });
  }
  return out;
}

/** Ord med stor forbokstav midt i en setning («… og Svarten løper»). */
function namedSuggestions(
  scenes: readonly Scene[],
  all: readonly Asset[],
  speakerWords: ReadonlySet<string>,
  locationWords: ReadonlySet<string>,
): LibrarySuggestion[] {
  const anywhere = new Map<string, Set<number>>();
  const midSentence = new Map<string, number>();
  const display = new Map<string, string>();
  scenes.forEach((sc, i) => {
    for (const m of sc.action.matchAll(WORD)) {
      const w = m[0];
      if (w.length < 3 || !/^\p{Lu}\p{Ll}+$/u.test(w)) continue;
      const key = upper(w);
      if (NAMED_STOP.has(key) || speakerWords.has(key) || locationWords.has(key)) continue;
      // Eieform av et kjent navn («Majas») er samme navn
      if (key.endsWith("S") && speakerWords.has(key.slice(0, -1))) continue;
      const before = sc.action.slice(0, m.index).trimEnd();
      const sentenceStart = before === "" || /[.!?:;»«"“”'‘’()…—–\-\n]$/u.test(before);
      if (!sentenceStart) midSentence.set(key, (midSentence.get(key) ?? 0) + 1);
      let set = anywhere.get(key);
      if (!set) anywhere.set(key, (set = new Set()));
      set.add(i);
      if (!display.has(key)) display.set(key, w);
    }
  });
  const knownKeys = new Set(all.flatMap(assetKeys));
  const assets = all.filter((a) => !a.archived);
  const out: LibrarySuggestion[] = [];
  for (const [key, idx] of anywhere) {
    // Minst to ganger midt i en setning og i minst to scener
    if ((midSentence.get(key) ?? 0) < 2 || idx.size < 2 || knownKeys.has(key)) continue;
    out.push({
      kind: "character",
      name: display.get(key)!,
      scenes: idx.size,
      possibleMatch: findSimilar(key, assets),
      reason: "named",
      sources: [],
      uncertain: true,
      kindUncertain: true,
      sceneNumbers: numbersOf(scenes, idx),
    });
  }
  return out.sort((a, b) => b.scenes - a.scenes || a.name.localeCompare(b.name, "nb"));
}

function locationSuggestions(scenes: readonly Scene[], all: readonly Asset[]): LibrarySuggestion[] {
  const t = new Tally();
  scenes.forEach((sc, i) => {
    if (!sc.location.trim()) return;
    const raw = upper(sc.location.replace(/\s+/g, " ").trim());
    const c = cleanLocation(sc.location);
    t.add(c.name, i, raw, c.note);
  });
  // «GÅRD, TUNET» → «TUNET» når «TUNET» finnes alene og alle sammensetninger med TUNET har samme første del
  const names = [...t.scenes.keys()];
  const standalone = new Set(names.filter((n) => !n.includes(",")));
  const byLast = new Map<string, string[]>();
  for (const n of names) {
    const parts = n.split(/\s*,\s*/u);
    if (parts.length < 2) continue;
    const last = parts[parts.length - 1]!;
    byLast.set(last, [...(byLast.get(last) ?? []), parts.slice(0, -1).join(", ")]);
  }
  for (const [last, firsts] of byLast) {
    if (!standalone.has(last) || new Set(firsts).size !== 1) continue;
    t.merge(`${firsts[0]}, ${last}`, last, "compound");
  }
  // «KJØKKENET» og «KJØKKEN», «GARDSTUN» og «GARDSTUNET»: samme sted i annen bøyning
  for (const n of [...t.scenes.keys()])
    for (const suf of ["ET", "EN", "A", "ENE"]) {
      const other = n + suf;
      if (!t.scenes.has(n) || !t.scenes.has(other)) continue;
      const [from, into] =
        t.scenes.get(other)!.size > t.scenes.get(n)!.size ? [n, other] : [other, n];
      t.merge(from, into, "form");
    }
  const knownLoc = new Set(all.filter((a) => a.kind === "location").flatMap(assetKeys));
  mergeTypos(t, knownLoc, 6);
  const knownKeys = knownLoc;
  const locAssets = all.filter((a) => a.kind === "location" && !a.archived);
  const out: LibrarySuggestion[] = [];
  for (const [name, idx] of t.scenes) {
    if (knownKeys.has(name)) continue;
    out.push({
      kind: "location",
      name,
      scenes: idx.size,
      possibleMatch: findSimilar(name, locAssets),
      reason: "heading",
      sources: t.sourcesOf(name).filter((x) => !knownKeys.has(x.name)),
      uncertain: false,
      kindUncertain: false,
      sceneNumbers: numbersOf(scenes, idx),
    });
  }
  return out.sort((a, b) => b.scenes - a.scenes || a.name.localeCompare(b.name, "nb"));
}

/** Minste antall scener et objekt må finnes i for å bli foreslått. */
export const OBJECT_MIN_SCENES = 3;
const OBJECT_MAX = 40;

function objectSuggestions(
  scenes: readonly Scene[],
  all: readonly Asset[],
  nameWords: ReadonlySet<string>,
): LibrarySuggestion[] {
  /** Ikke småord, ikke adjektiv/abstrakt, og ikke et navn («maja» → «maj»). */
  const ok = (w: string) =>
    !FUNCTION_WORDS.has(w) &&
    !OBJECT_STOP.has(w) &&
    !nameWords.has(upper(w)) &&
    !(w.endsWith("s") && nameWords.has(upper(w.slice(0, -1)))) &&
    ![...nameWords].some((n) => n.length >= 3 && upper(w) === n.slice(0, -1));
  // 1) Kandidater: ord etter en/ei/et (hopper over ett adjektiv) og ord i bestemt form foran «sin/hans …»
  const candidates = new Set<string>();
  const sceneWords = scenes.map((sc) => {
    const words = [...lower(sc.action).matchAll(WORD)].map((m) => m[0]);
    for (let i = 0; i < words.length; i++) {
      const w = words[i]!;
      if (ARTICLES.has(w)) {
        let n = words[i + 1];
        if (n && OBJECT_STOP.has(n)) n = words[i + 2];
        if (n && n.length >= 3 && ok(n) && /^\p{Ll}+$/u.test(n)) candidates.add(n);
      } else if (POSTPOSED.has(w) && i > 0) {
        const base = indefinite(words[i - 1]!);
        if (base && base.length >= 3 && ok(base)) candidates.add(base);
      }
    }
    return new Set(words);
  });
  // 2) Tell scener der en bøyningsform av ordet står
  const knownKeys = new Set(all.flatMap(assetKeys));
  const assets = all.filter((a) => !a.archived);
  const out: LibrarySuggestion[] = [];
  for (const c of candidates) {
    if (knownKeys.has(upper(c))) continue;
    const forms = nounForms(c);
    const idx = new Set<number>();
    sceneWords.forEach((ws, i) => {
      if (forms.some((f) => ws.has(f))) idx.add(i);
    });
    if (idx.size < OBJECT_MIN_SCENES) continue;
    out.push({
      kind: "object",
      name: c,
      scenes: idx.size,
      possibleMatch: findSimilar(
        upper(c),
        assets.filter((a) => a.kind === "object"),
      ),
      reason: "object",
      sources: [],
      uncertain: true,
      kindUncertain: false,
      sceneNumbers: numbersOf(scenes, idx),
    });
  }
  return out
    .sort((a, b) => b.scenes - a.scenes || a.name.localeCompare(b.name, "nb"))
    .slice(0, OBJECT_MAX);
}

/**
 * Karakterer, navngitte ting, lokasjoner og objekter i manuset som ikke finnes i biblioteket under noe navn.
 * Navn som ligner en eksisterende ressurs, får den som mulig treff (usikker kobling – brukeren avgjør).
 */
export function librarySuggestions(s: ProjectState, productionId: string): LibrarySuggestion[] {
  const all = Object.values(s.assets);
  const scenes = scenesOf(s, productionId);
  const chars = characterSuggestions(s, scenes, all);
  const speakerWords = new Set<string>();
  for (const sc of scenes)
    for (const raw of sc.rawSpeakers)
      for (const n of cleanSpeaker(raw).names) for (const w of n.split(/\s+/u)) speakerWords.add(w);
  for (const a of all)
    for (const k of assetKeys(a)) for (const w of k.split(/\s+/u)) speakerWords.add(w);
  const locationWords = new Set<string>();
  for (const sc of scenes)
    for (const m of upper(sc.location).matchAll(WORD)) locationWords.add(m[0]);
  const named = namedSuggestions(scenes, all, speakerWords, locationWords);
  const namedWords = new Set(named.map((x) => upper(x.name)));
  return [
    ...chars,
    ...named,
    ...locationSuggestions(scenes, all),
    ...objectSuggestions(scenes, all, new Set([...speakerWords, ...namedWords, ...locationWords])),
  ];
}

/** Navnene en ny ressurs fra forslaget får som alternative navn (skrivemåtene i manuset). */
export function suggestionAliases(x: LibrarySuggestion, preferred: string): string[] {
  const seen = new Set([characterName(preferred)]);
  const out: string[] = [];
  for (const src of x.sources) {
    // «LAURITS OG ROLF» er ikke et navn på Laurits alene
    if (src.note === "group") continue;
    const k = characterName(src.name);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(src.name);
  }
  return out;
}
