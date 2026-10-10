/**
 * Lyden i scenen som rader under lagene i sceneeditorens tidslinje (DEC-0045): bølgeformene ligger på
 * samme tidsakse som nøkkelbilder og kamerautsnitt, så bevegelser kan treffe lyden. Lyd som løper videre
 * inn fra en tidligere scene vises også. Dobbeltklikk åpner lydprofilen.
 */
import { AUDIO_KIND_LABEL, type FilmAudioItem, type ProjectState } from "@/core";
import { AUDIO_KIND_COLOR, Wave } from "@/app/assembly/AudioTracks";
import type { TimelineRowGeometry } from "./Timeline";

export function SceneAudioRows({
  state,
  occurrenceId,
  items,
  g,
  loaded,
  onFrame,
  onOpen,
}: {
  state: ProjectState;
  occurrenceId: string;
  /** Lyden i scenen, med start fra scenens begynnelse (kan være negativ for lyd som løper inn). */
  items: readonly FilmAudioItem[];
  g: TimelineRowGeometry;
  loaded: number;
  onFrame: (f: number) => void;
  onOpen: (clipId: string) => void;
}) {
  if (items.length === 0) return null;
  const pps = g.ppf * g.fps;
  return (
    <div role="group" aria-label="Lyd i scenen">
      {items.map((it) => {
        const c = it.clip;
        const incoming = c.occurrenceId !== occurrenceId;
        const color = c.continues ? "var(--accent-warm)" : AUDIO_KIND_COLOR[c.kind];
        // Bare delen som ligger i scenen vises
        const from = Math.max(0, it.start);
        const visible = it.start + it.length - from;
        const fromScene = incoming ? state.occurrences[c.occurrenceId]?.productionNumber : null;
        return (
          <div key={c.id} className="flex border-b border-border/60" style={{ height: g.rowH }}>
            <div
              className="sticky left-0 z-20 flex shrink-0 items-center gap-1.5 border-r border-border bg-surface-1 px-2 text-[12px] text-text-secondary"
              style={{ width: g.labelW }}
              title={`${c.name || "Lyd"} – ${AUDIO_KIND_LABEL[c.kind]}${
                incoming ? `, løper inn fra scene ${fromScene ?? ""}` : ""
              }`}
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ background: color }}
              />
              <span className="min-w-0 truncate">
                {incoming ? "← " : ""}
                {c.name || AUDIO_KIND_LABEL[c.kind]}
              </span>
            </div>
            <div style={{ width: g.gutter }} className="shrink-0" aria-hidden="true" />
            <div className="relative" style={{ height: g.rowH, flex: "1 0 auto" }}>
              <button
                type="button"
                onClick={() => onFrame(Math.round(from * g.fps))}
                onDoubleClick={() => onOpen(c.id)}
                title={`${c.name || "Lyd"}\nKlikk: gå til starten. Dobbeltklikk: lydprofil og volumpunkter`}
                aria-label={`${c.name || "Lyd"}, ${AUDIO_KIND_LABEL[c.kind]}`}
                className={
                  "absolute top-[3px] flex overflow-hidden rounded-sm border text-left " +
                  (c.muted ? "opacity-50" : "")
                }
                style={{
                  left: from * pps,
                  width: Math.max(3, visible * pps),
                  height: g.rowH - 6,
                  borderColor: `color-mix(in oklab, ${color} 55%, transparent)`,
                  background: `color-mix(in oklab, ${color} 16%, var(--surface-2))`,
                }}
              >
                {it.version && visible * pps >= 24 ? (
                  <Wave
                    path={it.version.mediaPath}
                    sourceIn={it.sourceIn + (from - it.start)}
                    length={visible}
                    width={Math.round(visible * pps)}
                    height={g.rowH - 8}
                    color={color}
                    loaded={loaded}
                  />
                ) : null}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
