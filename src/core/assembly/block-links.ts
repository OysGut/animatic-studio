/**
 * Replikkens koblinger (DEC-0072, REQ-0095, REQ-0099): alt en manuslinje er knyttet til – dialogopptak,
 * tidspunkt i scenen, hendelser i 2D-scenen og filmklipp (importert film, AI-video, stillbilde) – samlet,
 * så det kan vises og åpnes fra manuset. Bare lesing; koblingene lages der de hører hjemme.
 */
import type { AudioClip, ProjectState, Take, TimeLink } from "../model";
import { sceneVideoWork } from "../generation/video";
import { coveredBlockIds } from "./discrepancy";
import { filmClips } from "./film";

export interface BlockLinks {
  /** Opptak og innlest lyd for replikken (dialog og forteller). */
  readonly recordings: readonly AudioClip[];
  /** Tidspunkt i scenen (tidskobling uten lag). */
  readonly times: readonly TimeLink[];
  /** Hendelser i 2D-scenen: koblingen og laget. */
  readonly events: readonly { readonly link: TimeLink; readonly layerName: string }[];
  /**
   * Filmklipp som viser linjen. `how`: «coverage» (filmens manusdekning), «segment» (AI-video for segmentet
   * linjen er i) eller «scene» (filmen dekker hele scenen).
   */
  readonly films: readonly {
    readonly take: Take;
    readonly how: "coverage" | "segment" | "scene";
  }[];
  readonly occurrenceIds: readonly string[];
}

export function blockLinks(s: ProjectState, blockId: string, productionId: string): BlockLinks {
  const block = s.blocks[blockId];
  const occurrenceIds = block
    ? Object.values(s.occurrences)
        .filter((o) => o.variantId === block.variantId)
        .map((o) => o.id as string)
    : [];
  const inOcc = new Set(occurrenceIds);
  const recordings = Object.values(s.audioClips)
    .filter((a) => !a.removed && a.blockId === blockId && inOcc.has(a.occurrenceId))
    .sort((a, b) => a.offsetMs - b.offsetMs);
  const links = Object.values(s.timeLinks)
    .filter((l) => !l.removed && l.blockId === blockId)
    .sort((a, b) => a.startMs - b.startMs);
  const times = links.filter((l) => l.layerId === null);
  const events = links
    .filter((l) => l.layerId !== null && s.layers[l.layerId] && !s.layers[l.layerId]!.removed)
    .map((link) => ({ link, layerName: s.layers[link.layerId!]!.name }));

  const films: { take: Take; how: "coverage" | "segment" | "scene" }[] = [];
  if (block) {
    const segmentTakes = new Set<string>();
    // AI-video per segment: segmentinndelingen regnes bare ut når scenen har slik video (dyrt å regne ut)
    const hasSegmentVideo = Object.values(s.takes).some(
      (t) => t.kind === "ai_video" && t.segmentId !== null && inOcc.has(t.occurrenceId),
    );
    const clips = hasSegmentVideo
      ? filmClips(s, productionId).filter((c) => inOcc.has(c.occurrenceId))
      : [];
    for (const clip of clips) {
      const work = sceneVideoWork(s, productionId, clip);
      work.plan.forEach((p, i) => {
        if (!p.blockIds.includes(blockId as never)) return;
        const seg = work.stored[i];
        if (!seg) return;
        for (const t of Object.values(s.takes))
          if (t.kind === "ai_video" && t.segmentId === seg.id && t.mediaRef) segmentTakes.add(t.id);
      });
    }
    for (const t of Object.values(s.takes)) {
      if (!inOcc.has(t.occurrenceId) || !t.mediaRef) continue;
      if (t.kind !== "imported_film" && t.kind !== "ai_video" && t.kind !== "still") continue;
      if (t.coverage) {
        if (coveredBlockIds(s, block.variantId, t.coverage).has(blockId))
          films.push({ take: t, how: "coverage" });
      } else if (segmentTakes.has(t.id)) films.push({ take: t, how: "segment" });
      else if (t.segmentId === null) films.push({ take: t, how: "scene" });
    }
  }
  return { recordings, times, events, films, occurrenceIds };
}
