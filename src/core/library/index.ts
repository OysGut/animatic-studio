/**
 * Ressursbiblioteket (M3 del 1; mandat kap. 8–9, REQ-0121–0136, REQ-0146, REQ-0149).
 * Ren logikk: navn og alternative navn, hvor en ressurs er brukt i manuset, og forslag fra manuset.
 * Forslag gjennomføres aldri automatisk – brukeren velger (REQ-0128).
 */
import type { Asset, AssetKind, AssetVariant, AssetVersion, ProjectState } from "../model";
import { STILL_MIME_TYPES } from "../model";
import { blocksOfVariant, orderedOccurrences } from "../views";
import { collation, localized } from "../i18n";
import {
  characterName,
  sceneHasWordPrefix,
  sceneMentions,
  sceneSpeakers,
} from "../screenplay/filter";

export const ASSET_KIND_LABEL: Record<AssetKind, string> = localized({
  character: ["Karakter", "Character"],
  object: ["Objekt / rekvisitt", "Object / prop"],
  location: ["Lokasjon", "Location"],
  animal: ["Dyr", "Animal"],
  environment: ["Miljø / bakgrunn", "Environment / background"],
  other: ["Annet", "Other"],
  sound: ["Lyd", "Sound"],
  template: ["Grafisk mal", "Graphic template"],
});

export const ASSET_KIND_PLURAL: Record<AssetKind, string> = localized({
  character: ["Karakterer", "Characters"],
  object: ["Objekter", "Objects"],
  location: ["Lokasjoner", "Locations"],
  animal: ["Dyr", "Animals"],
  environment: ["Miljøer", "Environments"],
  other: ["Annet", "Other"],
  sound: ["Lyd", "Sound"],
  template: ["Grafiske maler", "Graphic templates"],
});

/** Foretrukket navn og alle alternative navn (REQ-0126). */
export function assetNames(a: Pick<Asset, "name" | "names">): string[] {
  return [a.name, ...a.names.map((n) => n.name)];
}

/** Sammenligningsnøkkel for navn: store bokstaver, uten (V.O.) o.l., uten ekstra mellomrom. */
export function nameKey(name: string): string {
  return characterName(name);
}

/** Ressursene sortert etter navn (norsk alfabet). Arkiverte til slutt. */
/** Ressursene (uten slettede, DEC-0079), arkiverte sist. */
export function sortedAssets(s: ProjectState, kind?: AssetKind): Asset[] {
  return Object.values(s.assets)
    .filter((a) => !a.removed && (!kind || a.kind === kind))
    .sort(
      (a, b) =>
        Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, collation()),
    );
}

export function variantsOf(s: ProjectState, assetId: string): AssetVariant[] {
  return Object.values(s.assetVariants)
    .filter((v) => v.assetId === assetId)
    .sort(
      (a, b) =>
        Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, collation()),
    );
}

/** Versjonene av en variant, nyeste først (uten slettede bilder, DEC-0079). */
export function versionsOf(s: ProjectState, variantId: string): AssetVersion[] {
  return allVersionsOf(s, variantId).filter((v) => !v.removed);
}

/** Alle versjonene av en variant, også slettede, nyeste først. */
export function allVersionsOf(s: ProjectState, variantId: string): AssetVersion[] {
  return Object.values(s.assetVersions)
    .filter((v) => v.variantId === variantId)
    .sort((a, b) => b.number - a.number);
}

/** «Slettede objekter» (DEC-0079): slettede ressurser og slettede enkeltbilder i ressurser som finnes. */
export function trashContents(s: ProjectState): {
  readonly assets: readonly Asset[];
  readonly versions: readonly { readonly asset: Asset; readonly version: AssetVersion }[];
} {
  const assets = Object.values(s.assets)
    .filter((a) => a.removed)
    .sort((a, b) => a.name.localeCompare(b.name, collation()));
  const versions: { asset: Asset; version: AssetVersion }[] = [];
  for (const v of Object.values(s.assetVersions)) {
    if (!v.removed) continue;
    const va = s.assetVariants[v.variantId];
    const asset = va ? s.assets[va.assetId] : undefined;
    if (asset && !asset.removed) versions.push({ asset, version: v });
  }
  versions.sort(
    (a, b) =>
      a.asset.name.localeCompare(b.asset.name, collation()) || b.version.number - a.version.number,
  );
  return { assets, versions };
}

/**
 * Hva skjer når ressursen slettes (advarselen, DEC-0079): lag og lyd i filmen som bruker den. De beholder
 * bildet/lyden til ressursen slettes for godt – og det kan ikke gjøres før bruken er fjernet.
 */
export function assetUsageCounts(
  s: ProjectState,
  assetId: string,
): { readonly layers: number; readonly audio: number; readonly scenes: number } {
  const comps = new Set<string>();
  let layers = 0;
  for (const l of Object.values(s.layers))
    if (!l.removed && (l.assetId === assetId || l.swaps.some((w) => w.assetId === assetId))) {
      layers++;
      comps.add(l.compositionId);
    }
  const audio = Object.values(s.audioClips).filter(
    (c) => !c.removed && c.assetId === assetId,
  ).length;
  return { layers, audio, scenes: comps.size };
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

export type UsageHow = "speaks" | "mentioned" | "location" | "text" | "audio" | "layer";

export interface AssetUsage {
  readonly occurrenceId: string;
  readonly number: string | null;
  readonly active: boolean;
  readonly how: UsageHow;
  /** Navnet som traff (foretrukket eller alternativt). */
  readonly matchedName: string;
}

export const USAGE_LABEL: Record<UsageHow, string> = localized({
  speaks: ["har replikk", "has a line"],
  mentioned: ["nevnes", "mentioned"],
  location: ["sted i overskriften", "location in the heading"],
  text: ["nevnes i teksten", "mentioned in the text"],
  audio: ["lydklipp i scenen", "audio clip in the scene"],
  layer: ["lag i 2D-scenen", "layer in the 2D scene"],
});

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
  // Faktisk bruk i materialet (UX-gjennomgang DEC-0076): lydklipp og lag teller selv om navnet ikke står i
  // manuset, så en ressurs i bruk aldri ser ubrukt ut (og arkiveres ved en feil)
  const audioOccs = new Set<string>();
  for (const c of Object.values(s.audioClips))
    if (!c.removed && c.assetId === asset.id) audioOccs.add(c.occurrenceId);
  const layerVariants = new Set<string>();
  for (const l of Object.values(s.layers)) {
    if (l.removed || l.assetId !== asset.id) continue;
    const comp = s.compositions[l.compositionId];
    if (comp && !comp.removed) layerVariants.add(comp.variantId);
  }
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
    // Betegnelser i bestemte linjer (REQ-0127): «onkel» er Laurits akkurat her
    if (!hit && asset.contextNames?.length) {
      const here = contextHit(s, o.variantId, asset);
      if (here) hit = here;
    }
    if (!hit && layerVariants.has(o.variantId)) hit = { how: "layer", matchedName: asset.name };
    if (!hit && audioOccs.has(o.id)) hit = { how: "audio", matchedName: asset.name };
    if (hit) out.push({ ...base, ...hit });
  }
  return out;
}

/** Treff for en kontekstbetegnelse i scenevarianten (linjene er valgt av brukeren). */
function contextHit(
  s: ProjectState,
  variantId: string,
  asset: Asset,
): { how: UsageHow; matchedName: string } | null {
  for (const n of asset.contextNames ?? [])
    for (const id of n.blockIds) {
      const b = s.blocks[id];
      if (!b || b.removed || b.variantId !== variantId) continue;
      return { how: b.kind === "character" ? "speaks" : "mentioned", matchedName: n.name };
    }
  return null;
}

/** Betegnelsene som gjelder ressursen i disse linjene (REQ-0127). */
export function contextNamesIn(asset: Asset, blockIds: ReadonlySet<string>): string[] {
  return (asset.contextNames ?? [])
    .filter((n) => n.blockIds.some((id) => blockIds.has(id)))
    .map((n) => n.name);
}

/**
 * Linjer i manuset der en betegnelse forekommer (for å velge hvilke som gjelder ressursen): replikkhoder
 * med det navnet, og linjer der ordet står. Sortert i manusets rekkefølge per produksjon.
 */
export function linesWithWord(
  s: ProjectState,
  productionId: string,
  word: string,
): { readonly occurrenceId: string; readonly blockId: string; readonly text: string }[] {
  const w = word.trim();
  if (w.length < 2) return [];
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(w)}($|[^\\p{L}\\p{N}])`, "iu");
  const out: { occurrenceId: string; blockId: string; text: string }[] = [];
  for (const o of orderedOccurrences(s, productionId))
    for (const b of blocksOfVariant(s, o.variantId))
      if (b.kind !== "heading" && re.test(b.text))
        out.push({ occurrenceId: o.id, blockId: b.id, text: b.text });
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

/**
 * Ressursene i biblioteket som er brukt i én scene (sceneforekomst), med hvordan de er brukt:
 * karakterer først, så steder, objekter og resten; arkiverte utelates.
 */
export function assetsInScene(
  s: ProjectState,
  productionId: string,
  occurrenceId: string,
): { readonly asset: Asset; readonly how: UsageHow }[] {
  const order: Record<AssetKind, number> = {
    character: 0,
    animal: 1,
    location: 2,
    environment: 3,
    object: 4,
    other: 5,
    sound: 6,
    template: 7,
  };
  const out: { asset: Asset; how: UsageHow }[] = [];
  for (const [assetId, uses] of allAssetUsage(s, productionId)) {
    const asset = s.assets[assetId];
    // Lyd er ikke noe som kan legges inn som lag (DEC-0044)
    if (!asset || asset.archived || asset.removed || asset.kind === "sound") continue;
    const u = uses.find((x) => x.occurrenceId === occurrenceId);
    if (u) out.push({ asset, how: u.how });
  }
  return out.sort(
    (a, b) =>
      order[a.asset.kind] - order[b.asset.kind] ||
      a.asset.name.localeCompare(b.asset.name, collation()),
  );
}

// ---------- Forslag fra manuset (REQ-0128, DEC-0034) – se suggest.ts ----------
export * from "./suggest";

// ---------- Opphav, stilprofiler og innholdsmessig synk (REQ-0121, REQ-0022, DEC-0078) ----------
export * from "./provenance";
export * from "./style-profiles";
export * from "./content-sync";
export * from "./global";

/** Visningsnavn for et navn fra manuset: «BESTEMOR ANNE» → «Bestemor Anne». */
export function displayName(name: string): string {
  return name
    .toLocaleLowerCase(collation())
    .replace(
      /(^|[\s-])(\p{L})/gu,
      (_m, sep: string, ch: string) => sep + ch.toLocaleUpperCase(collation()),
    );
}

/**
 * Bilder som kan brukes som stillbilde i monteringen (DEC-0072): godkjent eller nyeste bildeversjon i hver
 * variant av ressurser som ikke er arkivert.
 */
export function stillCandidates(
  s: ProjectState,
): { asset: Asset; variant: AssetVariant; version: AssetVersion }[] {
  const out: { asset: Asset; variant: AssetVariant; version: AssetVersion }[] = [];
  for (const asset of sortedAssets(s)) {
    if (asset.archived || asset.removed) continue;
    for (const variant of variantsOf(s, asset.id)) {
      if (variant.archived) continue;
      const approved = variant.approvedVersionId
        ? s.assetVersions[variant.approvedVersionId]
        : undefined;
      const version = approved ?? versionsOf(s, variant.id)[0];
      if (version && STILL_MIME_TYPES.includes(version.mimeType))
        out.push({ asset, variant, version });
    }
  }
  return out;
}

/** Merknaden originalen får når et stort bilde får en nedskalert arbeidskopi (DEC-0079). */
// Merknaden lagres i prosjektet og gjenkjennes ved lesing, så begge språkene gjelder
export const ORIGINAL_NOTE_MARK = "Original i full størrelse"; // i18n-ignore
export const ORIGINAL_NOTE_MARK_EN = "Original at full size";

/**
 * Originalen i full størrelse til en nedskalert arbeidskopi (versjonen rett før, med merknaden), eller null.
 * Brukes når forbildebilder skal sendes til AI i full størrelse (f.eks. karakterkort).
 */
export function fullSizeOriginal(s: ProjectState, versionId: string): AssetVersion | null {
  const v = s.assetVersions[versionId];
  if (!v) return null;
  const prev = allVersionsOf(s, v.variantId).find((x) => x.number === v.number - 1);
  const isOriginal =
    prev !== undefined &&
    (prev.note.includes(ORIGINAL_NOTE_MARK) || prev.note.includes(ORIGINAL_NOTE_MARK_EN));
  return isOriginal && prev && !prev.removed ? prev : null;
}
