import { useLayoutEffect, useState, useRef, type ReactNode } from "react";
import { type Rational } from "@/core";
import { animationRuler } from "@/core/animation/time-format";
import type { Playback } from "../use-playback";
import type { AnimWindow } from "./TimeNavigator";
import { PlayRange, type AnimationRange } from "./PlayRange";
import { RhythmDragLayer, type RhythmDragProps } from "./RhythmDrag";
import { t as tk } from "@/core/i18n/keyed";

export function AnimTimeline({ fps, duration, playback, view, range, onRange, children, rhythm }: { fps: Rational; duration: number; playback: Playback; view: AnimWindow; range: AnimationRange; onRange: (r: AnimationRange) => void; children?: ReactNode; rhythm?: RhythmDragProps }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el); setWidth(el.clientWidth); return () => observer.disconnect();
  }, []);
  const ruler = animationRuler(view.from, view.span, fps, width);
  const seek = (x: number) => { const r = ref.current?.getBoundingClientRect(); if (r?.width) playback.setFrame(view.from + (x - r.left) / r.width * view.span); };
  return <div data-testid="anim-timeline" className="relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-surface-1">
    <div className="ml-40 shrink-0" ref={ref}>
      <PlayRange range={range} duration={duration} view={view} onChange={onRange} />
      <div data-testid="anim-ruler" role="slider" tabIndex={0} aria-label={tk("app-scene-editor-animation-anim-timeline.anim-timeline.aria-label.c6712cbb4162")} aria-valuenow={playback.frame} aria-valuemin={0} aria-valuemax={duration - 1}
        className="relative h-8 cursor-ew-resize border-b border-border bg-surface-2 focus-visible:ring-2 focus-visible:ring-focus-ring"
        onKeyDown={e => { if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return; e.preventDefault(); e.stopPropagation(); playback.pause(); playback.setFrame(playback.frame + (e.key === "ArrowRight" ? 1 : -1)); }}
        onPointerDown={e => { playback.pause(); e.currentTarget.setPointerCapture(e.pointerId); seek(e.clientX); }} onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) seek(e.clientX); }}>
        {ruler.frames.map(f => <span key={f} className="absolute bottom-0 h-1 w-px bg-border-control" style={{ left: `${(f - view.from) / view.span * 100}%` }} />)}
         {ruler.ticks.map(t => <span key={t.frame} className="absolute inset-y-0 border-l border-border-control pl-1 pt-1 font-mono text-xs text-text-secondary" style={{ left: `${(t.frame - view.from) / view.span * 100}%` }}>{t.label}</span>)}
      </div>
    </div>
    {children}
    {rhythm ? <div className="pointer-events-none absolute inset-y-0 ml-40" style={{ width: "calc(100% - 10rem)" }}>
      <RhythmDragLayer {...rhythm} view={view} duration={duration} />
    </div> : null}
    <div className="pointer-events-none absolute inset-y-0 ml-40" style={{ width: "calc(100% - 10rem)" }}>
      <div data-testid="anim-playhead" data-frame={playback.frame} className="absolute inset-y-0 w-px bg-accent-brand" style={{ left: `${(playback.frame - view.from) / view.span * 100}%` }} />
    </div>
  </div>;
}
