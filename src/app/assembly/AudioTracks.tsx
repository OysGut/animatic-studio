/**
 * Lydsporene i filmtidslinjen (M4 del 2, mandat 13, DEC-0044): ett spor per lydtype (dialog, forteller,
 * effekter, atmosfære, musikk). Overlappende klipp legges på hver sin linje i sporet. Dra et klipp for å
 * flytte det (det festes til scenen det havner i), dra i kantene for å kutte start og slutt.
 * Lyden spilles også der animasjonen ikke er laget.
 */
import { Link2, Plus, Volume2, VolumeX } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  AUDIO_KIND_LABEL,
  AUDIO_TRACK_ORDER,
  fpsToNumber,
  type AudioKind,
  type FilmAudioItem,
  type FilmClip,
  type ProjectState,
} from "@/core";
import { peaks } from "@/engine/audio/mixer";
import { audioBank } from "@/app/audio/use-audio-playback";
import { TrackLabel, formatSeconds, type TimelineGeometry } from "./FilmTimeline";

const LANE_H = 26;
const DRAG_THRESHOLD = 4;
const SNAP_PX = 8;
const MIN_LEN = 0.05;

/** Farge per lydtype (diagramfargene i designsystemet). */
export const AUDIO_KIND_COLOR: Record<AudioKind, string> = {
  dialogue: "var(--chart-1)",
  narration: "var(--chart-2)",
  sfx: "var(--chart-3)",
  // Gule og oransje toner er holdt av til lyd som løper videre (varmgul, DEC-0045)
  ambience: "oklch(0.72 0.11 305)",
  music: "oklch(0.72 0.13 355)",
};

/** Endring fra tidslinjen: ny start i filmen (s), start i lydfilen og lengde (s). */
export interface AudioChange {
  readonly start: number;
  readonly sourceIn: number;
  readonly length: number;
  /** «move»: flyttet (kan festes til en annen scene). «in»/«out»: kuttet i starten/slutten. */
  readonly mode?: "move" | "in" | "out";
}

type Drag = {
  mode: "move" | "in" | "out";
  id: string;
  px: number;
  x: number;
  started: boolean;
  from: AudioChange;
};

/** Linjer i et spor: hvert klipp får første linje der det ikke overlapper. */
function lanes(items: readonly FilmAudioItem[]): Map<string, number> {
  const ends: number[] = [];
  const out = new Map<string, number>();
  for (const it of items) {
    let lane = ends.findIndex((e) => e <= it.start + 1e-6);
    if (lane < 0) {
      lane = ends.length;
      ends.push(0);
    }
    ends[lane] = it.start + it.length;
    out.set(it.clip.id, lane);
  }
  return out;
}

export function AudioTracks({
  state,
  items,
  clips,
  g,
  frame,
  editable,
  selectedId,
  onSelect,
  onChange,
  onFrame,
  mutedKinds,
  onToggleMute,
  onAdd,
  onOpen,
  loaded,
}: {
  state: ProjectState;
  items: readonly FilmAudioItem[];
  clips: readonly FilmClip[];
  g: TimelineGeometry;
  frame: number;
  editable: boolean;
  selectedId: string | null;
  onSelect: (clipId: string | null) => void;
  onChange: (clipId: string, change: AudioChange) => void;
  onFrame: (f: number) => void;
  mutedKinds: ReadonlySet<AudioKind>;
  onToggleMute: (kind: AudioKind) => void;
  onAdd: (kind: AudioKind) => void;
  /** Dobbeltklikk: åpne lydprofilen (DEC-0045). */
  onOpen: (clipId: string) => void;
  loaded: number;
}) {
  const fps = fpsToNumber(state.project.fps);
  const pps = g.ppf * fps; // piksler per sekund
  const [drag, setDrag] = useState<Drag | null>(null);

  // Utkast mens man drar
  const draft = useMemo((): AudioChange | null => {
    if (!drag || !drag.started) return null;
    const d = (drag.x - drag.px) / pps;
    const f = drag.from;
    const it = items.find((x) => x.clip.id === drag.id);
    const buf = it?.version ? audioBank.get(it.version.mediaPath) : undefined;
    const maxLen = buf ? buf.duration : Infinity;
    // Festepunkter: avspillingshodet, scenestarter og kantene på andre klipp
    const snaps = [frame / fps, ...clips.map((c) => c.startFrame / fps)];
    for (const o of items) if (o.clip.id !== drag.id) snaps.push(o.start, o.start + o.length);
    const snap = (t: number) => {
      let best = t;
      let dist = SNAP_PX / pps;
      for (const s of snaps)
        if (Math.abs(s - t) < dist) {
          dist = Math.abs(s - t);
          best = s;
        }
      return best;
    };
    if (drag.mode === "move") {
      let start = Math.max(0, f.start + d);
      const s1 = snap(start);
      const s2 = snap(start + f.length) - f.length;
      start = Math.abs(s1 - start) <= Math.abs(s2 - start) ? s1 : s2;
      return { ...f, start: Math.max(0, start) };
    }
    if (drag.mode === "in") {
      // Venstre kant: start og start i filmen flyttes sammen; slutten står
      let delta = snap(f.start + d) - f.start;
      delta = Math.max(-f.sourceIn, Math.min(f.length - MIN_LEN, delta));
      delta = Math.max(delta, -f.start);
      return { start: f.start + delta, sourceIn: f.sourceIn + delta, length: f.length - delta };
    }
    let length = snap(f.start + f.length + d) - f.start;
    length = Math.max(MIN_LEN, Math.min(maxLen - f.sourceIn, length));
    return { ...f, length };
  }, [drag, items, pps, frame, fps, clips]);

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

  const byKind = useMemo(() => {
    const m = new Map<AudioKind, FilmAudioItem[]>();
    for (const k of AUDIO_TRACK_ORDER) m.set(k, []);
    for (const it of items) m.get(it.clip.kind)?.push(it);
    return m;
  }, [items]);

  function begin(e: React.PointerEvent<HTMLElement>, it: FilmAudioItem, mode: Drag["mode"]) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    onSelect(it.clip.id);
    if (!editable) return;
    const x = g.xIn(e.clientX);
    setDrag({
      mode,
      id: it.clip.id,
      px: x,
      x,
      started: mode !== "move",
      from: { start: it.start, sourceIn: it.sourceIn, length: it.length },
    });
  }
  function move(e: React.PointerEvent<HTMLElement>) {
    if (!drag) return;
    const x = g.xIn(e.clientX);
    setDrag({ ...drag, x, started: drag.started || Math.abs(x - drag.px) > DRAG_THRESHOLD });
  }
  function end(e: React.PointerEvent<HTMLElement>) {
    e.stopPropagation();
    const d = drag;
    const ch = draft;
    setDrag(null);
    if (!d) return;
    if (!d.started) {
      // Et klikk: avspillingshodet til starten av klippet
      onFrame(Math.round(d.from.start * fps));
      return;
    }
    if (
      ch &&
      (Math.abs(ch.start - d.from.start) > 1e-4 ||
        Math.abs(ch.length - d.from.length) > 1e-4 ||
        Math.abs(ch.sourceIn - d.from.sourceIn) > 1e-4)
    )
      onChange(d.id, { ...ch, mode: d.mode });
  }

  return (
    <div role="group" aria-label="Lydspor">
      {AUDIO_TRACK_ORDER.map((kind) => {
        const list = byKind.get(kind) ?? [];
        const ln = lanes(list);
        const count = Math.max(1, ...[...ln.values()].map((v) => v + 1));
        const h = count * LANE_H + 4;
        const muted = mutedKinds.has(kind);
        return (
          <div key={kind} className="flex border-t border-border/60">
            <TrackLabel height={h}>
              <span
                aria-hidden
                className="mt-1 size-2 shrink-0 rounded-full"
                style={{ background: AUDIO_KIND_COLOR[kind] }}
              />
              <span className="min-w-0 flex-1 truncate">{AUDIO_KIND_LABEL[kind]}</span>
              <button
                type="button"
                onClick={() => onToggleMute(kind)}
                aria-pressed={muted}
                aria-label={
                  muted ? `Slå på ${AUDIO_KIND_LABEL[kind]}` : `Demp ${AUDIO_KIND_LABEL[kind]}`
                }
                title={muted ? "Slå på lyden i sporet" : "Demp sporet (også i eksporten)"}
                className={
                  "rounded-sm p-0.5 hover:bg-surface-3 " +
                  (muted ? "text-status-danger" : "text-text-tertiary hover:text-text-primary")
                }
              >
                {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
              </button>
              {editable ? (
                <button
                  type="button"
                  onClick={() => onAdd(kind)}
                  aria-label={`Legg til ${AUDIO_KIND_LABEL[kind].toLocaleLowerCase("nb")}`}
                  title="Legg til lyd her (ved avspillingshodet)"
                  className="rounded-sm p-0.5 text-text-tertiary hover:bg-surface-3 hover:text-text-primary"
                >
                  <Plus className="size-3.5" />
                </button>
              ) : null}
            </TrackLabel>
            <div
              className={"relative " + (muted ? "opacity-50" : "")}
              style={{ height: h, width: g.trackW }}
              onPointerDown={(e) => {
                if (e.target !== e.currentTarget || e.button !== 0) return;
                onSelect(null);
                onFrame(Math.max(0, Math.floor((g.xIn(e.clientX) - g.pad) / g.ppf)));
              }}
            >
              {list.map((it) => {
                const ch = draft && drag?.id === it.clip.id ? draft : null;
                const start = ch?.start ?? it.start;
                const length = ch?.length ?? it.length;
                const sourceIn = ch?.sourceIn ?? it.sourceIn;
                return (
                  <AudioBlock
                    key={it.clip.id}
                    item={it}
                    left={start * pps}
                    width={Math.max(3, length * pps)}
                    top={(ln.get(it.clip.id) ?? 0) * LANE_H + 2}
                    sourceIn={sourceIn}
                    length={length}
                    selected={selectedId === it.clip.id}
                    dragging={drag?.id === it.clip.id && drag.started}
                    editable={editable}
                    loaded={loaded}
                    blockText={
                      it.clip.blockId ? (state.blocks[it.clip.blockId]?.text ?? null) : null
                    }
                    onDown={begin}
                    onMove={move}
                    onUp={end}
                    onCancel={() => setDrag(null)}
                    onOpen={onOpen}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
      {drag?.started && draft ? (
        <p role="status" className="sr-only">
          {formatSeconds(draft.start)} – {formatSeconds(draft.start + draft.length)}
        </p>
      ) : null}
    </div>
  );
}

const AudioBlock = memo(function AudioBlock({
  item,
  left,
  width,
  top,
  sourceIn,
  length,
  selected,
  dragging,
  editable,
  loaded,
  blockText,
  onDown,
  onMove,
  onUp,
  onCancel,
  onOpen,
}: {
  item: FilmAudioItem;
  left: number;
  width: number;
  top: number;
  sourceIn: number;
  length: number;
  selected: boolean;
  dragging: boolean;
  editable: boolean;
  loaded: number;
  blockText: string | null;
  onDown: (e: React.PointerEvent<HTMLElement>, it: FilmAudioItem, mode: Drag["mode"]) => void;
  onMove: (e: React.PointerEvent<HTMLElement>) => void;
  onUp: (e: React.PointerEvent<HTMLElement>) => void;
  onCancel: () => void;
  onOpen: (clipId: string) => void;
}) {
  const c = item.clip;
  // Lyd som løper videre over flere scener er varmgul (DEC-0045)
  const color = c.continues ? "var(--accent-warm)" : AUDIO_KIND_COLOR[c.kind];
  const missing = item.version === null;
  const failed = item.version ? audioBank.hasFailed(item.version.mediaPath) : false;
  const label = c.name || "Lyd";
  const edge = Math.min(6, Math.floor(width / 4));
  return (
    <div
      role="button"
      tabIndex={selected ? 0 : -1}
      aria-pressed={selected}
      aria-label={`${label}, ${formatSeconds(length)}${c.continues ? ", løper videre" : ""}${c.muted ? ", dempet" : ""}${
        blockText ? `, replikk: ${blockText.slice(0, 60)}` : ""
      }`}
      title={`${label}\n${formatSeconds(length)}${
        blockText ? `\nReplikk: ${blockText.slice(0, 120)}` : ""
      }${missing ? "\nLydfilen mangler" : failed ? "\nLydfilen kunne ikke leses" : ""}${
        c.continues ? "\nLøper videre over flere scener" : ""
      }${editable ? "\nDra for å flytte, dra i kantene for å kutte" : ""}\nDobbeltklikk for lydprofil og volumpunkter`}
      onPointerDown={(e) => onDown(e, item, "move")}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onCancel}
      onLostPointerCapture={onCancel}
      onDoubleClick={() => onOpen(c.id)}
      style={{
        left,
        width,
        top,
        height: LANE_H - 4,
        borderColor: selected ? undefined : `color-mix(in oklab, ${color} 55%, transparent)`,
        background: `color-mix(in oklab, ${color} 18%, var(--surface-2))`,
      }}
      className={
        "group absolute flex touch-none select-none items-center overflow-hidden rounded-sm border text-left " +
        (editable ? "cursor-grab active:cursor-grabbing " : "cursor-pointer ") +
        (selected ? "z-10 border-accent-brand outline outline-1 outline-accent-brand " : "") +
        (dragging ? "z-20 opacity-90 shadow-[var(--shadow-float)] " : "") +
        (c.muted || missing || failed ? "opacity-50 " : "")
      }
    >
      {width >= 24 && item.version ? (
        <Wave
          path={item.version.mediaPath}
          sourceIn={sourceIn}
          length={length}
          width={Math.round(width)}
          height={LANE_H - 6}
          color={color}
          loaded={loaded}
        />
      ) : null}
      {width >= 40 ? (
        <span className="relative z-[1] flex min-w-0 items-center gap-1 px-1.5 text-[11px] text-text-primary [text-shadow:0_0_3px_var(--surface-1)]">
          {c.blockId ? <Link2 className="size-3 shrink-0" aria-hidden /> : null}
          <span className="truncate">{label}</span>
          {c.continues ? (
            <span className="shrink-0 text-[10px] text-accent-warm" aria-hidden>
              →
            </span>
          ) : null}
        </span>
      ) : null}
      {editable && width >= 14 ? (
        <>
          <div
            aria-hidden
            onPointerDown={(e) => onDown(e, item, "in")}
            onPointerMove={(e) => {
              e.stopPropagation();
              onMove(e);
            }}
            onPointerUp={onUp}
            style={{ width: edge }}
            className="absolute left-0 top-0 z-[2] h-full cursor-ew-resize hover:bg-accent-brand/50"
          />
          <div
            aria-hidden
            onPointerDown={(e) => onDown(e, item, "out")}
            onPointerMove={(e) => {
              e.stopPropagation();
              onMove(e);
            }}
            onPointerUp={onUp}
            style={{ width: edge }}
            className="absolute right-0 top-0 z-[2] h-full cursor-ew-resize hover:bg-accent-brand/50"
          />
        </>
      ) : null}
    </div>
  );
});

/** Bølgeform for utsnittet av lydfilen klippet spiller. */
export function Wave({
  path,
  sourceIn,
  length,
  width,
  height,
  color,
  loaded,
}: {
  path: string;
  sourceIn: number;
  length: number;
  width: number;
  height: number;
  color: string;
  loaded: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    const buf = audioBank.get(path);
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    // Lange klipp: bølgeformen tegnes i høyst 4000 punkter
    const w = Math.min(4000, Math.max(1, Math.round(width * dpr)));
    c.width = w;
    c.height = Math.round(height * dpr);
    ctx.clearRect(0, 0, c.width, c.height);
    if (!buf) return;
    const col = getComputedStyle(c).color || "#888";
    ctx.fillStyle = col;
    const p = peaks(buf, sourceIn, sourceIn + length, Math.ceil(w / 2));
    const mid = c.height / 2;
    const bw = w / p.length;
    for (let i = 0; i < p.length; i++) {
      const v = Math.max(0.5, p[i]! * mid * 0.95);
      ctx.fillRect(i * bw, mid - v, Math.max(1, bw - 0.5), v * 2);
    }
  }, [path, sourceIn, length, width, height, loaded]);
  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{ width, height, color }}
      className="pointer-events-none absolute inset-y-px left-0 opacity-60"
    />
  );
}
