/**
 * Konsekvenser av en ressursendring (M6 del 3, DEC-0056, REQ-0130/0132/0134/0314).
 *
 * Når et nytt bilde av en variant godkjennes, viser dette hvilke scener som berøres:
 * - 2D-scener med lag som følger den godkjente versjonen (de får det nye bildet automatisk),
 * - 2D-scener med lag som er låst til en annen versjon (de beholder sitt bilde),
 * - ferdig film i scener der ressursen er med (kan være påvirket – usikkert, filmen endres ikke).
 * Brukeren velger scene for scene om det nye bildet skal brukes (REQ-0134). Ingenting endres automatisk
 * utover det brukeren velger.
 *
 * `outdatedLayers` finner lag som er låst til en eldre versjon enn den som er godkjent nå, så sceneeditoren og
 * kontinuitetsanalysen kan flagge dem for gjennomgang (REQ-0132).
 */
import type {
  AssetVersion,
  CompositionLayer,
  ImageSwap,
  LanguageImage,
  ProjectState,
} from "../model";
import type { Command } from "../commands/types";
import { layerFieldsOf } from "../composition";
import { compositionOfVariant, layersOf } from "../composition/render";
import { orderedOccurrences } from "../views";
import { materialsOf } from "../assembly/discrepancy";
import { allAssetUsage, coverVersion, versionsOf } from "./index";

/** Hvordan et bilde i et lag (eget bilde eller et bildeskifte) forholder seg til den nye versjonen. */
export type LayerImpactMode =
  /** Følger den godkjente versjonen (eller forsidebildet): får det nye bildet når det godkjennes. */
  | "follows"
  /** Låst til en eldre versjon av varianten: kan oppdateres til den nye. */
  | "locked"
  /** Låst til en nyere versjon: endres ikke. */
  | "locked_newer"
  /** Viser allerede den nye versjonen. */
  | "current";

export interface LayerImpact {
  readonly layerId: string;
  readonly layerName: string;
  /**
   * «own» = lagets eget bilde, et tall = indeksen til bildeskiftet (DEC-0052), «lang:xx» = bildet for en
   * språkversjon (DEC-0059, KI-118).
   */
  readonly source: ImageSource;
  readonly mode: LayerImpactMode;
  /** Versjonen bildet viser før endringen. */
  readonly versionId: string | null;
}

export interface SceneImpact {
  /** Stabil nøkkel for valget (2D-scenen, ellers forekomsten). */
  readonly key: string;
  readonly productionId: string;
  readonly occurrenceId: string | null;
  readonly sceneId: string | null;
  readonly number: string | null;
  readonly active: boolean;
  readonly compositionId: string | null;
  readonly layers: readonly LayerImpact[];
  /** Ferdig film i bruk i scenen der ressursen er med (kan være påvirket – usikkert). */
  readonly filmTakeIds: readonly string[];
}

type ImageRef = Pick<CompositionLayer, "assetId" | "assetVariantId" | "versionId">;
type ImageSource = "own" | number | `lang:${string}`;

/** Versjonen et bilde viser (låst, godkjent i varianten, ellers nyeste, ellers ressursens forsidebilde). */
function shownVersion(s: ProjectState, l: ImageRef): AssetVersion | null {
  if (l.assetId === null) return null;
  if (l.versionId !== null) return s.assetVersions[l.versionId] ?? null;
  if (l.assetVariantId !== null) {
    const v = s.assetVariants[l.assetVariantId];
    if (v?.approvedVersionId) return s.assetVersions[v.approvedVersionId] ?? null;
    return versionsOf(s, l.assetVariantId)[0] ?? null;
  }
  return coverVersion(s, l.assetId);
}

/**
 * Scenene som berøres når `newVersionId` godkjennes for varianten. Godkjenningen gjelder hele prosjektet, så
 * alle 2D-scener tas med: først produksjonen som vises (`productionId`), så andre produksjoner og 2D-scener
 * som ingen forekomst bruker. Bare scener der noe kan endre seg tas med.
 */
export function assetVersionImpact(
  s: ProjectState,
  productionId: string,
  variantId: string,
  newVersionId: string,
): SceneImpact[] {
  const variant = s.assetVariants[variantId];
  const newVersion = s.assetVersions[newVersionId];
  if (!variant || !newVersion) return [];
  // Tilstanden etter godkjenningen (for bilder som følger godkjent versjon eller forsidebildet)
  const approvedState: ProjectState = {
    ...s,
    assetVariants: {
      ...s.assetVariants,
      [variantId]: { ...variant, approvedVersionId: newVersionId as never },
    },
  };
  const classify = (img: ImageRef): LayerImpactMode | null => {
    if (img.assetId !== variant.assetId) return null;
    if (img.versionId !== null) {
      const v = s.assetVersions[img.versionId];
      if (v?.variantId !== variantId) return null;
      if (v.id === newVersionId) return "current";
      return v.number < newVersion.number ? "locked" : "locked_newer";
    }
    const before = shownVersion(s, img);
    const after = shownVersion(approvedState, img);
    if (before?.id !== after?.id) return "follows";
    return after?.id === newVersionId ? "current" : null;
  };
  const layerImpacts = (compId: string): LayerImpact[] => {
    const out: LayerImpact[] = [];
    for (const l of layersOf(s, compId)) {
      const sources: { source: ImageSource; img: ImageRef }[] = [
        { source: "own", img: l },
        ...l.swaps.map((w, i) => ({ source: i, img: w })),
        // Bilde for en språkversjon (KI-118): samme ressurs, egen variant
        ...(l.languageImages ?? []).map((x) => ({
          source: `lang:${x.language}` as const,
          img: {
            assetId: l.assetId,
            assetVariantId: x.assetVariantId,
            versionId: x.versionId,
          } as ImageRef,
        })),
      ];
      for (const { source, img } of sources) {
        const mode = classify(img);
        if (mode)
          out.push({
            layerId: l.id,
            layerName: l.name,
            source,
            mode,
            versionId: shownVersion(s, img)?.id ?? null,
          });
      }
    }
    return out;
  };
  const changes = (layers: readonly LayerImpact[]) =>
    layers.some((l) => l.mode === "follows" || l.mode === "locked");

  const out: SceneImpact[] = [];
  const seenComps = new Set<string>();
  const prods = Object.values(s.productions).sort(
    (a, b) => Number(b.id === productionId) - Number(a.id === productionId),
  );
  for (const p of prods) {
    const usedIn = new Set(
      (allAssetUsage(s, p.id).get(variant.assetId) ?? []).map((u) => u.occurrenceId),
    );
    for (const o of orderedOccurrences(s, p.id)) {
      const comp = compositionOfVariant(s, o.variantId);
      const fresh = comp && !seenComps.has(comp.id);
      if (comp) seenComps.add(comp.id);
      const layers = fresh ? layerImpacts(comp.id) : [];
      const present = usedIn.has(o.id) || layers.length > 0;
      const films = present
        ? materialsOf(s, o.id)
            .filter((m) => m.kind === "take" && m.inUse)
            .map((m) => m.id)
        : [];
      if (!changes(layers) && films.length === 0) continue;
      out.push({
        key: fresh ? comp.id : o.id,
        productionId: p.id,
        occurrenceId: o.id,
        sceneId: o.sceneId,
        number: o.productionNumber,
        active: o.active,
        compositionId: fresh ? comp.id : null,
        layers,
        filmTakeIds: films,
      });
    }
  }
  // 2D-scener som ingen forekomst bruker (de endres også)
  for (const c of Object.values(s.compositions)) {
    if (c.removed || seenComps.has(c.id)) continue;
    const layers = layerImpacts(c.id);
    if (!changes(layers)) continue;
    out.push({
      key: c.id,
      productionId: "",
      occurrenceId: null,
      sceneId: s.variants[c.variantId]?.sceneId ?? null,
      number: null,
      active: false,
      compositionId: c.id,
      layers,
      filmTakeIds: [],
    });
  }
  return out;
}

/**
 * Kommandoene for en godkjenning med brukerens valg (REQ-0134): i scenene i `keep` beholdes bildene som
 * følger den godkjente versjonen (låses til versjonen de viser nå); i de andre scenene oppdateres bilder som
 * er låst til en eldre versjon, til den nye. Rekkefølge: behold, godkjenn, oppdater.
 */
export function approveWithImpactCommands(
  s: ProjectState,
  variantId: string,
  newVersionId: string,
  impact: readonly SceneImpact[],
  keep: ReadonlySet<string>,
): Command[] {
  const lock = new Map<string, Map<ImageSource, string>>();
  const update = new Map<string, Set<ImageSource>>();
  for (const x of impact)
    for (const l of x.layers) {
      if (keep.has(x.key) && l.mode === "follows" && l.versionId) {
        if (!lock.has(l.layerId)) lock.set(l.layerId, new Map());
        lock.get(l.layerId)!.set(l.source, l.versionId);
      } else if (!keep.has(x.key) && l.mode === "locked") {
        if (!update.has(l.layerId)) update.set(l.layerId, new Set());
        update.get(l.layerId)!.add(l.source);
      }
    }
  const withImage = <T extends ImageRef>(img: T, versionId: string): T => ({
    ...img,
    assetVariantId: (s.assetVersions[versionId]?.variantId ?? img.assetVariantId) as never,
    versionId: versionId as never,
  });
  const layersFor = (m: Map<string, (src: ImageSource) => string | null>) =>
    [...m.entries()].flatMap(([layerId, pick]) => {
      const l = s.layers[layerId];
      if (!l) return [];
      const f = layerFieldsOf(l);
      const own = pick("own");
      return [
        {
          layerId: l.id,
          fields: {
            ...(own ? withImage(f, own) : f),
            swaps: f.swaps.map((w: ImageSwap, i: number) => {
              const v = pick(i);
              return v ? withImage(w, v) : w;
            }),
            ...(f.languageImages
              ? {
                  languageImages: f.languageImages.map((x: LanguageImage) => {
                    const v = pick(`lang:${x.language}`);
                    return v ? { ...x, versionId: v as never } : x;
                  }),
                }
              : {}),
          },
        },
      ];
    });
  const out: Command[] = [];
  const keepLayers = layersFor(
    new Map([...lock.entries()].map(([id, m]) => [id, (src) => m.get(src) ?? null])),
  );
  if (keepLayers.length) out.push({ type: "UpdateLayers", layers: keepLayers });
  out.push({
    type: "ApproveAssetVersion",
    variantId: variantId as never,
    versionId: newVersionId as never,
  });
  const useLayers = layersFor(
    new Map(
      [...update.entries()].map(([id, set]) => [id, (src) => (set.has(src) ? newVersionId : null)]),
    ),
  );
  if (useLayers.length) out.push({ type: "UpdateLayers", layers: useLayers });
  return out;
}

export interface OutdatedLayer {
  readonly layerId: string;
  readonly compositionId: string;
  readonly assetId: string;
  readonly variantId: string;
  /** Versjonen laget er låst til. */
  readonly versionId: string;
  /** Den godkjente versjonen nå (nyere). */
  readonly approvedVersionId: string;
}

/**
 * Lag som er låst til en eldre versjon enn den som er godkjent for varianten nå (REQ-0132). En låst versjon
 * som er nyere enn den godkjente, regnes ikke som utdatert.
 */
export function outdatedLayers(s: ProjectState, compositionId?: string): OutdatedLayer[] {
  const out: OutdatedLayer[] = [];
  for (const l of Object.values(s.layers)) {
    if (l.removed || l.versionId === null || l.assetId === null) continue;
    if (compositionId && l.compositionId !== compositionId) continue;
    if (s.compositions[l.compositionId]?.removed) continue;
    const ver = s.assetVersions[l.versionId];
    if (!ver) continue;
    const va = s.assetVariants[ver.variantId];
    const approved = va?.approvedVersionId ? s.assetVersions[va.approvedVersionId] : undefined;
    if (!approved || approved.id === ver.id || approved.number <= ver.number) continue;
    out.push({
      layerId: l.id,
      compositionId: l.compositionId,
      assetId: l.assetId,
      variantId: ver.variantId,
      versionId: ver.id,
      approvedVersionId: approved.id,
    });
  }
  return out;
}
