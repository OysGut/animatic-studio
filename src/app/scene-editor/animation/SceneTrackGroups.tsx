/**
 * B-100 runde 2: animasjonssporene ligger i Scene, under scenens tidslinje, som sporgrupper for valgt lag.
 * Samme data og samme komponenter som den tidligere Animasjon-fanen; ingen data flyttes.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Play, Repeat, Square } from "lucide-react";
import { IconButton } from "@/app/shell/workspace-chrome";
import type { ProjectState } from "@/core";
import { clampAnimationWindow, followWindowLength, formatAnimationTime } from "@/core/animation/time-format";
import { t } from "@/core/i18n/keyed";
import { useUiPref } from "@/app/account/ui-prefs";
import { FrameValue, useFrame, type Playback } from "../use-playback";
import { AnimTimeline } from "./AnimTimeline";
import { TimeNavigator, type AnimWindow } from "./TimeNavigator";
import type { AnimationRange } from "./PlayRange";
import type { RhythmDragProps } from "./RhythmDrag";

export interface TrackGroupPrefs { readonly autoExpand: boolean; readonly open: boolean }
export const DEFAULT_TRACK_GROUP_PREFS: TrackGroupPrefs = { autoExpand: true, open: false };
export function isTrackGroupPrefs(v: unknown): v is TrackGroupPrefs {
  return !!v && typeof v === "object" && typeof (v as TrackGroupPrefs).autoExpand === "boolean" && typeof (v as TrackGroupPrefs).open === "boolean";
}
/** Er sporgruppene felt ut? Manuelt åpnet, eller valgt lag med automatisk utfelling. */
export function trackGroupsOpen(p: TrackGroupPrefs, selectedLayerId: string | null, forced: boolean): boolean {
  return forced || p.open || (p.autoExpand && selectedLayerId !== null);
}

export function SceneTrackGroups({ title, state, duration, playback, range, onRange, selectedLayerName, selectedLayerId, forceOpen, tools, rhythm, tracks, onOpenChange }: {
  title: string; state: ProjectState; duration: number; playback: Playback; range: AnimationRange; onRange: (r: AnimationRange) => void;
  selectedLayerName: string | null; selectedLayerId: string | null; forceOpen: boolean;
  tools?: ReactNode; rhythm?: RhythmDragProps; tracks: (view: AnimWindow) => ReactNode;
  onOpenChange?: (open: boolean) => void;
}) {
  const [prefs, setPrefs] = useUiPref("sceneEditor.trackGroups", DEFAULT_TRACK_GROUP_PREFS, isTrackGroupPrefs);
  // N8: knappene tegnes bare når de bytter mellom aktiv og sperret, ikke per bilde
  const atStart = useFrame(playback, (f) => f === 0);
  const atEnd = useFrame(playback, (f) => f >= duration - 1);
  const [closedFor, setClosedFor] = useState<string | null | undefined>(undefined);
  const auto = prefs.autoExpand && selectedLayerId !== null && closedFor !== selectedLayerId;
  const [forced, setForced] = useState(forceOpen);
  const open = forced || prefs.open || auto;
  useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);
  const [win, setWin] = useState<AnimWindow>({ from: 0, span: duration });
  const prev = useRef(duration);
  useEffect(() => {
    if (prev.current === duration) return;
    const p = prev.current; prev.current = duration;
    setWin((w) => followWindowLength(w, p, duration));
  }, [duration]);
  const view = clampAnimationWindow(win.from, win.span, duration);
  // Piltastene flytter én frame mens sporene er åpne (som i den tidligere fanen), når ingen annen del tar dem
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.repeat || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const el = e.target instanceof HTMLElement ? e.target : null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.closest('[role="dialog"], [role="menu"], [role="slider"], [role="tablist"]'))) return;
      e.preventDefault(); playback.pause(); playback.setFrame(playback.frame + (e.key === "ArrowRight" ? 1 : -1));
    };
    document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key);
  }, [open, playback]);
  const toggle = () => {
    if (open) { setForced(false); setPrefs({ ...prefs, open: false }); setClosedFor(selectedLayerId); }
    else { setPrefs({ ...prefs, open: true }); setClosedFor(undefined); }
  };
  return (
    <section data-testid="scene-track-groups" data-open={open ? "true" : "false"} className="flex min-h-8 shrink flex-col overflow-hidden border-t border-border bg-surface-1">
      <div className="flex h-8 shrink-0 items-center gap-2 px-2 text-xs text-text-secondary">
        <button type="button" data-testid="scene-track-groups-toggle" aria-expanded={open}
          aria-label={open ? t("b100.tracks.close") : t("b100.tracks.open")}
          className="flex items-center gap-1 text-text-primary" onClick={toggle}>
          {open ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronRight className="size-3.5" aria-hidden />}
          {selectedLayerName ? `${title} – ${selectedLayerName}` : title}
        </button>
        <label className="ml-2 flex items-center gap-1">
          <input type="checkbox" data-testid="scene-track-groups-auto" checked={prefs.autoExpand}
            onChange={(e) => setPrefs({ ...prefs, autoExpand: e.target.checked })} />
          {t("b100.tracks.auto")}
        </label>
        <span className="ml-auto hidden text-text-tertiary lg:inline" data-testid="scene-track-groups-hint">
          {t("b100.tracks.hint-rhythm")} · {t("b100.tracks.hint-spacing")}
        </span>
        {open ? (
          <div className="flex items-center gap-1">
            <IconButton data-testid="anim-frame-back" label={t("app-scene-editor-animation-animation-workspace.animation-workspace.label.df43697a1025")} shortcut="←" disabled={atStart} onClick={() => { playback.pause(); playback.setFrame(playback.frame - 1); }}><ChevronLeft /></IconButton>
            <IconButton data-testid="anim-play" label={playback.playing ? t("app-scene-editor-animation-animation-workspace.animation-workspace.label.ca107ae99658") : t("app-scene-editor-animation-animation-workspace.animation-workspace.label.8feb5edbec92")} shortcut="Space" onClick={playback.toggle}>{playback.playing ? <Square /> : <Play />}</IconButton>
            <IconButton data-testid="anim-frame-forward" label={t("app-scene-editor-animation-animation-workspace.animation-workspace.label.b439d9e489fa")} shortcut="→" disabled={atEnd} onClick={() => { playback.pause(); playback.setFrame(playback.frame + 1); }}><ChevronRight /></IconButton>
            <IconButton data-testid="anim-loop" label={t("app-scene-editor-animation-animation-workspace.animation-workspace.label.10fb270d5b3f")} active={playback.loop} onClick={() => playback.setLoop(!playback.loop)}><Repeat /></IconButton>
            <output data-testid="anim-time" className="font-mono text-xs text-text-primary"><FrameValue playback={playback}>{(f) => formatAnimationTime(f, state.project.fps)}</FrameValue></output>
            <input data-testid="anim-zoom" type="range" aria-label={t("app-scene-editor-animation-animation-workspace.animation-workspace.aria-label.b94421a53d76")} min={1} max={duration} value={view.span} onChange={(e) => setWin(clampAnimationWindow(view.from, Number(e.target.value), duration))} className="w-24 accent-accent-brand" />
            {tools}
          </div>
        ) : null}
      </div>
      {open ? (
        <div data-testid="animation-workspace" className="flex max-h-[32vh] min-h-0 flex-col overflow-y-auto">
          <TimeNavigator duration={duration} window={view} onChange={setWin} />
          <AnimTimeline fps={state.project.fps} duration={duration} playback={playback} view={view} range={range} onRange={onRange} {...(rhythm ? { rhythm } : {})}>
            {tracks(view)}
          </AnimTimeline>
        </div>
      ) : null}
    </section>
  );
}
