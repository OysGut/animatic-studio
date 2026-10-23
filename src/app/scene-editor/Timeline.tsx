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
  Lock,
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
  type ComponentProps,
  type ReactNode,
} from "react";
import { EASINGS, MAX_DURATION_SECONDS, MIN_DURATION_SECONDS, fpsToNumber, formatTimecode, framesToSeconds, keyAllAt, keyframeFrames, compositionDuration, retimeHasTimedContent, layerFieldsOf, layersOf, moveKeyframes, newShot, removeKeyframesAt, secondsToFrames, setKeyframeEasing, setKeyframeEase, EASE_STRENGTH, withShot, type CameraShot, type Command, type Composition, type CompositionCamera, type CompositionFields, type CompositionLayer, type Easing, type LockedRange, type ProjectState, freeShotSlot, newId, timingOf } from "@/core";
import { PaneResizer, usePaneSize } from "@/app/shell/pane-size";
import { Button } from "@/components/ui/button";
import { FrameValue, useFrame, type Playback } from "./use-playback";
import { compositionFieldsOf, layerEventMarks, type LayerEventMark } from "./timeline-helpers";
import { RetimeDialog } from "./RetimeDialog";
import { SpacingRow, type SpacingHover } from "./SpacingDrag";
import { PathSpacingTrack } from "./PathSpacingTrack";
import { useLanguage } from "@/app/i18n/language";
import { t as tk, tLocalized } from "@/core/i18n/keyed";

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

const EASING_LABEL: Record<Easing, string> = tLocalized({ linear: "app-scene-editor-timeline.easing-label.linear.1750f57a6de9", "ease-in": "app-scene-editor-timeline.easing-label.ease-in.9379bba8c3f0", "ease-out": "app-scene-editor-timeline.easing-label.ease-out.56780e4ed77f", "ease-in-out": "app-scene-editor-timeline.easing-label.ease-in-out.0a7a2d9970f5", hold: "app-scene-editor-timeline.easing-label.hold.4f4e14ef5349" });

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
  /** Endring av scenevarighet (SV1): scenen, lagring med svar og bildelenker til forhåndsspill. */
  readonly retime?: {
    readonly occurrenceId: string;
    readonly runAndWait: ComponentProps<typeof RetimeDialog>["runAndWait"];
    readonly imageUrls: Readonly<Record<string, string>>;
    /** Lyden i scenen for en (midlertidig) tilstand, til forhåndsspillet. */
    readonly audioOf?: ComponentProps<typeof RetimeDialog>["audioOf"];
    readonly audioUrls?: Readonly<Record<string, string>> | null;
    /** Øker når egenskapspanelet ber om dialogen. */
    readonly request?: number;
    /** B-100: foreslått ny lengde (frames) når dialogen åpnes fra varselet om tid etter scenens slutt. */
    readonly requestFrames?: number | undefined;
  };
  /** B-100: spacing-drag på lagets felt (Cmd/Ctrl + dra). Forhåndsvisning og utheving på lerretet. */
  readonly spacing?: {
    readonly onHover: (h: SpacingHover | null) => void;
    readonly onPreview: (s: ProjectState | null) => void;
  };
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
  useLanguage(); // ML2a: tegnes på nytt ved språkbytte uten remontering
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
  // U5: mellommerker. Hvert hovedtrinn deles i 10, 5, 4 eller 2 (minst 8 px mellom merkene); midtmerket er
  // lengre. Ved ett sekunds trinn og god plass vises ett merke per bilde.
  const stepPx = step * secPx;
  const perFrame = step === 1 && ppf >= 8;
  const div = perFrame ? fps : ([10, 5, 4, 2].find((n) => stepPx / n >= 8) ?? 1);
  if (div > 1) {
    const minor = step / div;
    const count = Math.floor(totalSec / minor);
    for (let i = 1; i <= count; i++) {
      if (i % div === 0) continue;
      const t = i * minor;
      const mid = div % 2 === 0 && i % div === div / 2;
      ticks.push(
        <div
          key={`m${i}`}
          data-testid="ruler-minor-tick"
          className={"absolute bottom-0 border-l " + (mid ? "h-2 border-border-strong" : "h-1 border-border-control")}
          style={{ left: t * secPx }}
        />,
      );
    }
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
  useLanguage(); // ML2a: tegnes på nytt ved språkbytte uten remontering
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
                ? tk("app-scene-editor-timeline.camera-row.aria-label.823cd5dcc566", { name: String(sh.name), start: String(start), end: String(end) })
                : tk("app-scene-editor-timeline.camera-row.aria-label.861d5076cce8", { start: String(start), end: String(end) })
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
              {sh.name || tk("app-scene-editor-timeline.camera-row.span.162934d20858")}
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
  useLanguage(); // ML2a: tegnes på nytt ved språkbytte uten remontering
  const frames = useMemo(() => keyframeFrames(layer), [layer]);
  return (
    <div
      className={
        "flex border-b border-border even:bg-surface-2/40 " +
        (selected ? "bg-accent-selection" : "")
      }
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
            title={tk("app-scene-editor-timeline.layer-row.title.adcac36a2b96")}
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
            aria-label={tk("app-scene-editor-timeline.layer-row.aria-label.1ae0f419d901", { frame: String(w.frame) })}
            title={tk("app-scene-editor-timeline.layer-row.title.7437d71ba4b9")}
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
            aria-label={tk("app-scene-editor-timeline.layer-row.aria-label.ab359055d0a4", { title: String(ev.title), frame: String(ev.frame) })}
            title={tk("app-scene-editor-timeline.layer-row.title.ab359055d0a4", { title: String(ev.title), frame: String(ev.frame) })}
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
              aria-label={tk("app-scene-editor-timeline.layer-row.aria-label.fd871410aadc", { f: String(f) })}
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
  retime,
  spacing,
}: Props) {
  const [retimeTarget, setRetimeTarget] = useState<number | null>(null);
  const [endDrag, setEndDrag] = useState<{ x0: number; frames: number } | null>(null);
  const retimeRequest = retime?.request ?? 0;
  useEffect(() => {
    if (retimeRequest > 0) setRetimeTarget(retime?.requestFrames ?? durationFrames);
    // Bare når egenskapspanelet ber om det, ikke når varigheten endres
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retimeRequest]);
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
  // N8: tidslinjen tegnes ikke per bilde; bare avspillingshodet, tidskoden og aktivt kameraskudd abonnerer.
  const frameNow = () => playback.store.get();
  const activeShotId = useFrame(playback, (f) => composition.camera.shots.find((x) => f >= x.startFrame && f <= x.endFrame)?.id ?? null);
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
    const follow = () => {
      const el = scrollRef.current;
      if (!el || zoom <= 1.001) return;
      const x = playback.store.get() * ppf;
      const left = el.scrollLeft;
      const right = left + el.clientWidth - TRACK_X;
      if (x < left || x > right) el.scrollLeft = Math.max(0, x - (el.clientWidth - TRACK_X) / 4);
    };
    follow();
    return playback.store.subscribe(follow);
  }, [playback.store, ppf, zoom, TRACK_X]);

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
      tk("app-scene-editor-timeline.delete-selected-key.update-keys.1aa7524a08fd"),
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
          tk("app-scene-editor-timeline.on-key-pointer-up.update-keys.9d89eeebe521"),
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
          tk("app-scene-editor-timeline.on-swap-pointer-up.set-error.5e5cb2a28cef"),
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
        tk("app-scene-editor-timeline.ok.exec.0d0809ab14af"),
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
          ? tk("app-scene-editor-timeline.on-shot-pointer-up.update-composition.9f0664ed9147")
          : tk("app-scene-editor-timeline.on-shot-pointer-up.update-composition.264a5ac49c4b"),
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
        playback.setFrame(frameNow() - step);
        break;
      case "ArrowRight":
        e.preventDefault();
        playback.setFrame(frameNow() + step);
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
    if (frames === durationFrames) return;
    // B-041: brukeren velger metode hver gang scenen endrer lengde
    if (retime) setRetimeTarget(frames);
    else updateComposition(tk("app-scene-editor-timeline.commit-duration.update-composition.6c54abb88e95"), { durationFrames: frames });
  }

  /** Låste tidsrom (SV1): nytt fra avspillingshodet (1 s), eller fjernet. */
  function setLockedRanges(next: readonly LockedRange[], label: string) {
    const c = latest.current.composition;
    exec(
      {
        type: "UpdateComposition",
        compositionId: c.id,
        fields: compositionFieldsOf(c),
        timing: { ...timingOf(c), lockedRanges: next },
      },
      label,
    );
  }
  function addLockedRange() {
    const list = timingOf(composition).lockedRanges;
    const start = Math.max(0, Math.min(frameNow(), last));
    const nextStart = list.filter((r) => r.startFrame > start).map((r) => r.startFrame);
    const end = Math.min(durationFrames, start + Math.round(fpsN), ...nextStart);
    if (end <= start || list.some((r) => start >= r.startFrame && start < r.endFrame)) {
      setError(
        tk("app-scene-editor-timeline.add-locked-range.set-error.448f5260954f"),
      );
      return;
    }
    setLockedRanges(
      [...list, { id: newId(), startFrame: start, endFrame: end, label: "" }],
      tk("app-scene-editor-timeline.add-locked-range.set-locked-ranges.dc0340911376"),
    );
  }

  /** Dra i kantene på et låst tidsrom, eller lag et nytt med Shift + dra over linjalen (SV1). */
  const [rangeDrag, setRangeDrag] = useState<{
    id: string | null;
    edge: "start" | "end" | "new";
    anchor: number;
    start: number;
    end: number;
  } | null>(null);
  function rangeFrameAt(clientX: number): number {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return clamp(Math.round((clientX - rect.left) / ppf), 0, durationFrames);
  }
  function moveRangeDrag(clientX: number) {
    if (!rangeDrag) return;
    const f = rangeFrameAt(clientX);
    if (rangeDrag.edge === "start")
      setRangeDrag({ ...rangeDrag, start: Math.min(f, rangeDrag.anchor - 1) });
    else if (rangeDrag.edge === "end")
      setRangeDrag({ ...rangeDrag, end: Math.max(f, rangeDrag.anchor + 1) });
    else
      setRangeDrag({
        ...rangeDrag,
        start: Math.min(f, rangeDrag.anchor),
        end: Math.max(f, rangeDrag.anchor),
      });
  }
  function finishRangeDrag() {
    const d = rangeDrag;
    setRangeDrag(null);
    if (!d || d.end <= d.start) return;
    const list = timingOf(latest.current.composition).lockedRanges;
    const others = list.filter((r) => r.id !== d.id);
    if (others.some((r) => d.start < r.endFrame && d.end > r.startFrame)) {
      setError(
        tk("app-scene-editor-timeline.finish-range-drag.set-error.728c710f03b1"),
      );
      return;
    }
    if (d.id === null)
      setLockedRanges(
        [...list, { id: newId(), startFrame: d.start, endFrame: d.end, label: "" }],
        tk("app-scene-editor-timeline.finish-range-drag.set-locked-ranges.d10c1d6c567c"),
      );
    else {
      const old = list.find((r) => r.id === d.id);
      if (!old || (old.startFrame === d.start && old.endFrame === d.end)) return;
      setLockedRanges(
        list.map((r) => (r.id === d.id ? { ...r, startFrame: d.start, endFrame: d.end } : r)),
        tk("app-scene-editor-timeline.finish-range-drag.set-locked-ranges.e722e859f627"),
      );
    }
  }



  function keyAll() {
    if (!selectedLayer) return;
    updateKeys(selectedLayer, tk("app-scene-editor-timeline.key-all.update-keys.4a6a6c0c18aa"), keyAllAt(selectedLayer, frameNow()));
  }

  function addShot() {
    const id = newId<"camera_shot">();
    const slot = freeShotSlot(composition.camera, frameNow(), Math.round(3 * fpsN), last);
    if (!slot) {
      setError(
        tk("app-scene-editor-timeline.add-shot.set-error.dd3fcd06065a"),
      );
      return;
    }
    const ok = updateComposition(
      tk("app-scene-editor-timeline.ok.update-composition.068e39844303"),
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
      aria-label={tk("app-scene-editor-timeline.timeline.aria-label.624f74e7ceb5")}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDownCapture={(e) => {
        if (!isTypingTarget(e.target)) rootRef.current?.focus({ preventScroll: true });
      }}
      style={{ height }}
      className="relative flex shrink-0 flex-col border-t border-border bg-surface-1 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
    >
      {retime ? (
        <RetimeDialog
          open={retimeTarget !== null}
          onClose={() => setRetimeTarget(null)}
          state={state}
          occurrenceId={retime.occurrenceId}
          composition={composition}
          currentFrames={durationFrames}
          initialFrames={retimeTarget ?? durationFrames}
          runAndWait={retime.runAndWait}
          imageUrls={retime.imageUrls}
          audioOf={retime.audioOf}
          audioUrls={retime.audioUrls}
        />
      ) : null}
      <PaneResizer
        edge="top"
        size={height}
        onSize={setHeight}
        min={150}
        max={560}
        label={tk("app-scene-editor-timeline.timeline.label.26278c01006b")}
      />
      {/* Transport og verktøy */}
      <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-1.5 gap-y-1 border-b border-border px-2 py-1" data-playing={playback.playing ? "true" : "false"}>
        {/* N10: avspillingsstatus for skjermlesere; endres bare ved start og stopp, aldri per bilde */}
        <span className="sr-only" aria-live="polite" data-testid="playback-status">
          {playback.playing ? tk("n10.playback.playing") : tk("n10.playback.stopped", { timecode: formatTimecode(frameNow(), fps) })}
        </span>
        <IconButton
          label={tk("app-scene-editor-timeline.timeline.label.94cab46a8c43")}
          onClick={() => playback.setFrame(0)}
          className="size-7"
        >
          <SkipBack className="size-3.5" />
        </IconButton>
        <IconButton
          label={tk("app-scene-editor-timeline.timeline.label.807cf7b285c2")}
          onClick={() => playback.setFrame(frameNow() - 1)}
          className="size-7"
        >
          <ChevronLeft className="size-3.5" />
        </IconButton>
        <button
          type="button"
          aria-label={playback.playing ? tk("app-scene-editor-timeline.timeline.aria-label.9d44a6c2d1c0") : tk("app-scene-editor-timeline.timeline.aria-label.df853fc99f9b")}
          title={
            playback.playing
              ? tk("app-scene-editor-timeline.timeline.title.818c0e56796c")
              : tk("app-scene-editor-timeline.timeline.title.32e5363a4a3f")
          }
          onClick={playback.toggle}
          className={iconButton + " size-7 bg-surface-3 text-text-primary"}
        >
          {playback.playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        </button>
        <IconButton
          label={tk("app-scene-editor-timeline.timeline.label.958ccea26d81")}
          onClick={() => playback.setFrame(frameNow() + 1)}
          className="size-7"
        >
          <ChevronRight className="size-3.5" />
        </IconButton>
        <IconButton
          label={tk("app-scene-editor-timeline.timeline.label.2fec9b07be1e")}
          onClick={() => playback.setFrame(last)}
          className="size-7"
        >
          <SkipForward className="size-3.5" />
        </IconButton>
        <IconButton
          label={tk("app-scene-editor-timeline.timeline.label.a18955e0b40b")}
          active={playback.loop}
          onClick={() => playback.setLoop(!playback.loop)}
          className="size-7"
        >
          <Repeat className="size-3.5" />
        </IconButton>
        <span
          className="shrink-0 whitespace-nowrap px-1 font-mono text-[13px] tabular-nums text-text-primary"
          aria-live="off"
          data-testid="timecode"
          aria-label={tk("app-scene-editor-timeline.timeline.aria-label.3369220b3383")}
        >
          <FrameValue playback={playback}>{(f) => formatTimecode(f, fps)}</FrameValue>
          <span className="text-text-tertiary"> / {formatTimecode(durationFrames, fps)}</span>
        </span>

        <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden="true" />

        <label className="flex shrink-0 items-center gap-1.5 text-xs text-text-secondary">
          {tk("app-scene-editor-timeline.timeline.label.51ad68b066b9")}
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
            title={tk("app-scene-editor-timeline.timeline.title.746ef89f4de8")}
            onClick={() => {
              // B-041: lengdeendringer brukeren gjør, går gjennom metodevalget – unntatt i en scene uten
              // innhold med tidspunkter, eller når den beregnede lengden er den samme.
              const calculated = compositionDuration(state, { ...composition, durationFrames: 0 });
              if (
                retime &&
                calculated !== durationFrames &&
                retimeHasTimedContent(state, retime.occurrenceId)
              )
                setRetimeTarget(calculated);
              else
                updateComposition(tk("app-scene-editor-timeline.timeline.update-composition.3e0b56d97480"), {
                  durationFrames: 0,
                });
            }}
          >
            {tk("app-scene-editor-timeline.timeline.button.85f295f03ce8")}
          </Button>
        ) : null}
        {retime ? (
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0"
            disabled={!editable}
            data-testid="lock-range-button"
            title={tk("app-scene-editor-timeline.timeline.title.b4aaaa2bd07d")}
            onClick={addLockedRange}
          >
            <Lock className="size-3" />
            {tk("app-scene-editor-timeline.timeline.button.c0d9ac462bc3")}
          </Button>
        ) : null}

        <button
          type="button"
          role="switch"
          aria-checked={autoKey}
          disabled={!editable}
          onClick={() => onAutoKeyChange(!autoKey)}
          title={tk("app-scene-editor-timeline.timeline.title.580b2504685a")}
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
          {tk("app-scene-editor-timeline.timeline.button.1dc5451f8322")}
        </button>

        <Button
          size="sm"
          variant="secondary"
          className="shrink-0"
          disabled={!editable || !selectedLayer}
          title={tk("app-scene-editor-timeline.timeline.title.bce202839384")}
          onClick={keyAll}
        >
          <Diamond className="size-3" />
          {tk("app-scene-editor-timeline.timeline.button.f507a12a9b1e")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="shrink-0"
          disabled={!editable}
          onClick={addShot}
        >
          <Video className="size-3" />
          {tk("app-scene-editor-timeline.timeline.button.66fbce73646c")}
        </Button>

        {keyValid && keyLayer ? (
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-text-secondary">
            {tk("app-scene-editor-timeline.timeline.label.8b7e2e58d609")}
            <select
              value={easingNow}
              disabled={!editable}
              onChange={(e) => {
                const next = EASINGS.find((x) => x === e.target.value);
                if (next && keySel)
                  updateKeys(
                    keyLayer,
                    tk("app-scene-editor-timeline.timeline.update-keys.41b874724500"),
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
            title={tk("app-scene-editor-timeline.timeline.title.93b3cc252828")}
          >
            Ease
            {(["easeIn", "easeOut"] as const).map((key) => {
              const k0 = keyHere[0]!;
              const def = EASE_STRENGTH[easingNow][key === "easeOut" ? 0 : 1];
              const v = k0[key] ?? def;
              return (
                <PercentInput
                  key={key}
                  label={key === "easeIn" ? tk("app-scene-editor-timeline.timeline.label.7e00763c5a0f") : tk("app-scene-editor-timeline.timeline.label.b92a408a1185")}
                  title={
                    key === "easeIn"
                      ? tk("app-scene-editor-timeline.timeline.title.5563fee97b5d")
                      : tk("app-scene-editor-timeline.timeline.title.b47281973e3f")
                  }
                  value={v}
                  disabled={!editable}
                  className={ctl}
                  onCommit={(n) =>
                    keySel &&
                    updateKeys(
                      keyLayer,
                      key === "easeIn"
                        ? tk("app-scene-editor-timeline.timeline.update-keys.1cb7f8aa217e")
                        : tk("app-scene-editor-timeline.timeline.update-keys.85d4b47ed891"),
                      setKeyframeEase(keyLayer.keyframes, keySel.frame, { [key]: n }),
                    )
                  }
                />
              );
            })}
          </span>
        ) : null}

        <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2 text-xs text-text-tertiary">
          {tk("app-scene-editor-timeline.timeline.span.6d1a72ff01fd")}
          <input
            type="range"
            aria-label={tk("app-scene-editor-timeline.timeline.aria-label.a851ee98f14c")}
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
              {tk("app-scene-editor-timeline.timeline.div.8ad8daaac00b")}
              <PaneResizer
                edge="right"
                size={labelW}
                onSize={setLabelW}
                min={LABEL_MIN}
                max={LABEL_MAX}
                label={tk("app-scene-editor-timeline.timeline.label.f8babbeef96d")}
              />
            </div>
            <div style={{ width: GUTTER }} className="shrink-0" aria-hidden="true" />
            <div
              ref={trackRef}
              data-testid="timeline-ruler"
              className="relative h-5 shrink-0 cursor-col-resize touch-none"
              style={{ width: trackW }}
              onPointerDown={(e) => {
                // Shift + dra over linjalen lager et låst tidsrom (SV1)
                if (e.shiftKey && retime && editable && e.button === 0) {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const f = rangeFrameAt(e.clientX);
                  setRangeDrag({ id: null, edge: "new", anchor: f, start: f, end: f });
                  return;
                }
                onRulerDown(e);
              }}
              onPointerMove={(e) => {
                if (rangeDrag) moveRangeDrag(e.clientX);
                else onRulerMove(e);
              }}
              onPointerUp={() => {
                if (rangeDrag) finishRangeDrag();
              }}
              onPointerCancel={() => setRangeDrag(null)}
            >
              <RulerTicks ppf={ppf} durationFrames={durationFrames} fps={fpsN} />
              {rangeDrag?.id === null ? (
                <div
                  data-testid="locked-range-draft"
                  className="pointer-events-none absolute inset-y-0 border-x border-accent-warm bg-accent-warm/25"
                  style={{
                    left: rangeDrag.start * ppf,
                    width: (rangeDrag.end - rangeDrag.start) * ppf,
                  }}
                />
              ) : null}
              {timingOf(composition).lockedRanges.map((orig) => {
                const r =
                  rangeDrag && rangeDrag.id === orig.id
                    ? { ...orig, startFrame: rangeDrag.start, endFrame: rangeDrag.end }
                    : orig;
                const edge = (which: "start" | "end") =>
                  editable ? (
                    <div
                      role="slider"
                      tabIndex={-1}
                      aria-label={
                        which === "start"
                          ? tk("app-scene-editor-timeline.edge.aria-label.c2fd7068f1bf")
                          : tk("app-scene-editor-timeline.edge.aria-label.eb8faebeebf9")
                      }
                      aria-valuenow={which === "start" ? r.startFrame : r.endFrame}
                      data-testid={`locked-range-${which}`}
                      className={
                        "absolute inset-y-0 w-1.5 cursor-ew-resize touch-none bg-accent-warm/70 " +
                        (which === "start" ? "left-0" : "right-0")
                      }
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        setRangeDrag({
                          id: orig.id,
                          edge: which,
                          anchor: which === "start" ? orig.endFrame : orig.startFrame,
                          start: orig.startFrame,
                          end: orig.endFrame,
                        });
                      }}
                      onPointerMove={(e) => moveRangeDrag(e.clientX)}
                      onPointerUp={finishRangeDrag}
                      onPointerCancel={() => setRangeDrag(null)}
                    />
                  ) : null;
                return (
                  <div
                    key={r.id}
                    data-testid="locked-range"
                    title={tk("app-scene-editor-timeline.timeline.title.b4fcd96ea698") + (r.label ? `: ${r.label}` : "")}
                    className="absolute inset-y-0 flex items-start justify-end border-x border-accent-warm bg-accent-warm/25"
                    style={{ left: r.startFrame * ppf, width: (r.endFrame - r.startFrame) * ppf }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    {edge("start")}
                    {editable ? (
                      <button
                        type="button"
                        aria-label={tk("app-scene-editor-timeline.timeline.aria-label.fe8575fd6d98")}
                        data-testid="locked-range-remove"
                        className="relative mr-2 text-[11px] leading-none text-text-secondary hover:text-text-primary"
                        onClick={() =>
                          setLockedRanges(
                            timingOf(composition).lockedRanges.filter((x) => x.id !== r.id),
                            tk("app-scene-editor-timeline.timeline.set-locked-ranges.fe8575fd6d98"),
                          )
                        }
                      >
                        ×
                      </button>
                    ) : null}
                    {edge("end")}
                  </div>
                );
              })}
              {retime && editable ? (
                <div
                  role="slider"
                  tabIndex={0}
                  aria-label={tk("app-scene-editor-timeline.timeline.aria-label.19e7bbeab547")}
                  aria-valuemin={1}
                  aria-valuenow={endDrag?.frames ?? durationFrames}
                  data-testid="scene-end-handle"
                  className="absolute inset-y-0 z-10 w-2 -translate-x-1/2 cursor-ew-resize rounded-sm bg-accent-brand/70 touch-none"
                  style={{ left: (endDrag?.frames ?? durationFrames) * ppf }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setEndDrag({ x0: e.clientX, frames: durationFrames });
                  }}
                  onPointerMove={(e) => {
                    if (!endDrag) return;
                    const f = Math.max(
                      1,
                      durationFrames + Math.round((e.clientX - endDrag.x0) / ppf),
                    );
                    setEndDrag({ ...endDrag, frames: f });
                  }}
                  onPointerUp={() => {
                    const f = endDrag?.frames;
                    setEndDrag(null);
                    if (f !== undefined && f !== durationFrames) setRetimeTarget(f);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setRetimeTarget(durationFrames);
                  }}
                />
              ) : null}
              <FrameValue playback={playback}>{(f) => (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute top-0 size-2.5 -translate-x-1/2 rounded-b-sm bg-accent-brand shadow-sm ring-1 ring-bg-app"
                style={{ left: f * ppf }}
              />)}</FrameValue>
            </div>
          </div>

          {/* Kamera */}
          <div className="flex border-b border-border" style={{ height: ROW_H }}>
            <div
              className="sticky left-0 z-20 flex shrink-0 items-center gap-1.5 border-r border-border-strong bg-surface-2 px-2 text-[13px] text-text-secondary"
              style={{ width: labelW }}
            >
              <Video className="size-3.5 shrink-0" />
              {tk("app-scene-editor-timeline.timeline.div.d6df57a05be2")}
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
                activeShotId={activeShotId}
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
              {tk("app-scene-editor-timeline.timeline.p.709d085af7f0")}
            </p>
          ) : (
            front.map((l) => (
              <SpacingRow key={l.id} state={state} layer={l} ppf={ppf} trackLeft={labelW + GUTTER} durationFrames={durationFrames}
                editable={editable} run={run} frameFromX={frameFromX}
                onHover={spacing?.onHover ?? null} onPreview={spacing?.onPreview ?? null}>
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
              {l.id === selectedLayerId ? (
                <PathSpacingTrack layer={l} ppf={ppf} gutter={GUTTER} labelCss={LABEL_CSS} playback={playback} />
              ) : null}
              </SpacingRow>
            ))
          )}

          {audioRows?.({ ppf, labelW, gutter: GUTTER, rowH: ROW_H, fps: fpsN })}

          {/* Avspillingshodet (den eneste delen som følger bildet) */}
          <FrameValue playback={playback}>{(f) => (
          <div
            aria-hidden="true"
            data-testid="timeline-playhead"
            className="pointer-events-none absolute inset-y-0 z-10 w-px bg-text-primary"
            style={{ left: TRACK_X + f * ppf }}
          />)}</FrameValue>
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
        aria-label={tk("app-scene-editor-timeline.percent-input.aria-label.f4115d401063", { label: String(label) })}
        className={className + " w-12"}
      />
      %
    </label>
  );
}
