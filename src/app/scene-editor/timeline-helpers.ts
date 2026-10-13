/** Hjelpere for tidslinjen i sceneeditoren (egen fil, så Timeline.tsx bare eksporterer komponenter). */
import type { Composition, CompositionFields, ProjectState } from "@/core";

export function compositionFieldsOf(c: Composition): CompositionFields {
  return {
    name: c.name,
    width: c.width,
    height: c.height,
    durationFrames: c.durationFrames,
    background: c.background,
  };
}

/** En hendelse i manuset koblet til laget (DEC-0051, KI-86): tegnes som merke på lagets linje. */
export interface LayerEventMark {
  readonly id: string;
  readonly frame: number;
  /** Verktøytipset: den koblede manuslinjen. */
  readonly title: string;
}

const EVENT_KIND: Record<string, string> = {
  action: "Handling",
  dialogue: "Replikk",
  shot: "Bilde",
};

/** Hendelsene per lag i 2D-scenens egen tid (bilder), sortert. Fjernede koblinger er ikke med. */
export function layerEventMarks(
  state: ProjectState,
  fps: number,
): ReadonlyMap<string, readonly LayerEventMark[]> {
  const out = new Map<string, LayerEventMark[]>();
  for (const l of Object.values(state.timeLinks)) {
    if (l.removed || !l.layerId) continue;
    const b = state.blocks[l.blockId];
    const text = b ? b.text.replace(/\s+/g, " ").trim() : "";
    const line = b
      ? `${EVENT_KIND[b.kind] ?? "Manus"}: ${text.length > 80 ? `${text.slice(0, 78)} …` : text}`
      : "Manuslinjen er borte";
    const mark = {
      id: l.id,
      frame: Math.max(0, Math.round((l.startMs / 1000) * fps)),
      title: `Hendelse – ${line}`,
    };
    const list = out.get(l.layerId);
    if (list) list.push(mark);
    else out.set(l.layerId, [mark]);
  }
  for (const list of out.values()) list.sort((a, b) => a.frame - b.frame);
  return out;
}
