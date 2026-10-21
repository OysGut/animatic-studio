
import { ToolbarButton } from "@/app/shell/workspace-chrome";
import type { AnimWindow } from "./TimeNavigator";
import { useRef } from "react";
import { t } from "@/core/i18n/keyed";
export interface AnimationRange { from: number; to: number }
export function PlayRange({ range, duration, view, onChange }: { range: AnimationRange; duration: number; view: AnimWindow; onChange: (r: AnimationRange) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<"from" | "to" | null>(null);
  const set = (key: "from" | "to", frame: number) => onChange(key === "from" ? { ...range, from: Math.min(range.to, Math.max(0, frame)) } : { ...range, to: Math.max(range.from, Math.min(duration - 1, frame)) });
  return <div ref={ref} data-testid="anim-play-range" className="relative h-7 overflow-hidden border-b border-border bg-surface-2">
    <div className="absolute inset-y-1 bg-accent-brand/20" style={{ left: `${(range.from - view.from) / view.span * 100}%`, width: `${(range.to - range.from + 1) / view.span * 100}%` }} />
    {(["from", "to"] as const).map(key => <ToolbarButton key={key} data-testid={key === "from" ? "anim-range-start" : "anim-range-end"} variant="icon" role="slider" aria-valuenow={range[key]} aria-valuemin={0} aria-valuemax={duration - 1}
      aria-label={key === "from" ? t("app-scene-editor-animation-play-range.play-range.aria-label.eac5662a5a11") : t("app-scene-editor-animation-play-range.play-range.aria-label.2ca4c7312bb8")}
      className="absolute top-0 w-3 cursor-ew-resize bg-accent-brand text-accent-fg" style={{ left: `${(range[key] - view.from) / view.span * 100}%` }}
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = key; }}
      onPointerMove={e => { const r = ref.current?.getBoundingClientRect(); if (drag.current && r?.width) set(drag.current, Math.round(view.from + (e.clientX - r.left) / r.width * view.span)); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
      onKeyDown={e => { if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return; e.preventDefault(); e.stopPropagation(); set(key, range[key] + (e.key === "ArrowRight" ? 1 : -1)); }}>
      {key === "from" ? "[" : "]"}
    </ToolbarButton>)}
  </div>;
}
