/**
 * Arbeidsliste for oppdaterte ressurser (DEC-0072, Mars: «om en assets er oppdatert kan en få opp en
 * arbeidsliste for å gå igjennom hvilke scener som er berørt og om scene for scene at den nye assetsen skal
 * brukes i stedet for»; REQ-0130/0132/0134).
 *
 * Listen viser alt som fortsatt viser en eldre versjon enn den som er godkjent for varianten nå:
 * - lag i 2D-scener (eget bilde og bildeskifter) som er låst til en eldre versjon,
 * - stillbilder i monteringen som er laget av en eldre versjon,
 * - AI-video og AI-bilder i scenen som ble laget med en eldre versjon som referanse (fra sporet, REQ-0257).
 * For hver post velger brukeren «Bruk ny versjon» (2D-lag og stillbilder), «Behold» (posten forsvinner til
 * neste versjon godkjennes) eller å åpne scenen. AI-video lages aldri på nytt automatisk; «Lag ny video …»
 * åpner bare scenen, og brukeren starter genereringen selv.
 */
import type { Command } from "../commands/types";
import { layerFieldsOf } from "../composition";
import type { AssetVersion, ImageSwap, LanguageImage, ProjectState, Take } from "../model";
import { orderedOccurrences, sceneNumberOf } from "../views";
import { editableParts, takeLabel } from "../assembly/edit";
import { filmClips, type FilmClip } from "../assembly/film";
import type { GenerationJob } from "../generation/cost";
import { traceOf } from "../generation/trace";

export type WorkItemKind = "layer" | "still" | "ai";

export interface WorkItem {
  /** Stabil nøkkel (mål + versjon). */
  readonly key: string;
  readonly kind: WorkItemKind;
  /** Laget eller versjonen av scenen. */
  readonly targetId: string;
  readonly label: string;
  readonly assetId: string;
  readonly variantId: string;
  /** Versjonen som vises nå (eldre). */
  readonly oldVersionId: string;
  /** Den godkjente versjonen nå. */
  readonly newVersionId: string;
  /** Scenen i produksjonen (null for en 2D-scene ingen forekomst bruker). */
  readonly occurrenceId: string | null;
  readonly sceneNumber: string | null;
  readonly compositionId: string | null;
}

/** Den godkjente versjonen av varianten, hvis den er nyere enn `v`. */
function newerApproved(s: ProjectState, v: AssetVersion | undefined): AssetVersion | null {
  if (!v) return null;
  const va = s.assetVariants[v.variantId];
  const a = va?.approvedVersionId ? s.assetVersions[va.approvedVersionId] : undefined;
  return a && a.id !== v.id && a.number > v.number ? a : null;
}

export function assetWorklist(
  s: ProjectState,
  productionId: string,
  opts: { readonly assetId?: string; readonly jobs?: readonly GenerationJob[] } = {},
): WorkItem[] {
  // Scenenummer og forekomst per 2D-scene (variant) i produksjonen
  const occOfVariant = new Map<string, { id: string; number: string | null }>();
  const order = new Map<string, number>();
  orderedOccurrences(s, productionId).forEach((o, i) => {
    occOfVariant.set(o.variantId, { id: o.id, number: sceneNumberOf(s, o) });
    order.set(o.id, i);
  });
  const occInfo = (occurrenceId: string) => {
    const o = s.occurrences[occurrenceId];
    return o ? occOfVariant.get(o.variantId) : undefined;
  };
  const out: WorkItem[] = [];
  const push = (item: WorkItem) => {
    if (opts.assetId && item.assetId !== opts.assetId) return;
    out.push(item);
  };

  // 2D-lag (eget bilde og bildeskifter)
  for (const l of Object.values(s.layers)) {
    if (l.removed || l.assetId === null) continue;
    const comp = s.compositions[l.compositionId];
    if (!comp || comp.removed) continue;
    const reviewed = new Set(l.reviewedVersions ?? []);
    const seen = new Set<string>();
    // Eget bilde, bildeskifter (KI-106) og språkavhengige bilder (KI-173)
    const langs = (l.languageImages ?? []).map((x) => ({
      assetId: s.assetVariants[x.assetVariantId]?.assetId ?? null,
      assetVariantId: x.assetVariantId,
      versionId: x.versionId,
    }));
    for (const img of [l, ...l.swaps, ...langs] as readonly {
      assetId: string | null;
      versionId: string | null;
    }[]) {
      if (img.versionId === null || img.assetId === null) continue;
      const old = s.assetVersions[img.versionId];
      const nu = newerApproved(s, old);
      if (!old || !nu || reviewed.has(nu.id) || seen.has(old.id)) continue;
      seen.add(old.id);
      const occ = occOfVariant.get(comp.variantId);
      push({
        key: `layer:${l.id}:${old.id}`,
        kind: "layer",
        targetId: l.id,
        label: l.name,
        assetId: img.assetId,
        variantId: old.variantId,
        oldVersionId: old.id,
        newVersionId: nu.id,
        occurrenceId: occ?.id ?? null,
        sceneNumber: occ?.number ?? null,
        compositionId: comp.id,
      });
    }
  }

  // Stillbilder og AI-materiale i scenene
  const versionByPath = new Map(Object.values(s.assetVersions).map((v) => [v.mediaPath, v]));
  const jobByResult = new Map(
    (opts.jobs ?? []).filter((j) => j.resultPath).map((j) => [j.resultPath!, j]),
  );
  // Bare versjoner som er i bruk i filmen (eldre forsøk og erstattede stillbilder står ikke på listen)
  const used = new Set<string>();
  // Materiale som en spinoff arver fra hovedfilmen, hører til hovedfilmens liste (endres aldri herfra)
  for (const c of filmClips(s, productionId))
    if (!c.inheritedFrom)
      for (const p of c.parts) if (p.source === "take" && p.take) used.add(p.take.id);
  for (const t of Object.values(s.takes)) {
    if (!t.mediaRef || !used.has(t.id)) continue;
    const info = occInfo(t.occurrenceId);
    if (!info) continue;
    const reviewed = new Set(t.reviewedVersions ?? []);
    const base = {
      targetId: t.id,
      occurrenceId: info.id,
      sceneNumber: info.number,
      compositionId: null,
    };
    if (t.kind === "still") {
      const old = versionByPath.get(t.mediaRef);
      const nu = newerApproved(s, old);
      if (!old || !nu || reviewed.has(nu.id)) continue;
      const va = s.assetVariants[old.variantId];
      push({
        ...base,
        key: `still:${t.id}:${old.id}`,
        kind: "still",
        label: takeLabel(s, t),
        assetId: va?.assetId ?? "",
        variantId: old.variantId,
        oldVersionId: old.id,
        newVersionId: nu.id,
      });
      continue;
    }
    if (t.kind !== "ai_video") continue;
    const trace = traceOf(jobByResult.get(t.mediaRef)?.params);
    if (!trace) continue;
    for (const r of trace.references) {
      const old = r.versionId ? s.assetVersions[r.versionId] : undefined;
      const nu = newerApproved(s, old);
      if (!old || !nu || reviewed.has(nu.id)) continue;
      const va = s.assetVariants[old.variantId];
      push({
        ...base,
        key: `ai:${t.id}:${old.id}`,
        kind: "ai",
        label: takeLabel(s, t),
        assetId: va?.assetId ?? "",
        variantId: old.variantId,
        oldVersionId: old.id,
        newVersionId: nu.id,
      });
    }
  }
  const at = (x: WorkItem) => (x.occurrenceId ? (order.get(x.occurrenceId) ?? 1e9) : 1e9);
  return out.sort((a, b) => at(a) - at(b) || a.label.localeCompare(b.label, "nb"));
}

/** «Behold»: posten er gått gjennom mot den nye versjonen og forsvinner fra listen til neste versjon. */
export function keepWorkItemCommand(s: ProjectState, item: WorkItem): Command | null {
  const prev = (
    item.kind === "layer"
      ? s.layers[item.targetId]?.reviewedVersions
      : s.takes[item.targetId]?.reviewedVersions
  )?.filter((v) => s.assetVersions[v]);
  if (prev === undefined && !(item.kind === "layer" ? s.layers : s.takes)[item.targetId])
    return null;
  return {
    type: "SetReviewedVersions",
    target: item.kind === "layer" ? "layer" : "take",
    id: item.targetId,
    versionIds: [...new Set([...(prev ?? []), item.newVersionId])],
  };
}

/**
 * «Bruk ny versjon» i denne scenen: 2D-laget låses til den nye versjonen (eget bilde og bildeskifter som viste
 * den gamle); et stillbilde blir en ny versjon av scenen med det nye bildet og samme lengde (det gamle
 * beholdes, INV-07). AI-video kan ikke byttes – den må lages på nytt av brukeren (null).
 */
export function newVersionWorkItemCommands(
  s: ProjectState,
  item: WorkItem,
  clip: FilmClip | null,
  newId: () => string,
): Command[] | null {
  if (item.kind === "layer") {
    const l = s.layers[item.targetId];
    if (!l) return null;
    const f = layerFieldsOf(l);
    const swap = <T extends { versionId: unknown; assetVariantId: unknown }>(img: T): T =>
      img.versionId === item.oldVersionId
        ? { ...img, versionId: item.newVersionId as never, assetVariantId: item.variantId as never }
        : img;
    return [
      {
        type: "UpdateLayers",
        layers: [
          {
            layerId: l.id,
            fields: {
              ...swap(f),
              swaps: f.swaps.map((w: ImageSwap) => swap(w)),
              ...(f.languageImages
                ? { languageImages: f.languageImages.map((x: LanguageImage) => swap(x)) }
                : {}),
            },
          },
        ],
      },
    ];
  }
  if (item.kind === "still") {
    const old = s.takes[item.targetId];
    const nu = s.assetVersions[item.newVersionId];
    if (!old || !nu || !clip) return null;
    const takeId = newId();
    const add: Command = {
      type: "AddTake",
      takeId: takeId as never,
      occurrenceId: old.occurrenceId,
      segmentId: old.segmentId,
      kind: "still",
      status: old.status,
      durationFrames: old.durationFrames,
      mediaRef: nu.mediaPath,
    };
    // Delene som viste det gamle bildet, viser det nye; ellers byttes hele versjonen
    const parts = clip.edited ? editableParts(clip, newId) : null;
    if (parts && parts.some((p) => p.takeId === old.id))
      return [
        add,
        {
          type: "SetSceneEdit",
          occurrenceId: old.occurrenceId,
          activeTakeId: null,
          parts: parts.map((p) => (p.takeId === old.id ? { ...p, takeId: takeId as never } : p)),
        },
      ];
    if (s.occurrences[old.occurrenceId]?.activeTakeId === old.id)
      return [
        add,
        { type: "SetActiveTake", occurrenceId: old.occurrenceId, takeId: takeId as never },
      ];
    return [add];
  }
  return null;
}

/** Versjonen av scenen en post gjelder (for visning). */
export function workItemTake(s: ProjectState, item: WorkItem): Take | null {
  return item.kind === "layer" ? null : (s.takes[item.targetId] ?? null);
}
