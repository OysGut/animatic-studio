/**
 * Tidslinjen i sceneeditoren (mandat 11.3 og 12.5): avspilling, nøkkelbilder, hastighetskurver, varighet og
 * kamerautsnitt. Hver redigering er én kommando; dra-operasjoner viser et lokalt utkast og lagrer ved slipp.
 * Under avspilling endres bare avspillingshodet (radene er memoisert).
 */
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
} from "@/core";
import { PaneResizer, usePaneSize } from "@/app/shell/pane-size";
import { Button } from "@/components/ui/button";
import type { Playback } from "./use-playback";

const LABEL_W = 160;
/** Luft mellom sporoverskriftene og bilde 0, slik at et nøkkelbilde på bilde 0 ikke skjules av overskriften. */
const GUTTER = 8;
const TRACK_X = LABEL_W + GUTTER;
const ROW_H = 24;
const MAX_ZOOM = 24;

const EASING_LABEL: Record<Easing, string> = {
  linear: "Jevn",
  "ease-in": "Myk start",
  "ease-out": "Myk slutt",
  "ease-in-out": "Myk start og slutt",
  hold: "Hold",
};

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
interface KeySel {
  readonly layerId: string;
  readonly frame: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function compositionFieldsOf(c: Composition): CompositionFields {
  return {
    name: c.name,
    width: c.width,
    height: c.height,
    durationFrames: c.durationFrames,
    background: c.background,
  };
}

/** Skal tastetrykk i dette elementet være i fred for tidslinjens snarveier? */
function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return (
    t instanceof HTMLInputElement ||
    t instanceof HTMLTextAreaElement ||
    t instanceof HTMLSelectElement ||
    t.isContentEditable
  );
}

const iconButton =
  "inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-3 hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

function IconButton({
  label,
  onClick,
  active,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
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
      className={iconButton + (active ? " bg-accent-selection text-text-primary" : "")}
    >
      {children}
    </button>
  );
}

// ---------- Linjal ----------

const TICK_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];

const RulerTicks = memo(function RulerTicks({
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
        className="absolute top-0 h-full whitespace-nowrap border-l border-border-control pl-1 text-[10px] leading-4 text-text-tertiary"
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
          className="absolute bottom-0 h-1.5 border-l border-border"
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
  ppf,
  editable,
  onShotPointerDown,
  onShotPointerMove,
  onShotPointerUp,
}: {
  shots: readonly CameraShot[];
  draft: ShotDraft | null;
  selectedShotId: string | null;
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
            aria-label={`Kamerautsnitt${sh.name ? ` ${sh.name}` : ""}, bilde ${start} til ${end}`}
            aria-pressed={selected}
            onPointerDown={(e) => onShotPointerDown(e, sh, "move")}
            onPointerMove={onShotPointerMove}
            onPointerUp={onShotPointerUp}
            onPointerCancel={onShotPointerUp}
            className={
              "absolute top-[3px] h-[18px] overflow-hidden rounded-sm border text-[10px] leading-[16px] text-white/90 " +
              (selected ? "border-text-primary" : "border-white/20") +
              (editable ? " cursor-grab active:cursor-grabbing" : "")
            }
            style={{
              left: start * ppf,
              width: Math.max(6, (end - start + 1) * ppf),
              background:
                "linear-gradient(90deg, oklch(0.5 0.1 250 / 0.85), oklch(0.5 0.12 25 / 0.85))",
            }}
          >
            <span className="pointer-events-none truncate px-2">{sh.name || "Utsnitt"}</span>
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
}: {
  layer: CompositionLayer;
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
      className={"flex border-b border-border/60 " + (selected ? "bg-accent-selection" : "")}
      style={{ height: ROW_H }}
    >
      <div
        className={
          "sticky left-0 z-20 flex shrink-0 items-center border-r border-border px-2 text-[13px] " +
          (selected ? "bg-surface-2 text-text-primary" : "bg-surface-1 text-text-secondary")
        }
        style={{ width: LABEL_W }}
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
        {frames.map((f) => {
          const isSel = selectedKeyFrame === f;
          return (
            <div
              key={f}
              role="button"
              tabIndex={-1}
              aria-label={`Nøkkelbilde på bilde ${f}`}
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
                  "block size-2 rotate-45 " +
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
}: Props) {
  const [height, setHeight] = usePaneSize("scene-editor-timeline", 252, 150, 560, {
    axis: "y",
    viewportShare: 0.6,
  });
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

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ frame: number; cursorX: number } | null>(null);

  const fitPpf = Math.max(0.05, (viewW - TRACK_X - 16) / Math.max(1, durationFrames));
  const ppf = fitPpf * zoom;
  const trackW = durationFrames * ppf;

  // Siste verdier til stabile hendelsesfunksjoner (radene er memoisert og skal ikke tegnes om hvert bilde)
  const latest = useRef({ composition, run, playback, editable, ppf, last, state });
  latest.current = { composition, run, playback, editable, ppf, last, state };
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
      const { ppf: cur } = latest.current;
      anchor.current = { frame: (el.scrollLeft + cursorX - TRACK_X) / cur, cursorX };
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
  }, [ppf]);

  // Avspillingshodet holdes synlig når det er zoomet inn
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || zoom <= 1.001) return;
    const x = frame * ppf;
    const left = el.scrollLeft;
    const right = left + el.clientWidth - TRACK_X;
    if (x < left || x > right) el.scrollLeft = Math.max(0, x - (el.clientWidth - TRACK_X) / 4);
  }, [frame, ppf, zoom]);

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
    updateKeys(keyLayer, "Slett nøkkelbilde", removeKeyframesAt(keyLayer.keyframes, keySel.frame));
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
        updateKeys(layer, "Flytt nøkkelbilde", moveKeyframes(layer.keyframes, draft.from, draft.to))
      ) {
        setKeySel({ layerId: d.layerId, frame: draft.to });
        latest.current.playback.setFrame(draft.to);
      }
    },
    [updateKeys],
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
        d.mode === "move" ? "Flytt kamerautsnitt" : "Endre lengde på kamerautsnitt",
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
    updateComposition("Endre varighet", { durationFrames: frames });
  }

  function keyAll() {
    if (!selectedLayer) return;
    updateKeys(selectedLayer, "Nøkkelbilde", keyAllAt(selectedLayer, frame));
  }

  function addShot() {
    const id = newId<"camera_shot">();
    const slot = freeShotSlot(composition.camera, frame, Math.round(3 * fpsN), last);
    if (!slot) {
      setError("Det er ikke plass til et nytt kamerautsnitt her. Flytt avspillingshodet.");
      return;
    }
    const ok = updateComposition(
      "Nytt kamerautsnitt",
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
      aria-label="Tidslinje"
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
        label="Høyde på tidslinjen"
      />
      {/* Transport og verktøy */}
      <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-x-1.5 gap-y-1 border-b border-border px-2 py-1">
        <IconButton label="Til start" onClick={() => playback.setFrame(0)}>
          <SkipBack className="size-3.5" />
        </IconButton>
        <IconButton label="Forrige bilde" onClick={() => playback.setFrame(frame - 1)}>
          <ChevronLeft className="size-3.5" />
        </IconButton>
        <button
          type="button"
          aria-label={playback.playing ? "Pause" : "Spill av"}
          title={playback.playing ? "Pause (mellomrom)" : "Spill av (mellomrom)"}
          onClick={playback.toggle}
          className={iconButton + " bg-surface-3 text-text-primary"}
        >
          {playback.playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        </button>
        <IconButton label="Neste bilde" onClick={() => playback.setFrame(frame + 1)}>
          <ChevronRight className="size-3.5" />
        </IconButton>
        <IconButton label="Til slutt" onClick={() => playback.setFrame(last)}>
          <SkipForward className="size-3.5" />
        </IconButton>
        <IconButton
          label="Løkke"
          active={playback.loop}
          onClick={() => playback.setLoop(!playback.loop)}
        >
          <Repeat className="size-3.5" />
        </IconButton>
        <span
          className="shrink-0 whitespace-nowrap px-1 font-mono text-xs tabular-nums text-text-primary"
          aria-label="Tid"
        >
          {formatTimecode(frame, fps)}
          <span className="text-text-tertiary"> / {formatTimecode(durationFrames, fps)}</span>
        </span>

        <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden="true" />

        <label className="flex shrink-0 items-center gap-1.5 text-xs text-text-secondary">
          Varighet (s)
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
            title="Bruk varigheten som er beregnet fra manuset"
            onClick={() => updateComposition("Varighet fra manus", { durationFrames: 0 })}
          >
            Fra manus
          </Button>
        ) : null}

        <button
          type="button"
          role="switch"
          aria-checked={autoKey}
          disabled={!editable}
          onClick={() => onAutoKeyChange(!autoKey)}
          title="Endringer på et bilde blir nøkkelbilder"
          className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-sm px-1.5 text-xs text-text-secondary hover:bg-surface-3 hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
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
          Automatiske nøkkelbilder
        </button>

        <Button
          size="sm"
          variant="secondary"
          className="shrink-0"
          disabled={!editable || !selectedLayer}
          title="Nøkkelbilde for alle egenskaper på dette bildet"
          onClick={keyAll}
        >
          <Diamond className="size-3" />
          Nøkkelbilde
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="shrink-0"
          disabled={!editable}
          onClick={addShot}
        >
          <Video className="size-3" />
          Nytt kamerautsnitt
        </Button>

        {keyValid && keyLayer ? (
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-text-secondary">
            Hastighetskurve
            <select
              value={easingNow}
              disabled={!editable}
              onChange={(e) => {
                const next = EASINGS.find((x) => x === e.target.value);
                if (next && keySel)
                  updateKeys(
                    keyLayer,
                    "Endre hastighetskurve",
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

        <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2 text-xs text-text-tertiary">
          Zoom
          <input
            type="range"
            aria-label="Zoom tidslinjen"
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
        <div className="relative" style={{ width: TRACK_X + trackW + GUTTER, minHeight: "100%" }}>
          <div className="sticky top-0 z-30 flex border-b border-border bg-surface-1">
            <div
              className="sticky left-0 z-10 shrink-0 border-r border-border bg-surface-1 px-2 text-xs leading-5 text-text-tertiary"
              style={{ width: LABEL_W }}
            >
              Spor
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
                className="pointer-events-none absolute top-0 size-2.5 -translate-x-1/2 rounded-b-sm bg-accent-brand"
                style={{ left: frame * ppf }}
              />
            </div>
          </div>

          {/* Kamera */}
          <div className="flex border-b border-border/60" style={{ height: ROW_H }}>
            <div
              className="sticky left-0 z-20 flex shrink-0 items-center gap-1.5 border-r border-border bg-surface-1 px-2 text-[13px] text-text-secondary"
              style={{ width: LABEL_W }}
            >
              <Video className="size-3.5 shrink-0" />
              Kamera
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
              Ingen lag i scenen ennå.
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
              />
            ))
          )}

          {/* Avspillingshodet (den eneste delen som følger bildet) */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 z-10 w-px bg-accent-brand"
            style={{ left: TRACK_X + frame * ppf }}
          />
        </div>
      </div>
    </div>
  );
}
