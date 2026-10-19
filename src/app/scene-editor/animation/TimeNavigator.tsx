import { L } from "@/core";
import { clampAnimationWindow } from "@/core/animation/time-format";
import { useRef } from "react";

export interface AnimWindow { from: number; span: number }
export function TimeNavigator({ duration, window: view, onChange }: { duration: number; window: AnimWindow; onChange: (next: AnimWindow) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; from: number } | null>(null);
  return <div ref={ref} data-testid="anim-navigator" role="slider" tabIndex={0}
    aria-label={L("Tidsnavigator", "Time navigator")} aria-valuemin={0} aria-valuemax={Math.max(0, duration - view.span)} aria-valuenow={view.from}
    className="relative m-2 h-6 shrink-0 cursor-grab rounded-sm border border-border-control bg-surface-0 focus-visible:ring-2 focus-visible:ring-focus-ring"
    onKeyDown={e => { if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return; e.preventDefault(); e.stopPropagation(); onChange(clampAnimationWindow(view.from + (e.key === "ArrowRight" ? 1 : -1), view.span, duration)); }}
    onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, from: view.from }; }}
    onPointerMove={e => { const d = drag.current; const width = ref.current?.clientWidth; if (d && width) onChange(clampAnimationWindow(d.from + (e.clientX - d.x) / width * duration, view.span, duration)); }}
    onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
    <div data-testid="anim-navigator-window" className="absolute inset-y-0 border border-accent-brand bg-accent-selection" style={{ left: `${view.from / duration * 100}%`, width: `${view.span / duration * 100}%` }} />
  </div>;
}
