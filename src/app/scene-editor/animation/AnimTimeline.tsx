import { useRef, type ReactNode } from "react";
import { L, type Rational } from "@/core";
import { formatAnimationTime } from "@/core/animation/time-format";
import type { Playback } from "../use-playback";
import type { AnimWindow } from "./TimeNavigator";
import { PlayRange, type AnimationRange } from "./PlayRange";

export function AnimTimeline({ fps, duration, playback, view, range, onRange, children }: { fps: Rational; duration: number; playback: Playback; view: AnimWindow; range: AnimationRange; onRange: (r: AnimationRange) => void; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const seek = (x: number) => { const r = ref.current?.getBoundingClientRect(); if (r?.width) playback.setFrame(view.from + (x - r.left) / r.width * view.span); };
  return <div data-testid="anim-timeline" className="relative min-h-0 flex-1 overflow-y-auto bg-surface-1">
    <div className="ml-40" ref={ref}>
      <PlayRange range={range} duration={duration} view={view} onChange={onRange} />
      <div data-testid="anim-ruler" role="slider" tabIndex={0} aria-label={L("Avspillingshode", "Playhead")} aria-valuenow={playback.frame} aria-valuemin={0} aria-valuemax={duration - 1}
        className="relative h-8 cursor-ew-resize border-b border-border bg-surface-2 focus-visible:ring-2 focus-visible:ring-focus-ring"
        onKeyDown={e => { if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return; e.preventDefault(); e.stopPropagation(); playback.pause(); playback.setFrame(playback.frame + (e.key === "ArrowRight" ? 1 : -1)); }}
        onPointerDown={e => { playback.pause(); e.currentTarget.setPointerCapture(e.pointerId); seek(e.clientX); }} onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) seek(e.clientX); }}>
        {[0, 1, 2, 3, 4].map(i => <span key={i} className="absolute top-1 font-mono text-xs text-text-secondary" style={{ left: `${i * 20}%` }}>{formatAnimationTime(view.from + Math.round(view.span * i / 5), fps)}</span>)}
      </div>
    </div>
    {children}
    <div className="pointer-events-none absolute inset-y-0 ml-40" style={{ width: "calc(100% - 10rem)" }}>
      <div data-testid="anim-playhead" data-frame={playback.frame} className="absolute inset-y-0 w-px bg-accent-brand" style={{ left: `${(playback.frame - view.from) / view.span * 100}%` }} />
    </div>
  </div>;
}
