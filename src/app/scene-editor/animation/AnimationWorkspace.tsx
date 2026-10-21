import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Play, Square, Repeat } from "lucide-react";
import { type Composition, type ProjectState } from "@/core";
import { clampAnimationWindow, followWindowLength, formatAnimationTime } from "@/core/animation/time-format";
import { Toolbar, ToolbarGroup, IconButton } from "@/app/shell/workspace-chrome";
import { PaneResizer, usePaneSize } from "@/app/shell/pane-size";
import { isTypingTarget } from "../Timeline";
import type { Playback } from "../use-playback";
import { AnimTimeline } from "./AnimTimeline";
import { TimeNavigator, type AnimWindow } from "./TimeNavigator";
import { AnimPreview } from "./AnimPreview";
import type { AnimationRange } from "./PlayRange";
import type { RhythmDragProps } from "./RhythmDrag";
import { t } from "@/core/i18n/keyed";

export function AnimationWorkspace({ state, composition, duration, playback, range, onRange, urls, tracks, tools, rhythm }: {
  state: ProjectState; composition: Composition; duration: number; playback: Playback;
  range: AnimationRange; onRange: (r: AnimationRange) => void; urls: Readonly<Record<string, string>>;
  tracks?: (view: AnimWindow) => ReactNode;
  /** CA8: rytmeverktøyet og andre verktøy i verktøylinjen. */
  tools?: ReactNode;
  /** U5 del B: dra-modusen med Cmd/Ctrl i tidslinjen. */
  rhythm?: RhythmDragProps;
}) {
  const [window, setWindow] = useState<AnimWindow>({ from: 0, span: duration });
  const prevDuration = useRef(duration);
  useEffect(() => {
    if (prevDuration.current === duration) return;
    const prev = prevDuration.current; prevDuration.current = duration;
    setWindow(w => followWindowLength(w, prev, duration));
  }, [duration]);
  const view = clampAnimationWindow(window.from, window.span, duration);
  const [width, setWidth] = usePaneSize("animation-preview", 340, 200, 700, { viewportShare: 0.5 });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.repeat || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || isTypingTarget(e.target)) return;
      if (e.target instanceof HTMLElement && e.target.closest('[role="dialog"], [role="menu"], [role="slider"], [role="tablist"]')) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); playback.pause(); playback.setFrame(playback.frame + (e.key === "ArrowRight" ? 1 : -1)); }
      if (e.key === " " && !(e.target instanceof HTMLElement && e.target.closest("button"))) { e.preventDefault(); playback.toggle(); }
    };
    document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key);
  }, [playback]);
  return <div data-testid="animation-workspace" className="flex min-h-0 flex-1 flex-col">
    <Toolbar><ToolbarGroup>
      <IconButton data-testid="anim-frame-back" label={t("app-scene-editor-animation-animation-workspace.animation-workspace.label.df43697a1025")} shortcut="←" disabled={playback.frame === 0} onClick={() => { playback.pause(); playback.setFrame(playback.frame - 1); }}><ChevronLeft /></IconButton>
      <IconButton data-testid="anim-play" label={playback.playing ? t("app-scene-editor-animation-animation-workspace.animation-workspace.label.ca107ae99658") : t("app-scene-editor-animation-animation-workspace.animation-workspace.label.8feb5edbec92")} shortcut="Space" onClick={playback.toggle}>{playback.playing ? <Square /> : <Play />}</IconButton>
      <IconButton data-testid="anim-frame-forward" label={t("app-scene-editor-animation-animation-workspace.animation-workspace.label.b439d9e489fa")} shortcut="→" disabled={playback.frame >= duration - 1} onClick={() => { playback.pause(); playback.setFrame(playback.frame + 1); }}><ChevronRight /></IconButton>
      <IconButton data-testid="anim-loop" label={t("app-scene-editor-animation-animation-workspace.animation-workspace.label.10fb270d5b3f")} active={playback.loop} onClick={() => playback.setLoop(!playback.loop)}><Repeat /></IconButton>
      <output data-testid="anim-time" className="font-mono text-xs text-text-primary">{formatAnimationTime(playback.frame, state.project.fps)}</output>
      <input data-testid="anim-zoom" type="range" aria-label={t("app-scene-editor-animation-animation-workspace.animation-workspace.aria-label.b94421a53d76")} min={1} max={duration} value={view.span} onChange={e => setWindow(clampAnimationWindow(view.from, Number(e.target.value), duration))} className="w-24 accent-accent-brand" />
    </ToolbarGroup>{tools ? <ToolbarGroup>{tools}</ToolbarGroup> : null}</Toolbar>
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TimeNavigator duration={duration} window={view} onChange={setWindow} />
        <AnimTimeline fps={state.project.fps} duration={duration} playback={playback} view={view} range={range} onRange={onRange} {...(rhythm ? { rhythm } : {})}>{tracks?.(view)}</AnimTimeline>
      </div>
      <div data-testid="anim-preview-resize" className="relative flex min-h-0 shrink-0 border-l border-border bg-surface-1" style={{ width }}>
        <PaneResizer edge="left" size={width} onSize={setWidth} min={200} max={700} label={t("app-scene-editor-animation-animation-workspace.animation-workspace.label.5d50a665cb4e")} />
        <AnimPreview state={state} composition={composition} frame={playback.frame} urls={urls} />
      </div>
    </div>
  </div>;
}
