/**
 * Filmtidslinjen (M4 del 1, mandat 15.1–15.2, DEC-0043): ett klipp per aktiv scene, i samme rekkefølge som
 * manuset. Dra et klipp for å flytte scenen (samme kommando som i manuset, REQ-0228), dra i høyre kant av en
 * 2D-scene for å endre lengden (REQ-0224). Å endre lengden sletter aldri manus (REQ-0230).
 */
import { Clapperboard, Layers } from "lucide-react";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  formatHeading,
  formatTimecode,
  fpsToNumber,
  framesToSeconds,
  secondsToFrames,
  MIN_DURATION_SECONDS,
  type FilmClip,
  type ProjectState,
} from "@/core";
import { drawFilmFrame } from "@/engine/compositor/film";
import { PaneResizer, usePaneSize } from "@/app/shell/pane-size";
import { RulerTicks } from "@/app/scene-editor/Timeline";
import { filmImageCache } from "./film-images";

const PAD = 12;
const RULER_H = 20;
const CLIP_H = 64;
const MAX_ZOOM = 200;
const DRAG_THRESHOLD = 4;

export interface FilmTimelineProps {
  state: ProjectState;
  clips: readonly FilmClip[];
  durationFrames: number;
  frame: number;
  playing: boolean;
  onFrame: (f: number) => void;
  selectedId: string | null;
  onSelect: (occurrenceId: string) => void;
  onOpen: (occurrenceId: string) => void;
  editable: boolean;
  /** Flytt scenen til plass `index` blant klippene (før flyttingen). */
  onMove: (occurrenceId: string, index: number) => void;
  /** Ny lengde for scenens 2D-scene. */
  onDuration: (occurrenceId: string, frames: number) => void;
  tick: number;
  /** Verktøylinjen over sporet (transport m.m.). */
  toolbar: ReactNode;
}

type Drag =
  | { kind: "move"; id: string; px: number; started: boolean; x: number }
  | { kind: "trim"; id: string; px: number; from: number; frames: number };

export function FilmTimeline(p: FilmTimelineProps) {
  const { clips, durationFrames, frame } = p;
  const fps = p.state.project.fps;
  const fpsN = fpsToNumber(fps);
  const [height, setHeight] = usePaneSize("assembly-timeline", 210, 140, 520, { axis: "y" });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [viewW, setViewW] = useState(800);
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<Drag | null>(null);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Lengde mens man drar i kanten (vises før den lagres)
  const shown = useMemo(() => {
    if (drag?.kind !== "trim") return clips;
    let cursor = 0;
    return clips.map((c) => {
      const d = c.occurrenceId === drag.id ? drag.frames : c.durationFrames;
      const out = { ...c, startFrame: cursor, durationFrames: d };
      cursor += d;
      return out;
    });
  }, [clips, drag]);
  const shownDuration = shown.length
    ? shown[shown.length - 1]!.startFrame + shown[shown.length - 1]!.durationFrames
    : 0;

  const fitPpf = Math.max(0.002, (viewW - 2 * PAD) / Math.max(1, durationFrames));
  const ppf = fitPpf * zoom;
  const trackW = Math.max(1, shownDuration) * ppf;

  const frameFromX = (clientX: number) => {
    const el = scrollRef.current;
    if (!el) return 0;
    const x = clientX - el.getBoundingClientRect().left + el.scrollLeft - PAD;
    return Math.max(0, Math.min(durationFrames - 1, Math.floor(x / ppf)));
  };

  // Hold avspillingshodet synlig under avspilling
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !p.playing) return;
    const x = PAD + frame * ppf;
    if (x < el.scrollLeft + 24 || x > el.scrollLeft + el.clientWidth - 24)
      el.scrollLeft = Math.max(0, x - el.clientWidth * 0.2);
  }, [frame, ppf, p.playing]);

  // Plass klippet havner på mens det dras (indeks blant klippene, 0 … antall)
  const dropIndex = useMemo(() => {
    if (drag?.kind !== "move" || !drag.started) return null;
    const pos = (drag.x - PAD) / ppf;
    let i = 0;
    while (i < clips.length && clips[i]!.startFrame + clips[i]!.durationFrames / 2 < pos) i++;
    return i;
  }, [drag, clips, ppf]);
  const dragFrom = drag?.kind === "move" ? clips.findIndex((c) => c.occurrenceId === drag.id) : -1;
  const dropChanges = dropIndex !== null && dropIndex !== dragFrom && dropIndex !== dragFrom + 1;

  const xIn = (clientX: number) => {
    const el = scrollRef.current;
    return el ? clientX - el.getBoundingClientRect().left + el.scrollLeft : 0;
  };

  function endDrag(commit: boolean) {
    const d = drag;
    setDrag(null);
    if (!d || !commit) return;
    if (d.kind === "move" && d.started && dropIndex !== null && dropChanges)
      p.onMove(d.id, dropIndex);
    if (d.kind === "trim" && d.frames !== d.from) p.onDuration(d.id, d.frames);
  }

  useEffect(() => {
    if (!drag) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setDrag(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [drag]);

  const minFrames = secondsToFrames(MIN_DURATION_SECONDS, fps);

  return (
    <div
      role="region"
      aria-label="Filmtidslinje"
      style={{ height }}
      className="relative flex shrink-0 flex-col border-t border-border bg-surface-1"
    >
      <PaneResizer
        edge="top"
        size={height}
        onSize={setHeight}
        min={140}
        max={520}
        label="Høyde på filmtidslinjen"
      />
      <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-x-1.5 gap-y-1 border-b border-border px-2 py-1">
        {p.toolbar}
        <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2 text-xs text-text-tertiary">
          Zoom
          <input
            type="range"
            aria-label="Zoom filmtidslinjen"
            min={1}
            max={MAX_ZOOM}
            step={0.5}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-1 w-24 accent-[var(--accent-brand)]"
          />
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="rounded-sm px-1 text-text-secondary hover:bg-surface-3 hover:text-text-primary"
            title="Vis hele filmen"
          >
            Hele filmen
          </button>
        </span>
      </div>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
        <div className="relative h-full" style={{ width: trackW + 2 * PAD }}>
          {/* Linjal: klikk eller dra for å flytte avspillingshodet */}
          <div
            className="relative cursor-col-resize touch-none border-b border-border"
            style={{ height: RULER_H, marginLeft: PAD, width: trackW }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              p.onFrame(frameFromX(e.clientX));
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) p.onFrame(frameFromX(e.clientX));
            }}
          >
            <RulerTicks ppf={ppf} durationFrames={shownDuration} fps={fpsN} />
          </div>

          {/* Klippene */}
          <div
            role="group"
            aria-label="Scener i filmen"
            className="relative"
            style={{ height: CLIP_H, marginLeft: PAD, marginTop: 10, width: trackW }}
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) p.onFrame(frameFromX(e.clientX));
            }}
          >
            {shown.map((c, i) => (
              <ClipBlock
                key={c.occurrenceId}
                state={p.state}
                clip={c}
                index={i}
                ppf={ppf}
                selected={c.occurrenceId === p.selectedId}
                dragging={drag?.kind === "move" && drag.started && drag.id === c.occurrenceId}
                dragOffset={
                  drag?.kind === "move" && drag.started && drag.id === c.occurrenceId
                    ? drag.x - drag.px
                    : 0
                }
                trimmable={p.editable && c.source === "composition"}
                movable={p.editable}
                tick={p.tick}
                onPointerDownBody={(e) => {
                  if (e.button !== 0) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const x = xIn(e.clientX);
                  p.onSelect(c.occurrenceId);
                  setDrag({ kind: "move", id: c.occurrenceId, px: x, started: false, x });
                }}
                onPointerDownEdge={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  p.onSelect(c.occurrenceId);
                  setDrag({
                    kind: "trim",
                    id: c.occurrenceId,
                    px: xIn(e.clientX),
                    from: c.durationFrames,
                    frames: c.durationFrames,
                  });
                }}
                onPointerMove={(e) => {
                  const d = drag;
                  if (!d || d.id !== c.occurrenceId) return;
                  const x = xIn(e.clientX);
                  if (d.kind === "move") {
                    const started = d.started || Math.abs(x - d.px) > DRAG_THRESHOLD;
                    if (started && !p.editable) return;
                    setDrag({ ...d, started, x });
                  } else {
                    const frames = Math.max(minFrames, Math.round(d.from + (x - d.px) / ppf));
                    setDrag({ ...d, frames });
                  }
                }}
                onPointerUp={() => {
                  const d = drag;
                  if (d?.kind === "move" && !d.started) {
                    // Et vanlig klikk: gå til scenen
                    p.onFrame(c.startFrame);
                    setDrag(null);
                    return;
                  }
                  endDrag(true);
                }}
                onPointerCancel={() => setDrag(null)}
                onDoubleClick={() => p.onOpen(c.occurrenceId)}
              />
            ))}
            {dropIndex !== null && dropChanges ? (
              <div
                aria-hidden
                className="pointer-events-none absolute -top-1 z-20 w-0.5 rounded-full bg-accent-brand"
                style={{
                  height: CLIP_H + 8,
                  left:
                    (dropIndex < clips.length
                      ? clips[dropIndex]!.startFrame
                      : (clips[clips.length - 1]?.startFrame ?? 0) +
                        (clips[clips.length - 1]?.durationFrames ?? 0)) *
                      ppf -
                    1,
                }}
              />
            ) : null}
          </div>

          {drag?.kind === "trim" ? (
            <p
              role="status"
              className="pointer-events-none absolute z-30 rounded-sm bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-text-primary shadow"
              style={{ left: drag.px + 8, top: RULER_H + 2 }}
            >
              {formatSeconds(framesToSeconds(drag.frames, fps))}
            </p>
          ) : null}

          {/* Avspillingshodet */}
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 z-10 h-full w-px bg-accent-brand"
            style={{ left: PAD + frame * ppf }}
          >
            <div className="absolute -left-[5px] top-0 size-2.5 rounded-b-sm bg-accent-brand" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function formatSeconds(s: number): string {
  const r = Math.round(s * 10) / 10;
  if (r < 60) return `${r.toLocaleString("nb-NO")} s`;
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

const ClipBlock = memo(function ClipBlock({
  state,
  clip,
  index,
  ppf,
  selected,
  dragging,
  dragOffset,
  trimmable,
  movable,
  tick,
  onPointerDownBody,
  onPointerDownEdge,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onDoubleClick,
}: {
  state: ProjectState;
  clip: FilmClip;
  index: number;
  ppf: number;
  selected: boolean;
  dragging: boolean;
  dragOffset: number;
  trimmable: boolean;
  movable: boolean;
  tick: number;
  onPointerDownBody: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerDownEdge: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: () => void;
  onDoubleClick: () => void;
}) {
  const w = Math.max(3, clip.durationFrames * ppf);
  const placeholder = clip.source === "placeholder";
  const heading = formatHeading(clip.heading);
  const seconds = framesToSeconds(clip.durationFrames, state.project.fps);
  const showThumb = !placeholder && w >= 110;
  const showText = w >= 46;
  return (
    <div
      role="button"
      aria-pressed={selected}
      tabIndex={selected ? 0 : -1}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          onDoubleClick();
        }
      }}
      aria-label={`Scene ${clip.productionNumber ?? index + 1}: ${heading}, ${formatSeconds(seconds)}${
        placeholder ? ", uten 2D-scene" : ""
      }`}
      title={`${clip.productionNumber ?? ""} ${heading}\n${formatSeconds(seconds)}${
        clip.durationKind === "estimate" ? " (beregnet fra manus)" : ""
      }${placeholder ? "\nIngen 2D-scene ennå – vises som tittelkort" : ""}\n${
        movable ? "Dra for å flytte scenen. " : ""
      }Dobbeltklikk for å åpne i sceneeditoren.`}
      onPointerDown={onPointerDownBody}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
      onDoubleClick={onDoubleClick}
      style={{
        left: clip.startFrame * ppf,
        width: w,
        height: CLIP_H,
        transform: dragOffset ? `translateX(${dragOffset}px)` : undefined,
      }}
      className={
        "group absolute top-0 flex touch-none select-none overflow-hidden rounded-sm border text-left " +
        (movable ? "cursor-grab active:cursor-grabbing " : "cursor-pointer ") +
        (placeholder
          ? "border-dashed border-border-control bg-surface-2 "
          : "border-border-strong bg-surface-3 ") +
        (selected ? "z-10 outline outline-2 -outline-offset-1 outline-accent-brand " : "") +
        (dragging ? "z-20 opacity-80 shadow-[var(--shadow-float)] " : "")
      }
    >
      {showThumb ? <Thumb state={state} clip={clip} tick={tick} /> : null}
      {showText ? (
        <div className="flex min-w-0 flex-1 flex-col justify-between px-1.5 py-1">
          <div className="flex min-w-0 items-center gap-1">
            <span className="shrink-0 font-mono text-[10px] text-text-tertiary">
              {clip.productionNumber ?? "–"}
            </span>
            {placeholder ? (
              <Clapperboard className="size-3 shrink-0 text-text-tertiary" aria-hidden />
            ) : (
              <Layers className="size-3 shrink-0 text-accent-brand" aria-hidden />
            )}
          </div>
          <span className="truncate text-[11px] leading-tight text-text-primary">{heading}</span>
          <span
            className={
              "truncate font-mono text-[10px] " +
              (clip.durationKind === "estimate"
                ? "italic text-text-tertiary"
                : "text-text-secondary")
            }
          >
            {clip.durationKind === "estimate" ? "≈ " : ""}
            {formatSeconds(seconds)}
          </span>
        </div>
      ) : null}
      {trimmable && w >= 14 ? (
        <div
          aria-hidden
          title="Dra for å endre lengden på scenen (eller skriv lengden i panelet til høyre)"
          onPointerDown={onPointerDownEdge}
          onPointerMove={(e) => {
            e.stopPropagation();
            onPointerMove(e);
          }}
          onPointerUp={(e) => {
            // Ellers når hendelsen også klippet, og lengden lagres to ganger
            e.stopPropagation();
            onPointerUp(e);
          }}
          onPointerCancel={onPointerCancel}
          style={{ width: Math.min(6, Math.floor(w / 4)) }}
          className="absolute right-0 top-0 h-full cursor-ew-resize bg-transparent hover:bg-accent-brand/50 group-hover:bg-border-control"
        />
      ) : null}
    </div>
  );
});

/** Miniatyr: første bilde i scenen. */
function Thumb({ state, clip, tick }: { state: ProjectState; clip: FilmClip; tick: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const comp = clip.compositionId ? state.compositions[clip.compositionId] : undefined;
  const h = CLIP_H - 2;
  const w = Math.round((h * state.project.frameWidth) / state.project.frameHeight);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    drawFilmFrame(ctx, state, [{ ...clip, startFrame: 0 }], 0, {
      width: c.width,
      height: c.height,
      images: filmImageCache.images,
    });
    // Tegnes på nytt når 2D-scenen, lagene eller bildene endres
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comp, state.layers, tick, w, h]);
  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{ width: w, height: h }}
      className="pointer-events-none shrink-0 border-r border-border bg-black"
    />
  );
}
