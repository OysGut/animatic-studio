/**
 * Tidslinjen i sceneeditoren (mandat 11.3 og 12.5): avspilling, nøkkelbilder, hastighetskurver, varighet og
 * kamerautsnitt. Hver redigering er én kommando; dra-operasjoner viser et lokalt utkast og lagrer ved slipp.
 * Under avspilling endres bare avspillingshodet (radene er memoisert).
 */
import type { CSSProperties } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Diamond,
  Pause,
  Play,
  Repeat,
  SkipBack,
  SkipForward,
  Video,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  EASINGS,
  MAX_DURATION_SECONDS,
  MIN_DURATION_SECONDS,
  fpsToNumber,
  formatTimecode,
  framesToSeconds,
  keyAllAt,
  keyframeFrames,
  layerFieldsOf,
  layersOf,
  moveKeyframes,
  newShot,
  removeKeyframesAt,
  secondsToFrames,
  setKeyframeEasing,
  setKeyframeEase,
  EASE_STRENGTH,
  withShot,
  type CameraShot,
  type Command,
  type Composition,
  type CompositionCamera,
  type CompositionFields,
  type CompositionLayer,
  type Easing,
  type ProjectState,
  freeShotSlot,
  newId,
  L,
  localized,
} from "@/core";
import { PaneResizer, usePaneSize } from "@/app/shell/pane-size";
import { Button } from "@/components/ui/button";
import type { Playback } from "./use-playback";
import { compositionFieldsOf, layerEventMarks, type LayerEventMark } from "./timeline-helpers";

/** Standardbredde for lagnavnene; brukeren kan dra i skillet (Mars 2026-10-13), og bredden huskes. */
const LABEL_W = 160;
const LABEL_MIN = 100;
const LABEL_MAX = 480;
/** Radene leser bredden fra en CSS-variabel, så de memoiserte radene ikke tegnes om når den endres. */
const LABEL_CSS = "var(--tl-label-w, 160px)";
/** Luft mellom sporoverskriftene og bilde 0, slik at et nøkkelbilde på bilde 0 ikke skjules av overskriften. */
const GUTTER = 8;
const ROW_H = 24;
const MAX_ZOOM = 24;

const EASING_LABEL: Record<Easing, string> = localized({
  linear: ["Jevn", "Linear"],
  "ease-in": ["Myk start", "Ease in"],
  "ease-out": ["Myk slutt", "Ease out"],
  "ease-in-out": ["Myk start og slutt", "Ease in and out"],
  hold: ["Hold", "Hold"],
});

type Run = (command: Command, label: string) => string | null;

interface Props {
  readonly state: ProjectState;
  readonly composition: Composition;
  readonly durationFrames: number;
  readonly playback: Playback;
  readonly editable: boolean;
  readonly selectedLayerId: string | null;
  readonly onSelectLayer: (id: string | null) => void;
  readonly selectedShotId: string | null;
  readonly onSelectShot: (id: string | null) => void;
  readonly autoKey: boolean;
  readonly onAutoKeyChange: (on: boolean) => void;
  readonly run: Run;
  /** Lydradene under lagene (DEC-0045): bølgeformene i scenen, så bevegelser kan treffe lyden. */
  readonly audioRows?: (g: TimelineRowGeometry) => ReactNode;
}

/** Plassering for ekstra rader i tidslinjen. */
export interface TimelineRowGeometry {
  readonly ppf: number;
  readonly labelW: number;
  readonly gutter: number;
  readonly rowH: number;
  readonly fps: number;
}

interface ShotDraft {
  readonly id: string;
  readonly startFrame: number;
  readonly endFrame: number;
}
interface KeyDraft {
  readonly layerId: string;
  readonly from: number;
  readonly to: number;
}
/** Bildeskifte som dras (DEC-0052). */
interface SwapDraft {
  readonly layerId: string;
  readonly from: number;
  readonly to: number;
}
interface KeySel {
  readonly layerId: string;
  readonly frame: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Skal tastetrykk i dette elementet være i fred for tidslinjens snarveier? */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return (
    t instanceof HTMLInputElement ||
    t instanceof HTMLTextAreaElement ||
    t instanceof HTMLSelectElement ||
    t.isContentEditable
  );
}

export const iconButton =
  "inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-3 hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

export function IconButton({
  label,
  onClick,
  active,
  disabled,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={
        iconButton +
        (active ? " bg-accent-selection text-text-primary" : "") +
        (className ? " " + className : "")
      }
    >
      {children}
    </button>
  );
}

// ---------- Linjal ----------

const TICK_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];

export const RulerTicks = memo(function RulerTicks({
  ppf,
  durationFrames,
  fps,
}: {
  ppf: number;
  durationFrames: number;
  fps: number;
}) {
  const secPx = ppf * fps;
  const step = TICK_STEPS.find((s) => s * secPx >= 64) ?? 3600;
  const totalSec = durationFrames / fps;
  const ticks: ReactNode[] = [];
  for (let s = 0; s <= totalSec; s += step) {
    if (s > 0 && s * secPx + 28 > totalSec * secPx) break; // merkelappen får ikke plass før slutten
    const m = Math.floor(s / 60);
    const label = m > 0 ? `${m}:${String(s % 60).padStart(2, "0")}` : `${s} s`;
    ticks.push(
      <div
        key={s}
        className="absolute top-0 h-full whitespace-nowrap border-l border-border-control pl-1 font-mono tabular text-[11px] leading-4 text-text-tertiary"
        style={{ left: s * secPx }}
      >
        {label}
      </div>,
    );
  }
  // Delstreker (halve sekunder når det er plass til dem)
  if (step === 1 && secPx >= 120) {
    for (let s = 0.5; s < totalSec; s += 1)
      ticks.push(
        <div
          key={`h${s}`}
          className="absolute bottom-0 h-1.5 border-l border-border-strong"
          style={{ left: s * secPx }}
        />,
      );
  }
  return <>{ticks}</>;
});

// ---------- Rader ----------

const CameraRow = memo(function CameraRow({
  shots,
  draft,
  selectedShotId,
  activeShotId,
  ppf,
  editable,
  onShotPointerDown,
  onShotPointerMove,
  onShotPointerUp,
}: {
  shots: readonly CameraShot[];
  draft: ShotDraft | null;
  selectedShotId: string | null;
  /** Utsnittet under avspillingshodet (vises varmgult, DEC-0045). */
  activeShotId: string | null;
  ppf: number;
  editable: boolean;
  onShotPointerDown: (
    e: ReactPointerEvent<HTMLElement>,
    shot: CameraShot,
    mode: "move" | "start" | "end",
  ) => void;
  onShotPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onShotPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
}) {
  return (
    <>
      {shots.map((sh) => {
        const d = draft && draft.id === sh.id ? draft : null;
        const start = d ? d.startFrame : sh.startFrame;
        const end = d ? d.endFrame : sh.endFrame;
        const selected = sh.id === selectedShotId;
        const handle = (mode: "start" | "end") => (
          <div
            data-testid={`shot-${mode}`}
            onPointerDown={(e) => onShotPointerDown(e, sh, mode)}
            onPointerMove={onShotPointerMove}
            onPointerUp={onShotPointerUp}
            onPointerCancel={onShotPointerUp}
            className={
              "absolute top-0 h-full w-1.5 " +
              (editable ? "cursor-ew-resize" : "") +
              (mode === "start" ? " left-0" : " right-0")
            }
          />
        );
        return (
          <div
            key={sh.id}
            role="button"
            tabIndex={-1}
            aria-label={
              sh.name
                ? L(
                    `Kamerautsnitt ${sh.name}, bilde ${start} til ${end}`,
                    `Camera shot ${sh.name}, frames ${start} to ${end}`,
                  )
                : L(
                    `Kamerautsnitt, bilde ${start} til ${end}`,
                    `Camera shot, frames ${start} to ${end}`,
                  )
            }
            aria-pressed={selected}
            onPointerDown={(e) => onShotPointerDown(e, sh, "move")}
            onPointerMove={onShotPointerMove}
            onPointerUp={onShotPointerUp}
            onPointerCancel={onShotPointerUp}
            className={
              "absolute top-[3px] h-[18px] overflow-hidden rounded-sm border text-[11px] leading-[16px] text-text-primary " +
              (sh.id === activeShotId
                ? "border-accent-warm outline outline-1 outline-accent-warm"
                : selected
                  ? "border-text-primary ring-1 ring-focus-ring"
                  : "border-border-strong") +
              (editable ? " cursor-grab active:cursor-grabbing" : "")
            }
            style={{
              left: start * ppf,
              width: Math.max(6, (end - start + 1) * ppf),
              background:
                "linear-gradient(90deg, color-mix(in oklch, color-mix(in oklch, var(--camera-start) 70%, var(--bg-app)) 85%, transparent), color-mix(in oklch, color-mix(in oklch, var(--camera-end) 70%, var(--bg-app)) 85%, transparent))",
            }}
          >
            <span className="pointer-events-none block truncate px-2 font-medium">
              {sh.name || L("Utsnitt", "Shot")}
            </span>
            {editable ? (
              <>
                {handle("start")}
                {handle("end")}
              </>
            ) : null}
          </div>
        );
      })}
    </>
  );
});

const LayerRow = memo(function LayerRow({
  layer,
  selected,
  selectedKeyFrame,
  draft,
  ppf,
  editable,
  onTrackPointerDown,
  onKeyPointerDown,
  onKeyPointerMove,
  onKeyPointerUp,
  swapDraft,
  inGroup,
  onSwapPointerDown,
  onSwapPointerMove,
  onSwapPointerUp,
  events,
  onEventPointerDown,
}: {
  layer: CompositionLayer;
  /** Hendelser fra manuset på laget (KI-86). */
  events: readonly LayerEventMark[] | undefined;
  onEventPointerDown: (e: ReactPointerEvent<HTMLElement>, layerId: string, frame: number) => void;
  swapDraft: SwapDraft | null;
  inGroup: boolean;
  onSwapPointerDown: (e: ReactPointerEvent<HTMLElement>, layerId: string, frame: number) => void;
  onSwapPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onSwapPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  selected: boolean;
  selectedKeyFrame: number | null;
  draft: KeyDraft | null;
  ppf: number;
  editable: boolean;
  onTrackPointerDown: (e: ReactPointerEvent<HTMLElement>, layerId: string) => void;
  onKeyPointerDown: (e: ReactPointerEvent<HTMLElement>, layerId: string, frame: number) => void;
  onKeyPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onKeyPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
}) {
  const frames = useMemo(() => keyframeFrames(layer), [layer]);
  return (
    <div
      className={"flex border-b border-border even:bg-surface-2/40 " + (selected ? "bg-accent-selection" : "")}
      style={{ height: ROW_H }}
    >
      <div
        className={
          "sticky left-0 z-20 flex shrink-0 items-center border-r border-border-strong bg-surface-2 px-2 text-[13px] " +
          (selected
            ? "text-text-primary shadow-[inset_2px_0_0_var(--accent-brand)]"
            : "text-text-secondary")
        }
        style={{ width: LABEL_CSS, paddingLeft: inGroup ? 20 : undefined }}
      >
        <span className="truncate" title={layer.name}>
          {layer.name}
        </span>
      </div>
      <div style={{ width: GUTTER }} className="shrink-0" aria-hidden="true" />
      <div
        className="relative"
        style={{ height: ROW_H, flex: "1 0 auto" }}
        onPointerDown={(e) => onTrackPointerDown(e, layer.id)}
      >
        {layer.path ? (
          <span
            aria-hidden
            title={L("Bevegelsesbane", "Motion path")}
            className="pointer-events-none absolute bottom-1 h-0.5 rounded-full bg-accent-brand/60"
            style={{
              left: layer.path.startFrame * ppf,
              width: Math.max(2, (layer.path.endFrame - layer.path.startFrame) * ppf),
            }}
          />
        ) : null}
        {layer.swaps.map((w) => (
          <div
            key={`swap-${w.frame}`}
            role="button"
            tabIndex={-1}
            aria-label={L(`Bildeskifte på bilde ${w.frame}`, `Image swap at frame ${w.frame}`)}
            title={L("Bildeskifte (dra for å flytte)", "Image swap (drag to move)")}
            onPointerDown={(e) => onSwapPointerDown(e, layer.id, w.frame)}
            onPointerMove={onSwapPointerMove}
            onPointerUp={onSwapPointerUp}
            onPointerCancel={onSwapPointerUp}
            className={
              "absolute top-0 z-10 flex h-full w-3 justify-center " +
              (editable ? "cursor-ew-resize" : "cursor-pointer")
            }
            style={{
              left: (swapDraft && swapDraft.from === w.frame ? swapDraft.to : w.frame) * ppf - 6,
            }}
          >
            <span className="block h-full w-0.5 bg-status-moved" />
            <span className="absolute top-0.5 size-2 rounded-[1px] border border-bg-app bg-status-moved" />
          </div>
        ))}
        {events?.map((ev) => (
          <div
            key={`event-${ev.id}`}
            role="button"
            tabIndex={-1}
            aria-label={L(`${ev.title} (bilde ${ev.frame})`, `${ev.title} (frame ${ev.frame})`)}
            title={L(`${ev.title} (bilde ${ev.frame})`, `${ev.title} (frame ${ev.frame})`)}
            data-testid="layer-event-mark"
            onPointerDown={(e) => onEventPointerDown(e, layer.id, ev.frame)}
            className="absolute bottom-0 z-10 flex h-2.5 w-3 cursor-pointer items-end justify-center"
            style={{ left: ev.frame * ppf - 6 }}
          >
            <span className="block h-2 w-0.5 rounded-t-full bg-status-uncertain" />
            <span className="absolute bottom-0 size-1.5 rounded-full bg-status-uncertain" />
          </div>
        ))}
        {frames.map((f) => {
          const isSel = selectedKeyFrame === f;
          return (
            <div
              key={f}
              role="button"
              tabIndex={-1}
              aria-label={L(`Nøkkelbilde på bilde ${f}`, `Keyframe at frame ${f}`)}
              aria-pressed={isSel}
              onPointerDown={(e) => onKeyPointerDown(e, layer.id, f)}
              onPointerMove={onKeyPointerMove}
              onPointerUp={onKeyPointerUp}
              onPointerCancel={onKeyPointerUp}
              className={
                "absolute top-0 flex h-full w-4 items-center justify-center " +
                (editable ? "cursor-ew-resize" : "cursor-pointer")
              }
              style={{ left: (draft && draft.from === f ? draft.to : f) * ppf - 8 }}
            >
              <span
                className={
                  "block size-2 rotate-45 border border-bg-app " +
                  (selected ? "bg-accent-brand" : "bg-text-secondary") +
                  (isSel ? " ring-2 ring-text-primary" : "")
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});

// ---------- Tidslinjen ----------

export function Timeline({
  state,
  composition,
  durationFrames,
  playback,
  editable,
  selectedLayerId,
  onSelectLayer,
  selectedShotId,
  onSelectShot,
  autoKey,
  onAutoKeyChange,
  run,
  audioRows,
}: Props) {
  const [height, setHeight] = usePaneSize("scene-editor-timeline", 252, 150, 560, {
    axis: "y",
    viewportShare: 0.6,
  });
  const [labelW, setLabelW] = usePaneSize(
    "scene-editor-layer-names",
    LABEL_W,
    LABEL_MIN,
    LABEL_MAX,
    {
      viewportShare: 0.45,
    },
  );
  const TRACK_X = labelW + GUTTER;
  const fps = state.project.fps;
  const fpsN = fpsToNumber(fps);
  const { frame } = playback;
  const last = Math.max(0, durationFrames - 1);

  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [viewW, setViewW] = useState(800);
  const [keySel, setKeySel] = useState<KeySel | null>(null);
  const [shotDraft, setShotDraft] = useState<ShotDraft | null>(null);
  const [keyDraft, setKeyDraft] = useState<KeyDraft | null>(null);
  const [swapDraft, setSwapDraft] = useState<SwapDraft | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ frame: number; cursorX: number } | null>(null);

  const fitPpf = Math.max(0.05, (viewW - TRACK_X - 16) / Math.max(1, durationFrames));
  const ppf = fitPpf * zoom;
  const trackW = durationFrames * ppf;

  // Siste verdier til stabile hendelsesfunksjoner (radene er memoisert og skal ikke tegnes om hvert bilde)
  const latest = useRef({
    composition,
    run,
    playback,
    editable,
    ppf,
    last,
    state,
    trackX: TRACK_X,
  });
  latest.current = { composition, run, playback, editable, ppf, last, state, trackX: TRACK_X };
  const draftRef = useRef<{ shot: ShotDraft | null; key: KeyDraft | null }>({
    shot: null,
    key: null,
  });
  // Utkastene skrives også direkte i flyttefunksjonene (raske slipp kommer før neste tegning)

  const back = useMemo(() => layersOf(state, composition.id), [state, composition.id]);
  const front = useMemo(() => [...back].reverse(), [back]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewW(el.clientWidth);
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ⌘/Ctrl + hjul zoomer rundt pekeren
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const { ppf: cur, trackX } = latest.current;
      anchor.current = { frame: (el.scrollLeft + cursorX - trackX) / cur, cursorX };
      setZoom((z) => clamp(z * Math.exp(-e.deltaY * 0.004), 1, MAX_ZOOM));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const a = anchor.current;
    anchor.current = null;
    if (el && a) el.scrollLeft = Math.max(0, a.frame * ppf + TRACK_X - a.cursorX);
  }, [ppf, TRACK_X]);

  // Avspillingshodet holdes synlig når det er zoomet inn
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || zoom <= 1.001) return;
    const x = frame * ppf;
    const left = el.scrollLeft;
    const right = left + el.clientWidth - TRACK_X;
    if (x < left || x > right) el.scrollLeft = Math.max(0, x - (el.clientWidth - TRACK_X) / 4);
  }, [frame, ppf, zoom, TRACK_X]);

  // Mellomrom spiller av/pauser, også når fokus står på scenen eller siden, men aldri i skjemafelt eller på scenen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || e.defaultPrevented) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const t = e.target;
      if (isTypingTarget(t)) return;
      if (t instanceof HTMLElement) {
        // Scenen håndterer selv mellomrom når den bruker det (panorering) og stopper det da (defaultPrevented)
        if (t.closest("[role=dialog], [role=menu], [role=listbox]")) return;
        // Knapper og lenker har egen mellomromsfunksjon
        if (t.closest("button, a")) return;
      }
      e.preventDefault();
      latest.current.playback.toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---------- Kommandoer ----------

  const exec = useCallback((command: Command, label: string): boolean => {
    const err = latest.current.run(command, label);
    setError(err);
    return err === null;
  }, []);

  const updateComposition = useCallback(
    (label: string, patch: Partial<CompositionFields>, camera?: CompositionCamera): boolean => {
      const c = latest.current.composition;
      return exec(
        {
          type: "UpdateComposition",
          compositionId: c.id,
          fields: { ...compositionFieldsOf(c), ...patch },
          ...(camera ? { camera } : {}),
        },
        label,
      );
    },
    [exec],
  );

  const updateKeys = useCallback(
    (layer: CompositionLayer, label: string, keyframes: CompositionLayer["keyframes"]) =>
      exec(
        {
          type: "UpdateLayers",
          layers: [{ layerId: layer.id, fields: { ...layerFieldsOf(layer), keyframes } }],
        },
        label,
      ),
    [exec],
  );

  const selectedLayer = back.find((l) => l.id === selectedLayerId) ?? null;
  const keyLayer = keySel ? (back.find((l) => l.id === keySel.layerId) ?? null) : null;
  const keyHere =
    keySel && keyLayer ? keyLayer.keyframes.filter((k) => k.frame === keySel.frame) : [];
  const keyValid = keySel !== null && keyLayer !== null && keyHere.length > 0;

  function deleteSelectedKey() {
    if (!editable || !keySel || !keyLayer || !keyValid) return;
    updateKeys(
      keyLayer,
      L("Slett nøkkelbilde", "Delete keyframe"),
      removeKeyframesAt(keyLayer.keyframes, keySel.frame),
    );
    setKeySel(null);
  }

  // ---------- Pekerhandlinger ----------

  const frameFromX = useCallback((clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    const { ppf: p, last: l } = latest.current;
    if (!rect) return 0;
    return clamp(Math.round((clientX - rect.left) / p), 0, l);
  }, []);

  const onRulerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    latest.current.playback.setFrame(frameFromX(e.clientX));
  };
  const onRulerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      latest.current.playback.setFrame(frameFromX(e.clientX));
  };

  const onTrackPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>, layerId: string) => {
      if (e.button !== 0) return;
      onSelectLayer(layerId);
      setKeySel(null);
      latest.current.playback.setFrame(frameFromX(e.clientX));
    },
    [frameFromX, onSelectLayer],
  );

  // Hendelser fra manuset (KI-86): klikk velger laget og flytter avspillingshodet til hendelsen
  const onEventPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>, layerId: string, f: number) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      onSelectLayer(layerId);
      setKeySel(null);
      latest.current.playback.setFrame(Math.min(f, latest.current.last));
    },
    [onSelectLayer],
  );
  const eventMarks = useMemo(
    () => layerEventMarks(state, fpsN),
    // Bare koblinger og manustekst påvirker merkene
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.timeLinks, state.blocks, fpsN],
  );

  // Nøkkelbilder: klikk velger, dra flytter (utkast), slipp lagrer
  const keyDrag = useRef<{ layerId: string; from: number; startX: number; moved: boolean } | null>(
    null,
  );
  const onKeyPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>, layerId: string, f: number) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      onSelectLayer(layerId);
      setKeySel({ layerId, frame: f });
      latest.current.playback.setFrame(f);
      keyDrag.current = { layerId, from: f, startX: e.clientX, moved: false };
    },
    [onSelectLayer],
  );
  const onKeyPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const d = keyDrag.current;
    if (!d || !latest.current.editable) return;
    const delta = Math.round((e.clientX - d.startX) / latest.current.ppf);
    if (delta === 0 && !d.moved) return;
    d.moved = true;
    const to = clamp(d.from + delta, 0, latest.current.last);
    const next = { layerId: d.layerId, from: d.from, to };
    draftRef.current.key = next;
    setKeyDraft((old) => (old && old.to === to && old.from === d.from ? old : next));
  }, []);
  const onKeyPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const d = keyDrag.current;
      keyDrag.current = null;
      const draft = draftRef.current.key;
      draftRef.current.key = null;
      setKeyDraft(null);
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId);
      if (!d || !draft || e.type === "pointercancel" || draft.to === draft.from) return;
      const layer = layersOf(latest.current.state, latest.current.composition.id).find(
        (l) => l.id === d.layerId,
      );
      if (!layer) return;
      if (
        updateKeys(
          layer,
          L("Flytt nøkkelbilde", "Move keyframe"),
          moveKeyframes(layer.keyframes, draft.from, draft.to),
        )
      ) {
        setKeySel({ layerId: d.layerId, frame: draft.to });
        latest.current.playback.setFrame(draft.to);
      }
    },
    [updateKeys],
  );

  // Bildeskifter (DEC-0052): klikk går dit, dra flytter skiftet
  const swapDrag = useRef<{
    layerId: string;
    from: number;
    startX: number;
    to: number;
    moved: boolean;
  } | null>(null);
  const onSwapPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>, layerId: string, f: number) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      onSelectLayer(layerId);
      setKeySel(null);
      latest.current.playback.setFrame(f);
      swapDrag.current = { layerId, from: f, startX: e.clientX, to: f, moved: false };
    },
    [onSelectLayer],
  );
  const onSwapPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const d = swapDrag.current;
    if (!d || !latest.current.editable) return;
    const delta = Math.round((e.clientX - d.startX) / latest.current.ppf);
    if (delta === 0 && !d.moved) return;
    d.moved = true;
    d.to = clamp(d.from + delta, 1, Math.max(1, latest.current.last));
    const next = { layerId: d.layerId, from: d.from, to: d.to };
    setSwapDraft((old) => (old && old.to === next.to && old.from === next.from ? old : next));
  }, []);
  const onSwapPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const d = swapDrag.current;
      swapDrag.current = null;
      setSwapDraft(null);
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId);
      if (!d || !d.moved || e.type === "pointercancel" || d.to === d.from) return;
      const layer = latest.current.state.layers[d.layerId];
      if (!layer) return;
      if (layer.swaps.some((w) => w.frame === d.to)) {
        setError(
          L(
            "Det er allerede et bildeskifte på det bildet.",
            "There is already an image swap on that frame.",
          ),
        );
        return;
      }
      const ok = exec(
        {
          type: "UpdateLayers",
          layers: [
            {
              layerId: layer.id,
              fields: {
                ...layerFieldsOf(layer),
                swaps: layer.swaps
                  .map((w) => (w.frame === d.from ? { ...w, frame: d.to } : w))
                  .sort((a, b) => a.frame - b.frame),
              },
            },
          ],
        },
        L("Flytt bildeskifte", "Move image swap"),
      );
      if (ok) latest.current.playback.setFrame(d.to);
    },
    [exec],
  );

  // Kamerautsnitt: dra flytter, kantene endrer lengden
  const shotDrag = useRef<{
    shot: CameraShot;
    mode: "move" | "start" | "end";
    startX: number;
  } | null>(null);
  const onShotPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>, shot: CameraShot, mode: "move" | "start" | "end") => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      onSelectShot(shot.id);
      shotDrag.current = { shot, mode, startX: e.clientX };
    },
    [onSelectShot],
  );
  const onShotPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const d = shotDrag.current;
    if (!d || !latest.current.editable) return;
    const delta = Math.round((e.clientX - d.startX) / latest.current.ppf);
    const { startFrame: s0, endFrame: e0 } = d.shot;
    const lastF = latest.current.last;
    let startFrame = s0;
    let endFrame = e0;
    if (d.mode === "move") {
      const len = e0 - s0;
      startFrame = clamp(s0 + delta, 0, Math.max(0, lastF - len));
      endFrame = startFrame + len;
    } else if (d.mode === "start") {
      startFrame = clamp(s0 + delta, 0, Math.max(0, e0 - 1));
    } else {
      endFrame = clamp(e0 + delta, Math.min(s0 + 1, lastF), lastF);
    }
    draftRef.current.shot = { id: d.shot.id, startFrame, endFrame };
    setShotDraft((old) =>
      old && old.id === d.shot.id && old.startFrame === startFrame && old.endFrame === endFrame
        ? old
        : { id: d.shot.id, startFrame, endFrame },
    );
  }, []);
  const onShotPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const d = shotDrag.current;
      shotDrag.current = null;
      const draft = draftRef.current.shot;
      draftRef.current.shot = null;
      setShotDraft(null);
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId);
      if (!d || !draft || e.type === "pointercancel") return;
      if (draft.startFrame === d.shot.startFrame && draft.endFrame === d.shot.endFrame) return;
      // Utsnittet slik det er nå (kan ha endret seg under dragningen), med nye tider
      const cam = latest.current.composition.camera;
      const current = cam.shots.find((x) => x.id === d.shot.id);
      if (!current) return;
      updateComposition(
        d.mode === "move"
          ? L("Flytt kamerautsnitt", "Move camera shot")
          : L("Endre lengde på kamerautsnitt", "Change camera shot length"),
        {},
        withShot(cam, { ...current, startFrame: draft.startFrame, endFrame: draft.endFrame }),
      );
    },
    [updateComposition],
  );

  // ---------- Tastatur når fokus er i tidslinjen ----------

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (isTypingTarget(e.target)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const step = e.shiftKey ? 10 : 1;
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        playback.setFrame(frame - step);
        break;
      case "ArrowRight":
        e.preventDefault();
        playback.setFrame(frame + step);
        break;
      case "Home":
        e.preventDefault();
        playback.setFrame(0);
        break;
      case "End":
        e.preventDefault();
        playback.setFrame(last);
        break;
      case "Delete":
      case "Backspace":
        if (keyValid && editable) {
          e.preventDefault();
          deleteSelectedKey();
        }
        break;
    }
  }

  // ---------- Handlinger i transportlinjen ----------

  const [durationDraft, setDurationDraft] = useState<string | null>(null);
  const durationCancelled = useRef(false);
  const seconds = Math.round(framesToSeconds(durationFrames, fps) * 100) / 100;
  function commitDuration() {
    const text = durationDraft;
    setDurationDraft(null);
    if (durationCancelled.current) {
      durationCancelled.current = false;
      return;
    }
    if (text === null) return;
    const v = Number(text.trim().replace(",", "."));
    if (text.trim() === "" || !Number.isFinite(v)) return;
    const frames = secondsToFrames(clamp(v, MIN_DURATION_SECONDS, MAX_DURATION_SECONDS), fps);
    if (frames === composition.durationFrames) return;
    updateComposition(L("Endre varighet", "Change duration"), { durationFrames: frames });
  }

  function keyAll() {
    if (!selectedLayer) return;
    updateKeys(selectedLayer, L("Nøkkelbilde", "Keyframe"), keyAllAt(selectedLayer, frame));
  }

  function addShot() {
    const id = newId<"camera_shot">();
    const slot = freeShotSlot(composition.camera, frame, Math.round(3 * fpsN), last);
    if (!slot) {
      setError(
        L(
          "Det er ikke plass til et nytt kamerautsnitt her. Flytt avspillingshodet.",
          "There is no room for a new camera shot here. Move the playhead.",
        ),
      );
      return;
    }
    const ok = updateComposition(
      L("Nytt kamerautsnitt", "New camera shot"),
      {},
      withShot(composition.camera, newShot(composition, id, slot.startFrame, slot.endFrame)),
    );
    if (ok) onSelectShot(id);
  }

  const easingNow = keyValid ? (keyHere[0]?.easing ?? "ease-in-out") : "ease-in-out";
  const ctl =
    "h-6 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label={L("Tidslinje", "Timeline")}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDownCapture={(e) => {
        if (!isTypingTarget(e.target)) rootRef.current?.focus({ preventScroll: true });
      }}
      style={{ height }}
      className="relative flex shrink-0 flex-col border-t border-border bg-surface-1 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <PaneResizer
        edge="top"
        size={height}
        onSize={setHeight}
        min={150}
        max={560}
        label={L("Høyde på tidslinjen", "Height of the timeline")}
      />
      {/* Transport og verktøy */}
      <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-1.5 gap-y-1 border-b border-border px-2 py-1">
        <IconButton
          label={L("Til start (Home)", "To start (Home)")}
          onClick={() => playback.setFrame(0)}
          className="size-7"
        >
          <SkipBack className="size-3.5" />
        </IconButton>
        <IconButton
          label={L("Forrige bilde (pil venstre)", "Previous frame (left arrow)")}
          onClick={() => playback.setFrame(frame - 1)}
          className="size-7"
        >
          <ChevronLeft className="size-3.5" />
        </IconButton>
        <button
          type="button"
          aria-label={playback.playing ? L("Pause", "Pause") : L("Spill av", "Play")}
          title={
            playback.playing
              ? L("Pause (mellomrom)", "Pause (space)")
              : L("Spill av (mellomrom)", "Play (space)")
          }
          onClick={playback.toggle}
          className={iconButton + " size-7 bg-surface-3 text-text-primary"}
        >
          {playback.playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        </button>
        <IconButton
          label={L("Neste bilde (pil høyre)", "Next frame (right arrow)")}
          onClick={() => playback.setFrame(frame + 1)}
          className="size-7"
        >
          <ChevronRight className="size-3.5" />
        </IconButton>
        <IconButton
          label={L("Til slutt (End)", "To end (End)")}
          onClick={() => playback.setFrame(last)}
          className="size-7"
        >
          <SkipForward className="size-3.5" />
        </IconButton>
        <IconButton
          label={L("Løkke", "Loop")}
          active={playback.loop}
          onClick={() => playback.setLoop(!playback.loop)}
          className="size-7"
        >
          <Repeat className="size-3.5" />
        </IconButton>
        <span
          className="shrink-0 whitespace-nowrap px-1 font-mono text-[13px] tabular-nums text-text-primary"
          aria-label={L("Tid", "Time")}
        >
          {formatTimecode(frame, fps)}
          <span className="text-text-tertiary"> / {formatTimecode(durationFrames, fps)}</span>
        </span>

        <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden="true" />

        <label className="flex shrink-0 items-center gap-1.5 text-xs text-text-secondary">
          {L("Varighet (s)", "Duration (s)")}
          <input
            type="number"
            inputMode="decimal"
            step={0.5}
            min={MIN_DURATION_SECONDS}
            max={MAX_DURATION_SECONDS}
            disabled={!editable}
            value={durationDraft ?? String(seconds)}
            onFocus={() => setDurationDraft(String(seconds))}
            onChange={(e) => setDurationDraft(e.target.value)}
            onBlur={commitDuration}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              else if (e.key === "Escape") {
                durationCancelled.current = true;
                setDurationDraft(null);
                e.currentTarget.blur();
              }
            }}
            className={ctl + " w-16 font-mono"}
          />
        </label>
        {editable && composition.durationFrames > 0 ? (
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0"
            title={L(
              "Bruk varigheten som er beregnet fra manuset",
              "Use the duration calculated from the script",
            )}
            onClick={() =>
              updateComposition(L("Varighet fra manus", "Duration from script"), {
                durationFrames: 0,
              })
            }
          >
            {L("Fra manus", "From script")}
          </Button>
        ) : null}

        <button
          type="button"
          role="switch"
          aria-checked={autoKey}
          disabled={!editable}
          onClick={() => onAutoKeyChange(!autoKey)}
          title={L(
            "Endringer på et bilde blir nøkkelbilder",
            "Changes on a frame become keyframes",
          )}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-sm px-1.5 text-xs text-text-secondary hover:bg-surface-3 hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span
            aria-hidden="true"
            className={
              "size-2 rounded-full border " +
              (autoKey
                ? "border-status-danger bg-status-danger"
                : "border-text-tertiary bg-transparent")
            }
          />
          {L("Automatiske nøkkelbilder", "Automatic keyframes")}
        </button>

        <Button
          size="sm"
          variant="secondary"
          className="shrink-0"
          disabled={!editable || !selectedLayer}
          title={L(
            "Nøkkelbilde for alle egenskaper på dette bildet",
            "Keyframe for all properties on this frame",
          )}
          onClick={keyAll}
        >
          <Diamond className="size-3" />
          {L("Nøkkelbilde", "Keyframe")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="shrink-0"
          disabled={!editable}
          onClick={addShot}
        >
          <Video className="size-3" />
          {L("Nytt kamerautsnitt", "New camera shot")}
        </Button>

        {keyValid && keyLayer ? (
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-text-secondary">
            {L("Hastighetskurve", "Easing curve")}
            <select
              value={easingNow}
              disabled={!editable}
              onChange={(e) => {
                const next = EASINGS.find((x) => x === e.target.value);
                if (next && keySel)
                  updateKeys(
                    keyLayer,
                    L("Endre hastighetskurve", "Change easing curve"),
                    setKeyframeEasing(keyLayer.keyframes, keySel.frame, next),
                  );
              }}
              className={ctl}
            >
              {EASINGS.map((x) => (
                <option key={x} value={x}>
                  {EASING_LABEL[x]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {keyValid && keyLayer && easingNow !== "hold" ? (
          <span
            className="flex shrink-0 items-center gap-1.5 text-xs text-text-secondary"
            title={L(
              "Styrken på myk start og slutt (som «influence» i After Effects)",
              "The strength of ease in and out (like “influence” in After Effects)",
            )}
          >
            Ease
            {(["easeIn", "easeOut"] as const).map((key) => {
              const k0 = keyHere[0]!;
              const def = EASE_STRENGTH[easingNow][key === "easeOut" ? 0 : 1];
              const v = k0[key] ?? def;
              return (
                <PercentInput
                  key={key}
                  label={key === "easeIn" ? L("inn", "in") : L("ut", "out")}
                  title={
                    key === "easeIn"
                      ? L(
                          "Ease inn: hvor mykt bevegelsen bremser inn mot dette nøkkelbildet",
                          "Ease in: how softly the movement slows down into this keyframe",
                        )
                      : L(
                          "Ease ut: hvor mykt bevegelsen starter fra dette nøkkelbildet",
                          "Ease out: how softly the movement starts from this keyframe",
                        )
                  }
                  value={v}
                  disabled={!editable}
                  className={ctl}
                  onCommit={(n) =>
                    keySel &&
                    updateKeys(
                      keyLayer,
                      key === "easeIn"
                        ? L("Endre ease inn", "Change ease in")
                        : L("Endre ease ut", "Change ease out"),
                      setKeyframeEase(keyLayer.keyframes, keySel.frame, { [key]: n }),
                    )
                  }
                />
              );
            })}
          </span>
        ) : null}

        <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2 text-xs text-text-tertiary">
          {L("Zoom", "Zoom")}
          <input
            type="range"
            aria-label={L("Zoom tidslinjen", "Zoom the timeline")}
            min={1}
            max={MAX_ZOOM}
            step={0.1}
            value={zoom}
            onChange={(e) => {
              const el = scrollRef.current;
              if (el)
                anchor.current = {
                  frame: (el.scrollLeft + (el.clientWidth - TRACK_X) / 2) / ppf,
                  cursorX: TRACK_X + (el.clientWidth - TRACK_X) / 2,
                };
              setZoom(Number(e.target.value));
            }}
            className="h-1 w-20 accent-[var(--accent-brand)]"
          />
        </span>
      </div>
      {error ? (
        <p
          role="alert"
          className="shrink-0 truncate border-b border-border px-2 py-0.5 text-xs text-status-danger"
        >
          {error}
        </p>
      ) : null}

      {/* Linjal og spor */}
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto">
        <div
          className="relative"
          style={
            {
              width: TRACK_X + trackW + GUTTER,
              minHeight: "100%",
              "--tl-label-w": `${labelW}px`,
            } as CSSProperties
          }
        >
          <div className="sticky top-0 z-30 flex border-b border-border bg-surface-2">
            <div
              className="sticky left-0 z-10 shrink-0 border-r border-border-strong bg-surface-2 px-2 text-xs leading-5 text-text-tertiary"
              style={{ width: labelW }}
            >
              {L("Spor", "Tracks")}
              <PaneResizer
                edge="right"
                size={labelW}
                onSize={setLabelW}
                min={LABEL_MIN}
                max={LABEL_MAX}
                label={L("Bredden på lagnavnene", "Width of the layer names")}
              />
            </div>
            <div style={{ width: GUTTER }} className="shrink-0" aria-hidden="true" />
            <div
              ref={trackRef}
              className="relative h-5 shrink-0 cursor-col-resize touch-none"
              style={{ width: trackW }}
              onPointerDown={onRulerDown}
              onPointerMove={onRulerMove}
            >
              <RulerTicks ppf={ppf} durationFrames={durationFrames} fps={fpsN} />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute top-0 size-2.5 -translate-x-1/2 rounded-b-sm bg-accent-brand shadow-sm ring-1 ring-bg-app"
                style={{ left: frame * ppf }}
              />
            </div>
          </div>

          {/* Kamera */}
          <div className="flex border-b border-border" style={{ height: ROW_H }}>
            <div
              className="sticky left-0 z-20 flex shrink-0 items-center gap-1.5 border-r border-border-strong bg-surface-2 px-2 text-[13px] text-text-secondary"
              style={{ width: labelW }}
            >
              <Video className="size-3.5 shrink-0" />
              {L("Kamera", "Camera")}
            </div>
            <div style={{ width: GUTTER }} className="shrink-0" aria-hidden="true" />
            <div
              className="relative"
              style={{ height: ROW_H, flex: "1 0 auto" }}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                onSelectShot(null);
                playback.setFrame(frameFromX(e.clientX));
              }}
            >
              <CameraRow
                shots={composition.camera.shots}
                draft={shotDraft}
                selectedShotId={selectedShotId}
                activeShotId={
                  composition.camera.shots.find((x) => frame >= x.startFrame && frame <= x.endFrame)
                    ?.id ?? null
                }
                ppf={ppf}
                editable={editable}
                onShotPointerDown={onShotPointerDown}
                onShotPointerMove={onShotPointerMove}
                onShotPointerUp={onShotPointerUp}
              />
            </div>
          </div>

          {front.length === 0 ? (
            <p className="sticky left-0 px-3 py-2 text-xs text-text-tertiary">
              {L("Ingen lag i scenen ennå.", "No layers in the scene yet.")}
            </p>
          ) : (
            front.map((l) => (
              <LayerRow
                key={l.id}
                layer={l}
                selected={l.id === selectedLayerId}
                selectedKeyFrame={keySel && keySel.layerId === l.id ? keySel.frame : null}
                draft={keyDraft && keyDraft.layerId === l.id ? keyDraft : null}
                ppf={ppf}
                editable={editable}
                onTrackPointerDown={onTrackPointerDown}
                onKeyPointerDown={onKeyPointerDown}
                onKeyPointerMove={onKeyPointerMove}
                onKeyPointerUp={onKeyPointerUp}
                swapDraft={swapDraft && swapDraft.layerId === l.id ? swapDraft : null}
                inGroup={
                  !!l.groupId &&
                  state.layers[l.groupId]?.kind === "group" &&
                  !state.layers[l.groupId]?.removed
                }
                onSwapPointerDown={onSwapPointerDown}
                onSwapPointerMove={onSwapPointerMove}
                onSwapPointerUp={onSwapPointerUp}
                events={eventMarks.get(l.id)}
                onEventPointerDown={onEventPointerDown}
              />
            ))
          )}

          {audioRows?.({ ppf, labelW, gutter: GUTTER, rowH: ROW_H, fps: fpsN })}

          {/* Avspillingshodet (den eneste delen som følger bildet) */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 z-10 w-px bg-text-primary"
            style={{ left: TRACK_X + frame * ppf }}
          />
        </div>
      </div>
    </div>
  );
}

/** Prosent (0–100) som lagres når du forlater feltet eller trykker Enter. */
function PercentInput({
  label,
  title,
  value,
  disabled,
  className,
  onCommit,
}: {
  label: string;
  title: string;
  value: number;
  disabled: boolean;
  className: string;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  /** Lagres på nøkkelbildet som var valgt da du begynte å skrive (valget kan endres før feltet forlates). */
  const target = useRef(onCommit);
  const shown = String(Math.round(value * 100));
  function commit() {
    const t = draft;
    setDraft(null);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (t === null) return;
    const n = Number(t.replace(",", "."));
    if (!Number.isFinite(n) || t.trim() === "") return;
    const v = Math.min(100, Math.max(0, Math.round(n)));
    if (String(v) !== shown) target.current(v / 100);
  }
  return (
    <label className="flex items-center gap-1" title={title}>
      {label}
      <input
        type="number"
        min={0}
        max={100}
        step={5}
        value={draft ?? shown}
        disabled={disabled}
        onFocus={() => {
          target.current = onCommit;
          setDraft(shown);
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") {
            cancelled.current = true;
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
        aria-label={L(`Ease ${label} i prosent`, `Ease ${label} in percent`)}
        className={className + " w-12"}
      />
      %
    </label>
  );
}
