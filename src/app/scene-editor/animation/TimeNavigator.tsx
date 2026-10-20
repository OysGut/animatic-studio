
import { clampAnimationWindow, resizeAnimationWindow } from "@/core/animation/time-format";
import { ToolbarButton } from "@/app/shell/workspace-chrome";
import { useRef } from "react";
import { t } from "@/core/i18n/keyed";

export interface AnimWindow { from: number; span: number }
export function TimeNavigator({ duration, window: view, onChange }: { duration: number; window: AnimWindow; onChange: (next: AnimWindow) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; from: number; span: number; edge?: "from" | "to" } | null>(null);
  return <div ref={ref} data-testid="anim-navigator" role="slider" tabIndex={0}
    aria-label={t("app-scene-editor-animation-time-navigator.time-navigator.aria-label.a8ca47cc3af2")} aria-valuemin={0} aria-valuemax={Math.max(0, duration - view.span)} aria-valuenow={view.from}
    className="relative m-2 h-6 shrink-0 cursor-grab rounded-sm border border-border-control bg-surface-0 focus-visible:ring-2 focus-visible:ring-focus-ring"
    onKeyDown={e => { if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return; e.preventDefault(); e.stopPropagation(); onChange(clampAnimationWindow(view.from + (e.key === "ArrowRight" ? 1 : -1), view.span, duration)); }}
    onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, from: view.from, span: view.span }; }}
    onPointerMove={e => { const d = drag.current; const width = ref.current?.clientWidth; if (d && width) { const delta = (e.clientX - d.x) / width * duration; onChange(d.edge ? resizeAnimationWindow(d.from, d.span, delta, d.edge, duration) : clampAnimationWindow(d.from + delta, d.span, duration)); } }}
    onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
    <div data-testid="anim-navigator-window" className="absolute inset-y-0 min-w-3 border border-accent-brand bg-accent-selection" style={{ left: `${view.from / duration * 100}%`, width: `${view.span / duration * 100}%` }} >
      {(["from", "to"] as const).map(edge => <ToolbarButton key={edge} variant="icon" data-testid={`anim-navigator-${edge}`} role="slider" aria-label={edge === "from" ? t("app-scene-editor-animation-time-navigator.time-navigator.aria-label.874659257a28") : t("app-scene-editor-animation-time-navigator.time-navigator.aria-label.a9fecc231e9f")} aria-valuemin={0} aria-valuemax={duration} aria-valuenow={edge === "from" ? view.from : view.from + view.span}
        className={`absolute inset-y-0 h-full w-2 cursor-ew-resize rounded-none bg-accent-brand ${edge === "from" ? "left-0" : "right-0"}`}
        onPointerDown={e => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, from: view.from, span: view.span, edge }; }}
        onKeyDown={e => { if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return; e.preventDefault(); e.stopPropagation(); onChange(resizeAnimationWindow(view.from, view.span, e.key === "ArrowRight" ? 1 : -1, edge, duration)); }} />)}
    </div>
  </div>;
}
