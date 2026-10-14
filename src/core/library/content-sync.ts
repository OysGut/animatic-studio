/**
 * Strukturell og innholdsmessig synkronisering (REQ-0022, mandat 2.1, DEC-0078).
 *
 * - **Strukturell plassering** er hvor materialet står: sceneforekomst, delsekvens og scenevariant. Den
 *   følger alltid manuset automatisk (flytt, deaktiver, rekkefølge) og endrer aldri grunnlaget.
 * - **Innholdsmessig grunnlag** er hva materialet ble laget fra: manuslinjenes revisjoner (`producedFrom`,
 *   avvik i assembly/discrepancy.ts) og ressursversjonene. Når grunnlaget er eldre enn det som gjelder nå,
 *   flagges materialet; det endres aldri automatisk (INV-07, INV-13).
 *
 * Ressursversjonene lagres i `producedFrom.assetVersions` (ressurs-ID → versjons-ID) når materialet lages
 * (AddTake, CreateComposition) og når det godkjennes på nytt (AcceptScriptChanges/SetProducedFrom). Det
 * dekker også lag som følger varianten og importert film (scenens 2D-scene da filmen ble lagt inn).
 * Ellers – og for materiale laget før feltet fantes – leses de fra det som allerede er lagret:
 * - 2D-scener: versjonen hvert lag (eget bilde, bildeskifter, språkbilder) er låst til. Et lag uten låst
 *   versjon følger varianten (godkjent, ellers nyeste) – det er et bevisst valg; byttet skjer bare når
 *   brukeren godkjenner en ny versjon og velger scenene (library/impact.ts).
 * - Stillbilder: filen (`mediaRef`) er ressursversjonens fil.
 * - AI-materiale: referansene i sporet til jobben (`generation_jobs.params.trace`, DEC-0072).
 * - Importert film og ren lyd: ukjent (filmen er laget utenfor programmet; ingen ressursversjoner lagret).
 *
 * Flagget «Ressursen er oppdatert etter at scenen ble laget» bygger på arbeidslisten (library/worklist.ts):
 * en scene flagges når noe i den viser en eldre versjon enn den som er godkjent nå.
 */
import type { AssetVersion, CompositionLayer, ProjectState, Take } from "../model";
import { takeLabel } from "../assembly/edit";
import { orderedOccurrences, sceneNumberOf } from "../views";
import type { GenerationJob } from "../generation/cost";
import { traceOf } from "../generation/trace";
import { compositionOfVariant, layerVersion } from "../composition/render";
import { assetWorklist, type WorkItem } from "./worklist";
import { jobsByResultPath } from "./provenance";
import { L } from "../i18n";

/** Norsk nøkkel for flagget (brukes av tester); visningen er `contentSyncFlag()`. */
export const CONTENT_SYNC_FLAG = "Ressursen er oppdatert etter at scenen ble laget"; // i18n-ignore
const contentSyncFlag = () =>
  L(CONTENT_SYNC_FLAG, "The asset was updated after the scene was made");

export type ResourceBasisSource =
  /** Lag i 2D-scenen låst til en bestemt versjon. */
  | "layer_locked"
  /** Lag som følger variantens godkjente (ellers nyeste) versjon. */
  | "layer_follows"
  /** Stillbilde laget av versjonens fil. */
  | "still"
  /** Referanse sendt med AI-jobben. */
  | "ai_reference";

export interface ResourceBasisEntry {
  readonly assetId: string;
  readonly variantId: string;
  readonly versionId: string;
  readonly number: number;
  readonly source: ResourceBasisSource;
  /** Laget eller versjonen av scenen som viser ressursen. */
  readonly via: string;
}

/** Bildene i et lag: eget bilde, bildeskiftene og språkbildene (som lag-felt, så `layerVersion` kan brukes). */
function layerImages(
  s: ProjectState,
  l: CompositionLayer,
): Pick<CompositionLayer, "assetId" | "assetVariantId" | "versionId">[] {
  const out: Pick<CompositionLayer, "assetId" | "assetVariantId" | "versionId">[] = [l, ...l.swaps];
  for (const x of l.languageImages ?? []) {
    const assetId = s.assetVariants[x.assetVariantId]?.assetId;
    if (assetId)
      out.push({
        assetId: assetId as never,
        assetVariantId: x.assetVariantId,
        versionId: x.versionId,
      });
  }
  return out;
}

function entry(
  s: ProjectState,
  v: AssetVersion,
  source: ResourceBasisSource,
  via: string,
): ResourceBasisEntry | null {
  const va = s.assetVariants[v.variantId];
  if (!va) return null;
  return {
    assetId: va.assetId,
    variantId: v.variantId,
    versionId: v.id,
    number: v.number,
    source,
    via,
  };
}

/** Ressursversjonene en 2D-scene viser nå: låste versjoner er lagret grunnlag, resten følger varianten. */
export function compositionResourceBasis(
  s: ProjectState,
  compositionId: string,
): ResourceBasisEntry[] {
  const comp = s.compositions[compositionId];
  if (!comp || comp.removed) return [];
  const out: ResourceBasisEntry[] = [];
  const seen = new Set<string>();
  const layers = Object.values(s.layers)
    .filter((l) => l.compositionId === comp.id && !l.removed)
    .sort((a, b) => (a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0));
  for (const l of layers) {
    for (const img of layerImages(s, l)) {
      if (img.assetId === null) continue;
      const v = layerVersion(s, { ...l, ...img } as CompositionLayer);
      if (!v) continue;
      const source = img.versionId !== null ? "layer_locked" : "layer_follows";
      const key = `${l.id}:${v.id}:${source}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const e = entry(s, v, source, l.id);
      if (e) out.push(e);
    }
  }
  return out;
}

/**
 * Ressursversjonene en versjon av scenen (take) er laget fra, eller null når de ikke er kjent (importert
 * film, ren lyd, AI-materiale uten spor).
 */
export function takeResourceBasis(
  s: ProjectState,
  t: Take,
  jobs?: readonly GenerationJob[],
): ResourceBasisEntry[] | null {
  if (t.kind === "still") {
    const v = t.mediaRef
      ? Object.values(s.assetVersions).find((x) => x.mediaPath === t.mediaRef)
      : undefined;
    const e = v ? entry(s, v, "still", t.id) : null;
    return e ? [e] : null;
  }
  if (t.kind === "ai_video") {
    const job = t.mediaRef ? jobsByResultPath(jobs).get(t.mediaRef) : undefined;
    const trace = traceOf(job?.params);
    if (!trace) return null;
    const out: ResourceBasisEntry[] = [];
    for (const r of trace.references) {
      const v = r.versionId ? s.assetVersions[r.versionId] : undefined;
      const e = v ? entry(s, v, "ai_reference", t.id) : null;
      if (e) out.push(e);
    }
    return out;
  }
  if (t.kind === "composition2d") {
    const occ = s.occurrences[t.occurrenceId];
    const comp = occ ? compositionOfVariant(s, occ.variantId) : null;
    return comp ? compositionResourceBasis(s, comp.id) : null;
  }
  return null;
}

/** Strukturell plassering og innholdsmessig grunnlag for et materiale, holdt adskilt (REQ-0022). */
export interface MaterialBasis {
  readonly structure: {
    readonly variantId: string | null;
    readonly occurrenceId: string | null;
    readonly segmentId: string | null;
  };
  readonly content: {
    /** Manuslinjenes revisjoner materialet er laget fra (tomt = ukjent). */
    readonly blockRevisions: Readonly<Record<string, number>>;
    /** Ressursversjonene (null = ikke kjent). */
    readonly resources: readonly ResourceBasisEntry[] | null;
  };
}

export function takeMaterialBasis(
  s: ProjectState,
  t: Take,
  jobs?: readonly GenerationJob[],
): MaterialBasis {
  return {
    structure: {
      variantId: s.occurrences[t.occurrenceId]?.variantId ?? null,
      occurrenceId: t.occurrenceId,
      segmentId: t.segmentId,
    },
    content: {
      blockRevisions: t.producedFrom.blockRevisions,
      resources: takeResourceBasis(s, t, jobs),
    },
  };
}

/**
 * Ressurs-ID → versjons-ID fra et grunnlag (REQ-0022), til `producedFrom.assetVersions`. Brukes flere
 * versjoner av samme ressurs, gjelder den første (lagrekkefølge). undefined når ingen er kjent.
 */
export function assetVersionsOf(
  entries: readonly ResourceBasisEntry[] | null,
): Record<string, string> | undefined {
  if (!entries || entries.length === 0) return undefined;
  const out: Record<string, string> = {};
  for (const e of entries) if (!(e.assetId in out)) out[e.assetId] = e.versionId;
  return out;
}

/** Ressursversjonene en 2D-scene viser nå, til grunnlaget (REQ-0022). */
export function compositionAssetVersions(
  s: ProjectState,
  compositionId: string,
): Record<string, string> | undefined {
  return assetVersionsOf(compositionMaterialBasis(s, compositionId).content.resources);
}

/**
 * Ressursversjonene en versjon av scenen lages fra nå (REQ-0022). Importert film er laget utenfor
 * programmet; grunnlaget er da det scenens 2D-scene viser når filmen legges inn (det filmen skal erstatte).
 * AI-video uten spor her: undefined (sporet i jobben brukes i arbeidslisten).
 */
export function takeAssetVersions(s: ProjectState, t: Take): Record<string, string> | undefined {
  const own = assetVersionsOf(takeMaterialBasis(s, t).content.resources);
  if (own || t.kind !== "imported_film") return own;
  const occ = s.occurrences[t.occurrenceId];
  const comp = occ ? compositionOfVariant(s, occ.variantId) : null;
  return comp ? compositionAssetVersions(s, comp.id) : undefined;
}

export function compositionMaterialBasis(s: ProjectState, compositionId: string): MaterialBasis {
  const comp = s.compositions[compositionId];
  return {
    structure: { variantId: comp?.variantId ?? null, occurrenceId: null, segmentId: null },
    content: {
      blockRevisions: comp?.producedFrom?.blockRevisions ?? {},
      resources: comp ? compositionResourceBasis(s, comp.id) : null,
    },
  };
}

/**
 * Materiale der det lagrede grunnlaget (`producedFrom.assetVersions`) har en eldre versjon enn den som er
 * godkjent nå (REQ-0022): 2D-scener med lag som følger varianten, og importert film. Vises bare som flagg;
 * byttet gjøres i arbeidslisten eller ved å godkjenne scenen på nytt.
 */
export interface BasisSyncItem {
  readonly key: string;
  readonly kind: "basis";
  /** 2D-scenen eller versjonen av scenen. */
  readonly targetId: string;
  readonly label: string;
  readonly assetId: string;
  readonly variantId: string;
  readonly oldVersionId: string;
  readonly newVersionId: string;
  readonly occurrenceId: string;
  readonly sceneNumber: string | null;
  readonly compositionId: string | null;
}

export type ContentSyncItem = WorkItem | BasisSyncItem;

/** En scene der noe viser en eldre ressursversjon enn den som er godkjent nå. */
export interface SceneContentSync {
  readonly occurrenceId: string;
  readonly sceneNumber: string | null;
  /** Ressursene som er oppdatert (unike, i rekkefølge). */
  readonly assetIds: readonly string[];
  readonly items: readonly ContentSyncItem[];
}

/** Den godkjente versjonen av varianten, hvis den er nyere enn `v`. */
function newerApproved(s: ProjectState, v: AssetVersion | undefined): AssetVersion | null {
  if (!v) return null;
  const va = s.assetVariants[v.variantId];
  const a = va?.approvedVersionId ? s.assetVersions[va.approvedVersionId] : undefined;
  return a && a.id !== v.id && a.number > v.number ? a : null;
}

/**
 * Poster fra det lagrede grunnlaget (REQ-0022): for hver scene i produksjonen sammenlignes 2D-scenens og den
 * aktive versjonens `assetVersions` med den godkjente versjonen nå. «Behold» (gjennomgåtte versjoner) i
 * lagene eller versjonen gjelder også her.
 */
export function basisSyncItems(
  s: ProjectState,
  productionId: string,
  opts: { readonly assetId?: string } = {},
): BasisSyncItem[] {
  const out: BasisSyncItem[] = [];
  const check = (
    versions: Readonly<Record<string, string>> | undefined,
    reviewed: ReadonlySet<string>,
    base: Pick<
      BasisSyncItem,
      "targetId" | "label" | "occurrenceId" | "sceneNumber" | "compositionId"
    >,
  ) => {
    if (!versions) return;
    for (const [assetId, versionId] of Object.entries(versions)) {
      if (opts.assetId && assetId !== opts.assetId) continue;
      const old = s.assetVersions[versionId];
      const nu = newerApproved(s, old);
      if (!old || !nu || reviewed.has(nu.id)) continue;
      out.push({
        ...base,
        key: `basis:${base.targetId}:${old.id}`,
        kind: "basis",
        assetId,
        variantId: old.variantId,
        oldVersionId: old.id,
        newVersionId: nu.id,
      });
    }
  };
  for (const o of orderedOccurrences(s, productionId)) {
    const sceneNumber = sceneNumberOf(s, o);
    const comp = compositionOfVariant(s, o.variantId);
    if (comp && !comp.removed) {
      const reviewed = new Set<string>();
      for (const l of Object.values(s.layers))
        if (l.compositionId === comp.id) for (const v of l.reviewedVersions ?? []) reviewed.add(v);
      check(comp.producedFrom?.assetVersions, reviewed, {
        targetId: comp.id,
        label: comp.name,
        occurrenceId: o.id,
        sceneNumber,
        compositionId: comp.id,
      });
    }
    const t = o.activeTakeId ? s.takes[o.activeTakeId] : undefined;
    if (t)
      check(
        t.acceptedFrom?.assetVersions ?? t.producedFrom.assetVersions,
        new Set(t.reviewedVersions ?? []),
        {
          targetId: t.id,
          label: takeLabel(s, t),
          occurrenceId: o.id,
          sceneNumber,
          compositionId: null,
        },
      );
  }
  return out;
}

/** Scenene i produksjonen som er laget med en eldre ressursversjon (nøkkel: sceneforekomst). */
export function contentSyncByScene(
  s: ProjectState,
  productionId: string,
  opts: { readonly assetId?: string; readonly jobs?: readonly GenerationJob[] } = {},
): ReadonlyMap<string, SceneContentSync> {
  const m = new Map<
    string,
    { sceneNumber: string | null; assetIds: string[]; items: ContentSyncItem[] }
  >();
  // Arbeidslisten (låste lag, stillbilder, AI-spor) og det lagrede grunnlaget (lag som følger varianten,
  // importert film); samme versjonsbytte i samme scene telles én gang
  const seen = new Set<string>();
  const all: ContentSyncItem[] = [
    ...assetWorklist(s, productionId, opts),
    ...basisSyncItems(s, productionId, opts.assetId ? { assetId: opts.assetId } : {}),
  ];
  for (const it of all) {
    if (!it.occurrenceId) continue;
    const dup = `${it.occurrenceId}:${it.oldVersionId}:${it.newVersionId}`;
    if (seen.has(dup)) continue;
    seen.add(dup);
    let x = m.get(it.occurrenceId);
    if (!x) {
      x = { sceneNumber: it.sceneNumber, assetIds: [], items: [] };
      m.set(it.occurrenceId, x);
    }
    x.items.push(it);
    if (!x.assetIds.includes(it.assetId)) x.assetIds.push(it.assetId);
  }
  return new Map(
    [...m].map(([occurrenceId, x]) => [occurrenceId, { occurrenceId, ...x }] as const),
  );
}

/** Teksten til flagget for én scene: «Ressursen er oppdatert …: Maja (v3 → v4)». */
export function contentSyncText(s: ProjectState, sync: SceneContentSync): string {
  const parts = sync.items.map((it) => {
    const name = s.assets[it.assetId]?.name ?? L("Ressurs", "Asset");
    const a = s.assetVersions[it.oldVersionId]?.number;
    const b = s.assetVersions[it.newVersionId]?.number;
    return a && b ? `${name} (v${a} → v${b})` : name;
  });
  return `${contentSyncFlag()}: ${[...new Set(parts)].join(", ")}`;
}
