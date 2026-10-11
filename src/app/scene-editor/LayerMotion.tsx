/**
 * Bevegelsesbane for et lag (DEC-0052, REQ-0581/0582): tegn banen på frihånd i scenen, «Glatt ut» eller
 * gjør den til en rett linje, og styr farten med ease ut/inn (styrke som i After Effects) og en tempokurve
 * med punkter som kan dras (som midtpunktet i nivåer i Photoshop).
 */
import { Pencil, Spline, Trash2, Minus } from "lucide-react";
import { useRef, useState } from "react";
import {
  layerFieldsOf,
  smoothPathPoints,
  straightPathPoints,
  tempoAt,
  type Command,
  type CompositionLayer,
  type MotionPath,
  type ProjectState,
} from "@/core";
import { Button } from "@/components/ui/button";
import { Hint, NumberField, Section } from "./inspector-fields";

type Run = (command: Command, label: string) => string | null;

export function LayerMotion({
  state,
  layer,
  editable,
  durationFrames,
  run,
  drawing,
  onDrawingChange,
}: {
  state: ProjectState;
  layer: CompositionLayer;
  editable: boolean;
  durationFrames: number;
  run: Run;
  drawing: boolean;
  onDrawingChange: (on: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const fps = state.project.fps.num / state.project.fps.den;
  const off = !editable;
  const path = layer.path;

  function setPath(label: string, next: MotionPath | null) {
    setError(
      run(
        {
          type: "UpdateLayers",
          layers: [{ layerId: layer.id, fields: { ...layerFieldsOf(layer), path: next } }],
        },
        label,
      ),
    );
  }

  const sec = (f: number) => Math.round((f / fps) * 100) / 100;
  const frames = (s: number) => Math.max(0, Math.round(s * fps));

  return (
    <Section title="Bevegelsesbane">
      {!path ? (
        <Hint>
          Tegn veien laget skal gå i scenen med musen. Banen starter der avspillingshodet står og
          varer i to sekunder; tidene kan endres etterpå.
        </Hint>
      ) : null}
      {editable ? (
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant={drawing ? "default" : "secondary"}
            aria-pressed={drawing}
            onClick={() => onDrawingChange(!drawing)}
            title="Tegn banen i scenen (Esc avbryter)"
          >
            <Pencil className="size-3.5" />
            {drawing ? "Tegner … (klikk for å avbryte)" : path ? "Tegn på nytt" : "Tegn bane"}
          </Button>
          {path ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setPath("Glatt ut banen", { ...path, points: smoothPathPoints(path.points) })
                }
                title="Færre punkter og myke kurver"
              >
                <Spline className="size-3.5" />
                Glatt ut
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setPath("Rett bane", { ...path, points: straightPathPoints(path.points) })
                }
                title="Rett linje fra start til slutt"
              >
                <Minus className="size-3.5" />
                Rett linje
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPath("Fjern bane", null)}
                className="text-status-danger hover:text-status-danger"
              >
                <Trash2 className="size-3.5" />
                Fjern
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
      {path ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Start (s)"
              value={sec(path.startFrame)}
              step={0.1}
              min={0}
              disabled={off}
              valid={(s) => frames(s) < path.endFrame}
              onCommit={(s) => setPath("Endre start på banen", { ...path, startFrame: frames(s) })}
            />
            <NumberField
              label="Slutt (s)"
              value={sec(path.endFrame)}
              step={0.1}
              min={0}
              disabled={off}
              valid={(s) => frames(s) > path.startFrame}
              onCommit={(s) => setPath("Endre slutt på banen", { ...path, endFrame: frames(s) })}
            />
          </div>
          {path.endFrame > durationFrames ? (
            <Hint>Banen slutter etter at scenen er ferdig.</Hint>
          ) : null}
          <EaseSlider
            label="Ease ut (start)"
            value={path.easeOut}
            disabled={off}
            onCommit={(v) => setPath("Endre ease ut", { ...path, easeOut: v })}
          />
          <EaseSlider
            label="Ease inn (slutt)"
            value={path.easeIn}
            disabled={off}
            onCommit={(v) => setPath("Endre ease inn", { ...path, easeIn: v })}
          />
          <TempoCurve
            tempo={path.tempo}
            disabled={off}
            onCommit={(tempo, label) => setPath(label, { ...path, tempo })}
          />
          <Hint>
            Dra punktene på banen i scenen. Dobbeltklikk et punkt: kurve eller hjørne. Alt-klikk:
            fjern punktet.
          </Hint>
        </>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-status-danger">
          {error}
        </p>
      ) : null}
    </Section>
  );
}

/** Styrke 0–100 % som lagres når du slipper glidebryteren. */
export function EaseSlider({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? Math.round(value * 100);
  function commit() {
    if (draft === null) return;
    setDraft(null);
    if (draft !== Math.round(value * 100)) onCommit(draft / 100);
  }
  return (
    <label className="flex items-center gap-2 text-xs text-text-secondary">
      <span className="w-24 shrink-0">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={shown}
        disabled={disabled}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        className="min-w-0 flex-1 accent-[var(--accent-brand)]"
      />
      <span className="w-9 shrink-0 text-right tabular-nums">{shown} %</span>
    </label>
  );
}

const W = 180;
const H = 110;
const PAD = 8;

/**
 * Tempokurven: vannrett er tiden, loddrett hvor langt laget har kommet. Klikk legger til et punkt, dra
 * flytter det, dobbeltklikk fjerner det. Uten punkter er farten jevn.
 */
function TempoCurve({
  tempo,
  disabled,
  onCommit,
}: {
  tempo: MotionPath["tempo"];
  disabled: boolean;
  onCommit: (tempo: MotionPath["tempo"], label: string) => void;
}) {
  const [draft, setDraft] = useState<MotionPath["tempo"] | null>(null);
  const drag = useRef<{
    index: number;
    pointerId: number;
    moved: boolean;
    x: number;
    y: number;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pts = draft ?? tempo;
  const sx = (t: number) => PAD + t * (W - 2 * PAD);
  const sy = (p: number) => H - PAD - p * (H - 2 * PAD);
  const at = (e: React.PointerEvent | React.MouseEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const t = ((e.clientX - r.left) / r.width) * W;
    const p = ((e.clientY - r.top) / r.height) * H;
    return {
      t: Math.min(1, Math.max(0, (t - PAD) / (W - 2 * PAD))),
      p: Math.min(1, Math.max(0, (H - PAD - p) / (H - 2 * PAD))),
    };
  };
  const round = (v: number) => Math.round(v * 1000) / 1000;
  /** Punktet holdes mellom naboene (tiden stiger, veien går aldri bakover). */
  function place(list: MotionPath["tempo"], i: number, q: { t: number; p: number }) {
    const prev = list[i - 1] ?? { t: 0, p: 0 };
    const next = list[i + 1] ?? { t: 1, p: 1 };
    return {
      t: round(Math.min(next.t - 0.01, Math.max(prev.t + 0.01, q.t))),
      p: round(Math.min(next.p, Math.max(prev.p, q.p))),
    };
  }
  const curve = Array.from({ length: 41 }, (_, k) => {
    const t = k / 40;
    return `${k === 0 ? "M" : "L"}${sx(t).toFixed(1)},${sy(tempoAt(pts, t)).toFixed(1)}`;
  }).join(" ");

  function onDown(e: React.PointerEvent<SVGSVGElement>) {
    if (disabled || e.button !== 0) return;
    const q = at(e);
    let i = pts.findIndex(
      (x) =>
        Math.hypot(sx(x.t) - sx(q.t), sy(x.p) - sy(q.p)) <=
        8 * (W / (svgRef.current?.getBoundingClientRect().width || W)),
    );
    let list = pts;
    if (i < 0) {
      // Nytt punkt der du klikker
      if (pts.length >= 20 || q.t <= 0.01 || q.t >= 0.99) return;
      i = pts.filter((x) => x.t < q.t).length;
      const tmp = [...pts.slice(0, i), q, ...pts.slice(i)];
      list = tmp.map((x, k) => (k === i ? place(tmp, k, x) : x));
      drag.current = { index: i, pointerId: e.pointerId, moved: true, x: e.clientX, y: e.clientY };
    } else
      drag.current = { index: i, pointerId: e.pointerId, moved: false, x: e.clientX, y: e.clientY };
    setDraft(list);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId || !draft) return;
    // Små skjelvinger er ikke en endring (ett angresteg for mye)
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 3) return;
    d.moved = true;
    setDraft(draft.map((x, k) => (k === d.index ? place(draft, k, at(e)) : x)));
  }
  function onUp(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    const list = draft;
    setDraft(null);
    if (list && d.moved)
      onCommit(list, list.length > tempo.length ? "Nytt punkt i tempokurven" : "Endre tempokurven");
  }
  function onDouble(e: React.MouseEvent<SVGSVGElement>) {
    if (disabled) return;
    const q = at(e);
    const i = tempo.findIndex((x) => Math.hypot(sx(x.t) - sx(q.t), sy(x.p) - sy(q.p)) <= 10);
    if (i >= 0)
      onCommit(
        tempo.filter((_, k) => k !== i),
        "Fjern punkt i tempokurven",
      );
  }

  return (
    <div className="flex flex-col gap-1 text-xs text-text-secondary">
      <span className="flex items-center justify-between">
        Tempo
        {tempo.length > 0 && !disabled ? (
          <button
            type="button"
            onClick={() => onCommit([], "Jevnt tempo")}
            className="rounded-sm px-1 text-[11px] text-text-tertiary hover:bg-surface-3 hover:text-text-primary"
          >
            Jevnt tempo
          </button>
        ) : null}
      </span>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Tempokurve med ${tempo.length} punkter`}
        className={
          "w-full max-w-[240px] touch-none rounded-sm border border-border bg-surface-3 " +
          (disabled ? "opacity-60" : "cursor-crosshair")
        }
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => {
          drag.current = null;
          setDraft(null);
        }}
        onDoubleClick={onDouble}
      >
        <line
          x1={sx(0)}
          y1={sy(0)}
          x2={sx(1)}
          y2={sy(1)}
          stroke="currentColor"
          strokeOpacity={0.25}
          strokeDasharray="3 3"
        />
        <path d={curve} fill="none" stroke="var(--accent-brand)" strokeWidth={1.5} />
        {pts.map((q, i) => (
          <circle
            key={i}
            cx={sx(q.t)}
            cy={sy(q.p)}
            r={4}
            fill="#ffffff"
            stroke="var(--accent-brand)"
            strokeWidth={1.5}
          />
        ))}
      </svg>
      <span className="text-[11px] text-text-tertiary">
        Klikk for å legge til et punkt, dra for å endre farten, dobbeltklikk for å fjerne.
      </span>
    </div>
  );
}
