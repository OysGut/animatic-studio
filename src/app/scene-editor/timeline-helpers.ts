/** Hjelpere for tidslinjen i sceneeditoren (egen fil, så Timeline.tsx bare eksporterer komponenter). */
import { L, localized, type Composition, type CompositionFields, type ProjectState } from "@/core";
import { t, tLocalized } from "@/core/i18n/keyed";

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

const EVENT_KIND: Record<string, string> = tLocalized({ action: "app-scene-editor-timeline-helpers.event-kind.action.4ff6b03edb5b", dialogue: "app-scene-editor-timeline-helpers.event-kind.dialogue.e8af59e63262", shot: "app-scene-editor-timeline-helpers.event-kind.shot.d254223d6442" });

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
      ? `${EVENT_KIND[b.kind] ?? t("app-scene-editor-timeline-helpers.line.message.93ab65010e00")}: ${text.length > 80 ? `${text.slice(0, 78)} …` : text}`
      : t("app-scene-editor-timeline-helpers.line.message.03dafe1bc5bb");
    const mark = {
      id: l.id,
      frame: Math.max(0, Math.round((l.startMs / 1000) * fps)),
      title: t("app-scene-editor-timeline-helpers.title.title.7cd4c52e4752", { line: String(line) }),
    };
    const list = out.get(l.layerId);
    if (list) list.push(mark);
    else out.set(l.layerId, [mark]);
  }
  for (const list of out.values()) list.sort((a, b) => a.frame - b.frame);
  return out;
}
