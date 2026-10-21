/**
 * U5 del B (§73–§96): dra-modusen i rytmeverktøyet. Holdes Cmd (Mac) eller Ctrl, følger sonen musepekeren
 * (bare forhåndsvisning). Klikkpunktet er skjæringspunktet; draget gir forskyvningen (vannrett grovt, loddrett
 * ±1 frame, skrått blandet), Shift fordeler proporsjonalt. Slippes knappen, kjøres én RetimeScene (én angring).
 * Escape, tap av fokus eller avbrutt peker forkaster draget. Beskyttede og låste tidsrom flyttes aldri.
 */
import { useEffect, useRef, useState } from "react";
import { type ProjectState } from "@/core";
import type { Command } from "@/core/commands/types";
import { planRhythm, rhythmDragShift, rhythmProtectedEnd } from "@/core/animation/rhythm";
import { formatAnimationTime, formatFrameGap } from "@/core/animation/time-format";
import type { AnimWindow } from "./TimeNavigator";
import { t } from "@/core/i18n/keyed";

export interface RhythmDragProps {
  readonly state: ProjectState;
  readonly occurrenceId: string;
  readonly editable: boolean;
  readonly run: (c: Command, label: string) => string | null;
}

interface Drag { readonly cut: number; readonly x: number; readonly y: number; readonly pointerId: number }

export function RhythmDragLayer({ state, occurrenceId, editable, run, view, duration }: RhythmDragProps & { view: AnimWindow; duration: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [shift, setShift] = useState(0);
  const [spread, setSpread] = useState(false);
  const [markers, setMarkers] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fps = state.project.fps;
  const guard = rhythmProtectedEnd(state, occurrenceId);

  useEffect(() => {
    if (!editable) return;
    const down = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Control") setArmed(true);
      if (e.key === "Escape") { setDrag(null); setShift(0); }
    };
    const up = (e: KeyboardEvent) => { if (e.key === "Meta" || e.key === "Control") { setArmed(false); setHover(null); } };
    const blur = () => { setArmed(false); setHover(null); setDrag(null); setShift(0); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, [editable]);

  const frameAt = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r?.width) return 0;
    return Math.max(0, Math.min(duration, Math.round(view.from + ((clientX - r.left) / r.width) * view.span)));
  };
  const pxPerFrame = () => (ref.current?.clientWidth ?? 1) / Math.max(1, view.span);
  const pct = (f: number) => `${((f - view.from) / view.span) * 100}%`;

  const cut = drag?.cut ?? hover;
  const plan = drag && shift ? planRhythm(state, occurrenceId, { tempo: 1, cutFrame: drag.cut, shiftFrames: shift, proportional: spread }) : null;
  const delta = plan ? plan.afterFrames - plan.beforeFrames : 0;
  const active = editable && (armed || !!drag);

  const finish = (commit: boolean) => {
    if (commit && plan?.retime?.ok && delta) {
      const failure = run(plan.retime.command, t("app-scene-editor-animation-rhythm-drag.failure.run.a27f0b09e0bc"));
      setError(failure);
    } else if (commit && plan?.error) setError(plan.error);
    setDrag(null); setShift(0);
  };

  return <div ref={ref} data-testid="ca8-rhythm-drag-layer" data-armed={active ? "true" : "false"}
    aria-hidden={!active}
    className={`absolute inset-0 z-20 ${active ? "pointer-events-auto" : "pointer-events-none"} ${drag ? "cursor-none" : active ? "cursor-col-resize" : ""}`}
    onPointerMove={e => {
      if (!drag) { if (armed) setHover(frameAt(e.clientX)); return; }
      setSpread(e.shiftKey);
      setShift(rhythmDragShift((e.clientX - drag.x) / pxPerFrame(), e.clientY - drag.y));
    }}
    onPointerDown={e => {
      if (!active || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault(); e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      const f = frameAt(e.clientX);
      setError(null);
      setDrag({ cut: f, x: e.clientX, y: e.clientY, pointerId: e.pointerId });
      setMarkers(m => [...m.slice(-4), f]);
    }}
    onPointerUp={() => finish(true)}
    onPointerCancel={() => finish(false)}
    onLostPointerCapture={() => { if (drag) finish(false); }}>
    {active && cut !== null ? <>
      {/* §83: oransje overdekning (ca. 12 %) fra skjæringspunktet til slutten av scenen */}
      <div data-testid="ca8-rhythm-zone" className="absolute inset-y-0 right-0 bg-status-discrepancy/12" style={{ left: pct(Math.max(cut, guard)) }} />
      {/* §84: beskyttet/uberørt del foran sonen */}
      {guard > view.from ? <div data-testid="ca8-rhythm-protected" className="absolute inset-y-0 left-0 bg-bg-app/50" style={{ width: pct(Math.min(guard, view.from + view.span)) }} /> : null}
      {drag ? <div data-testid="ca8-rhythm-cut-line" className="absolute inset-y-0 w-px bg-accent-warm" style={{ left: pct(drag.cut) }} /> : null}
    </> : null}
    {/* §93: tidligere klikkpunkter blekner, den nyeste er tydeligst (lagres ikke) */}
    {active ? markers.map((m, i) => <span key={`${m}-${i}`} className="absolute top-0 h-2 w-2 -translate-x-1 rounded-full bg-accent-warm"
      style={{ left: pct(m), opacity: (i + 1) / markers.length }} />) : null}
    {drag ? <div className="pointer-events-none absolute inset-x-0 top-1 flex justify-center">
      <span data-testid="ca8-rhythm-drag-delta" className="rounded-sm bg-accent-warm px-1.5 font-mono text-xs text-accent-fg">
        {delta ? `${delta > 0 ? "+" : "−"} ${formatFrameGap(Math.abs(delta), fps)}` : t("app-scene-editor-animation-rhythm-drag.rhythm-drag-layer.span.6360c6e28d2a")}
      </span>
    </div> : null}
    {drag ? <output data-testid="ca8-rhythm-drag-duration" className="pointer-events-none absolute right-2 top-1 rounded-sm bg-surface-2 px-1.5 font-mono text-xs text-text-primary">
      {t("app-scene-editor-animation-rhythm-drag.rhythm-drag-layer.output.a9e2010a7552")} {formatAnimationTime(plan?.afterFrames ?? duration, fps)}
    </output> : null}
    <div aria-live="polite" className="sr-only">{error ?? ""}</div>
    {error ? <p role="alert" className="absolute bottom-1 left-2 rounded-sm bg-surface-2 px-1.5 text-[11px] text-status-danger">{error}</p> : null}
  </div>;
}
