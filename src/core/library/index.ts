/**
 * Ressursbiblioteket (M3 del 1; mandat kap. 8–9, REQ-0121–0136, REQ-0146, REQ-0149).
 * Ren logikk: navn og alternative navn, hvor en ressurs er brukt i manuset, og forslag fra manuset.
 * Forslag gjennomføres aldri automatisk – brukeren velger (REQ-0128).
 */
import type { Asset, AssetKind, AssetVariant, AssetVersion, ProjectState } from "../model";
import { orderedOccurrences } from "../views";
import {
  characterName,
  charactersInProduction,
  sceneHasWordPrefix,
  sceneMentions,
  sceneSpeakers,
} from "../screenplay/filter";

export const ASSET_KIND_LABEL: Record<AssetKind, string> = {
  character: "Karakter",
  object: "Objekt / rekvisitt",
  location: "Lokasjon",
  animal: "Dyr",
  environment: "Miljø / bakgrunn",
  other: "Annet",
};

export const ASSET_KIND_PLURAL: Record<AssetKind, string> = {
  character: "Karakterer",
  object: "Objekter",
  location: "Lokasjoner",
  animal: "Dyr",
  environment: "Miljøer",
  other: "Annet",
};

/** Foretrukket navn og alle alternative navn (REQ-0126). */
export function assetNames(a: Pick<Asset, "name" | "names">): string[] {
  return [a.name, ...a.names.map((n) => n.name)];
}

/** Sammenligningsnøkkel for navn: store bokstaver, uten (V.O.) o.l., uten ekstra mellomrom. */
export function nameKey(name: string): string {
  return characterName(name);
}

/** Ressursene sortert etter navn (norsk alfabet). Arkiverte til slutt. */
export function sortedAssets(s: ProjectState, kind?: AssetKind): Asset[] {
  return Object.values(s.assets)
    .filter((a) => !kind || a.kind === kind)
    .sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, "nb"));
}

export function variantsOf(s: ProjectState, assetId: string): AssetVariant[] {
  return Object.values(s.assetVariants)
    .filter((v) => v.assetId === assetId)
    .sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, "nb"));
}

/** Versjonene av en variant, nyeste først. */
export function versionsOf(s: ProjectState, variantId: string): AssetVersion[] {
  return Object.values(s.assetVersions)
    .filter((v) => v.variantId === variantId)
    .sort((a, b) => b.number - a.number);
}

/** Bildet som representerer ressursen: godkjent versjon i første variant, ellers nyeste versjon. */
export function coverVersion(s: ProjectState, assetId: string): AssetVersion | null {
  const vars = variantsOf(s, assetId).filter((v) => !v.archived);
  for (const v of vars)
    if (v.approvedVersionId && s.assetVersions[v.approvedVersionId])
      return s.assetVersions[v.approvedVersionId]!;
  for (const v of vars) {
    const latest = versionsOf(s, v.id)[0];
    if (latest) return latest;
  }
  return null;
}

// ---------- Bruk i manuset (REQ-0131) ----------

export type UsageHow = "speaks" | "mentioned" | "location" | "text";

export interface AssetUsage {
  readonly occurrenceId: string;
  readonly number: string | null;
  readonly active: boolean;
  readonly how: UsageHow;
  /** Navnet som traff (foretrukket eller alternativt). */
  readonly matchedName: string;
}

export const USAGE_LABEL: Record<UsageHow, string> = {
  speaks: "har replikk",
  mentioned: "nevnes",
  location: "sted i overskriften",
  text: "nevnes i teksten",
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Stedet i overskriften inneholder navnet som eget ord (STUA treffer «STUA - HJEMME», ikke «STUAEN»). */
const locRes = new Map<string, RegExp>();
function locationMatches(location: string, name: string): boolean {
  const key = nameKey(name);
  if (!key) return false;
  let re = locRes.get(key);
  if (!re) {
    re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(key)}($|[^\\p{L}\\p{N}])`, "u");
    if (locRes.size > 1000) locRes.clear();
    locRes.set(key, re);
  }
  return re.test(location.toUpperCase());
}

/**
 * Scenene i produksjonen der ressursen er brukt, ut fra navnene i manuset.
 * Karakterer: replikk eller nevnt (stor forbokstav). Lokasjoner: stedet i sceneoverskriften.
 * Andre typer: ord som begynner med navnet i handling og overskrift (mulige treff – vises som forslag).
 */
export function assetUsage(s: ProjectState, productionId: string, asset: Asset): AssetUsage[] {
  return usageIn(s, orderedOccurrences(s, productionId), asset);
}

function usageIn(
  s: ProjectState,
  occs: readonly ReturnType<typeof orderedOccurrences>[number][],
  asset: Asset,
): AssetUsage[] {
  const names = assetNames(asset)
    .map((n) => n.trim())
    .filter(Boolean);
  const keys = names.map(nameKey);
  const out: AssetUsage[] = [];
  for (const o of occs) {
    const base = { occurrenceId: o.id, number: o.productionNumber, active: o.active };
    let hit: { how: UsageHow; matchedName: string } | null = null;
    if (asset.kind === "character") {
      const speakers = sceneSpeakers(s, o.variantId);
      const i = keys.findIndex((k) => speakers.has(k));
      if (i >= 0) hit = { how: "speaks", matchedName: names[i]! };
      else {
        const j = keys.findIndex((k) => sceneMentions(s, o.variantId, k));
        if (j >= 0) hit = { how: "mentioned", matchedName: names[j]! };
      }
    } else if (asset.kind === "location") {
      const loc = s.variants[o.variantId]?.heading.location ?? "";
      const i = names.findIndex((n) => locationMatches(loc, n));
      if (i >= 0) hit = { how: "location", matchedName: names[i]! };
    } else {
      const i = names.findIndex((n) => sceneHasWordPrefix(s, o.variantId, n));
      if (i >= 0) hit = { how: "text", matchedName: names[i]! };
    }
    if (hit) out.push({ ...base, ...hit });
  }
  return out;
}

const usageCache = new WeakMap<ProjectState, Map<string, Map<string, AssetUsage[]>>>();

/** Bruk for alle ressurser i produksjonen, beregnet én gang per tilstand (for lister og filtre). */
export function allAssetUsage(
  s: ProjectState,
  productionId: string,
): ReadonlyMap<string, readonly AssetUsage[]> {
  let byProd = usageCache.get(s);
  if (!byProd) {
    byProd = new Map();
    usageCache.set(s, byProd);
  }
  let m = byProd.get(productionId);
  if (!m) {
    m = new Map();
    const occs = orderedOccurrences(s, productionId);
    for (const a of Object.values(s.assets)) m.set(a.id, usageIn(s, occs, a));
    byProd.set(productionId, m);
  }
  return m;
}

// ---------- Forslag fra manuset (REQ-0128) ----------

export interface LibrarySuggestion {
  readonly kind: AssetKind;
  /** Navnet slik det står i manuset (karakterer med store bokstaver). */
  readonly name: string;
  /** Antall scener der navnet opptrer. */
  readonly scenes: number;
  /** Mulig samme som en eksisterende ressurs (usikker kobling – brukeren avgjør). */
  readonly possibleMatch: { readonly assetId: string; readonly assetName: string } | null;
}

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
function similar(candidate: string, existing: string): boolean {
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

function findSimilar(
  key: string,
  assets: readonly Asset[],
): { assetId: string; assetName: string } | null {
  for (const a of assets)
    for (const n of assetNames(a))
      if (similar(key, nameKey(n))) return { assetId: a.id, assetName: a.name };
  return null;
}

/**
 * Karakterer (replikknavn) og lokasjoner (steder i sceneoverskriftene) i manuset som ikke finnes i biblioteket
 * under noe navn. Navn som ligner en eksisterende ressurs, får den som mulig treff.
 */
export function librarySuggestions(s: ProjectState, productionId: string): LibrarySuggestion[] {
  const all = Object.values(s.assets);
  const known = (kind: AssetKind) =>
    new Set(
      all
        .filter((a) => a.kind === kind)
        .flatMap(assetNames)
        .map(nameKey),
    );
  const out: LibrarySuggestion[] = [];

  const chars = known("character");
  const charAssets = all.filter((a) => a.kind === "character" && !a.archived);
  for (const c of charactersInProduction(s, productionId)) {
    if (chars.has(c.name)) continue;
    out.push({
      kind: "character",
      name: c.name,
      scenes: c.scenes,
      possibleMatch: findSimilar(c.name, charAssets),
    });
  }

  const locs = known("location");
  const locAssets = all.filter((a) => a.kind === "location" && !a.archived);
  const counts = new Map<string, number>();
  for (const o of orderedOccurrences(s, productionId)) {
    const loc = s.variants[o.variantId]?.heading.location.trim();
    if (!loc) continue;
    const key = nameKey(loc);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [name, scenes] of [...counts].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "nb"),
  )) {
    if (locs.has(name)) continue;
    out.push({ kind: "location", name, scenes, possibleMatch: findSimilar(name, locAssets) });
  }
  return out;
}

/** Visningsnavn for et navn fra manuset: «BESTEMOR ANNE» → «Bestemor Anne». */
export function displayName(name: string): string {
  return name
    .toLocaleLowerCase("nb")
    .replace(
      /(^|[\s-])(\p{L})/gu,
      (_m, sep: string, ch: string) => sep + ch.toLocaleUpperCase("nb"),
    );
}
