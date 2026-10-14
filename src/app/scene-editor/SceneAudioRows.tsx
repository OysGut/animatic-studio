/**
 * Lyden i scenen som rader under lagene i sceneeditorens tidslinje (DEC-0045): bølgeformene ligger på
 * samme tidsakse som nøkkelbilder og kamerautsnitt, så bevegelser kan treffe lyden. Lyd som løper videre
 * inn fra en tidligere scene vises også. Dobbeltklikk åpner lydprofilen.
 *
 * Dra et klipp for å flytte det i scenen, og dra i kantene for å kutte start og slutt (Mars 2026-10-13,
 * DEC-0079). Lyd som løper inn fra en annen scene flyttes i scenen den hører til.
 */
import { useState } from "react";
import {
  AUDIO_KIND_LABEL,
  L,
  type AudioClipFields,
  type FilmAudioItem,
  type ProjectState,
} from "@/core";
import { audioBank } from "@/app/audio/use-audio-playback";
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
  onChange,
}: {
  state: ProjectState;
  occurrenceId: string;
  /** Lyden i scenen, med start fra scenens begynnelse (kan være negativ for lyd som løper inn). */
  items: readonly FilmAudioItem[];
  g: TimelineRowGeometry;
  loaded: number;
  onFrame: (f: number) => void;
  onOpen: (clipId: string) => void;
  /** Flytt eller kutt et klipp (null: kan ikke endres). */
  onChange?: ((clipId: string, label: string, patch: Partial<AudioClipFields>) => void) | null;
}) {
  const [drag, setDrag] = useState<{
    id: string;
    mode: "move" | "in" | "out";
    x0: number;
    dx: number;
  } | null>(null);
  if (items.length === 0) return null;
  const pps = g.ppf * g.fps;
  /** Endringen et drag gir (ms), avgrenset av lydfilen og scenens start. */
  const draftOf = (it: FilmAudioItem, mode: "move" | "in" | "out", dxPx: number) => {
    const c = it.clip;
    const sp = it.speed ?? 1;
    const dMs = Math.round((dxPx / pps) * 1000);
    const fileMs = it.version
      ? (audioBank.get(it.version.mediaPath)?.duration ?? Infinity) * 1000
      : Infinity;
    if (mode === "move") return { offsetMs: Math.max(0, c.offsetMs + dMs) };
    if (mode === "in") {
      const d = Math.max(-c.offsetMs, -c.sourceInMs / sp, Math.min(c.lengthMs - 50, dMs));
      return {
        offsetMs: Math.round(c.offsetMs + d),
        sourceInMs: Math.round(c.sourceInMs + d * sp),
        lengthMs: Math.round(c.lengthMs - d),
      };
    }
    const max = (fileMs - c.sourceInMs) / sp;
    return { lengthMs: Math.round(Math.max(50, Math.min(max, c.lengthMs + dMs))) };
  };
  return (
    <div role="group" aria-label={L("Lyd i scenen", "Audio in the scene")}>
      {items.map((it) => {
        const c = it.clip;
        const incoming = c.occurrenceId !== occurrenceId;
        const color = c.continues ? "var(--accent-warm)" : AUDIO_KIND_COLOR[c.kind];
        const movable = !!onChange && !incoming;
        // Under dra: vis klippet der det havner
        const d =
          drag?.id === c.id && Math.abs(drag.dx) > 3 ? draftOf(it, drag.mode, drag.dx) : null;
        const start = d?.offsetMs !== undefined ? d.offsetMs / 1000 : it.start;
        const len = d?.lengthMs !== undefined ? d.lengthMs / 1000 : it.length;
        // Bare delen som ligger i scenen vises
        const from = Math.max(0, start);
        const visible = start + len - from;
        const fromScene = incoming ? state.occurrences[c.occurrenceId]?.productionNumber : null;
        return (
          <div key={c.id} className="flex border-b border-border/60" style={{ height: g.rowH }}>
            <div
              className="sticky left-0 z-20 flex shrink-0 items-center gap-1.5 border-r border-border bg-surface-1 px-2 text-[12px] text-text-secondary"
              style={{ width: g.labelW }}
              title={`${c.name || L("Lyd", "Audio")} – ${AUDIO_KIND_LABEL[c.kind]}${
                incoming
                  ? L(
                      `, løper inn fra scene ${fromScene ?? ""}`,
                      `, runs in from scene ${fromScene ?? ""}`,
                    )
                  : ""
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
                onClick={() => {
                  if (!drag) onFrame(Math.round(from * g.fps));
                }}
                onDoubleClick={() => onOpen(c.id)}
                onPointerDown={(e) => {
                  if (!movable || e.button !== 0) return;
                  const r = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - r.left;
                  const mode = x < 6 ? "in" : x > r.width - 6 ? "out" : "move";
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setDrag({ id: c.id, mode, x0: e.clientX, dx: 0 });
                }}
                onPointerMove={(e) => {
                  if (drag?.id === c.id) setDrag({ ...drag, dx: e.clientX - drag.x0 });
                }}
                onPointerUp={() => {
                  const dr = drag;
                  if (!dr || dr.id !== c.id) return;
                  // Et klikk (ikke et drag) går til starten; drag lagres som én endring
                  setTimeout(() => setDrag(null), 0);
                  if (Math.abs(dr.dx) <= 3 || !onChange) return;
                  onChange(
                    c.id,
                    dr.mode === "move"
                      ? L("Flytt lyd", "Move audio")
                      : dr.mode === "in"
                        ? L("Kutt starten av lyden", "Cut the start of the audio")
                        : L("Kutt slutten av lyden", "Cut the end of the audio"),
                    draftOf(it, dr.mode, dr.dx),
                  );
                }}
                onKeyDown={(e) => {
                  if (!movable || (e.key !== "ArrowLeft" && e.key !== "ArrowRight") || !onChange)
                    return;
                  e.preventDefault();
                  const step = Math.round(1000 / g.fps) * (e.shiftKey ? 10 : 1);
                  onChange(c.id, L("Flytt lyd", "Move audio"), {
                    offsetMs: Math.max(0, c.offsetMs + (e.key === "ArrowLeft" ? -step : step)),
                  });
                }}
                title={`${c.name || L("Lyd", "Audio")}\n${L(
                  "Klikk: gå til starten. Dra: flytt. Dra i kantene: kutt. Dobbeltklikk: lydprofil, hastighet og masker",
                  "Click: go to the start. Drag: move. Drag the edges: cut. Double-click: audio profile, speed and masks",
                )}`}
                aria-label={`${c.name || L("Lyd", "Audio")}, ${AUDIO_KIND_LABEL[c.kind]}`}
                className={
                  "absolute top-[3px] flex touch-none overflow-hidden rounded-sm border text-left " +
                  (movable ? "cursor-grab active:cursor-grabbing " : "") +
                  (d ? "z-10 shadow-[var(--shadow-float)] " : "") +
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
                    sourceIn={it.sourceIn + (from - it.start) * (it.speed ?? 1)}
                    length={visible * (it.speed ?? 1)}
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
