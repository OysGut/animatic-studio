import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Play, Square, Repeat } from "lucide-react";
import { L, type Composition, type ProjectState } from "@/core";
import { clampAnimationWindow, formatAnimationTime } from "@/core/animation/time-format";
import { Toolbar, ToolbarGroup, IconButton } from "@/app/shell/workspace-chrome";
import { PaneResizer, usePaneSize } from "@/app/shell/pane-size";
import { isTypingTarget } from "../Timeline";
import type { Playback } from "../use-playback";
import { AnimTimeline } from "./AnimTimeline";
import { TimeNavigator, type AnimWindow } from "./TimeNavigator";
import { AnimPreview } from "./AnimPreview";
import type { AnimationRange } from "./PlayRange";
import type { RhythmDragProps } from "./RhythmDrag";

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
      <IconButton data-testid="anim-frame-back" label={L("Én frame tilbake", "Previous frame")} shortcut="←" disabled={playback.frame === 0} onClick={() => { playback.pause(); playback.setFrame(playback.frame - 1); }}><ChevronLeft /></IconButton>
      <IconButton data-testid="anim-play" label={playback.playing ? L("Stopp", "Stop") : L("Spill av", "Play")} shortcut="Space" onClick={playback.toggle}>{playback.playing ? <Square /> : <Play />}</IconButton>
      <IconButton data-testid="anim-frame-forward" label={L("Én frame frem", "Next frame")} shortcut="→" disabled={playback.frame >= duration - 1} onClick={() => { playback.pause(); playback.setFrame(playback.frame + 1); }}><ChevronRight /></IconButton>
      <IconButton data-testid="anim-loop" label={L("Løkke", "Loop")} active={playback.loop} onClick={() => playback.setLoop(!playback.loop)}><Repeat /></IconButton>
      <output data-testid="anim-time" className="font-mono text-xs text-text-primary">{formatAnimationTime(playback.frame, state.project.fps)}</output>
      <input data-testid="anim-zoom" type="range" aria-label={L("Zoom i tidslinjen", "Timeline zoom")} min={1} max={duration} value={view.span} onChange={e => setWindow(clampAnimationWindow(view.from, Number(e.target.value), duration))} className="w-24 accent-accent-brand" />
    </ToolbarGroup>{tools ? <ToolbarGroup>{tools}</ToolbarGroup> : null}</Toolbar>
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TimeNavigator duration={duration} window={view} onChange={setWindow} />
        <AnimTimeline fps={state.project.fps} duration={duration} playback={playback} view={view} range={range} onRange={onRange} {...(rhythm ? { rhythm } : {})}>{tracks?.(view)}</AnimTimeline>
      </div>
      <div data-testid="anim-preview-resize" className="relative flex shrink-0 self-start border-l border-border bg-surface-1" style={{ width }}>
        <PaneResizer edge="left" size={width} onSize={setWidth} min={200} max={700} label={L("Bredde på forhåndsvisningen", "Preview width")} />
        <AnimPreview state={state} composition={composition} frame={playback.frame} urls={urls} />
      </div>
    </div>
  </div>;
}
