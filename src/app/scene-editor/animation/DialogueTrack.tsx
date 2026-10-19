import { L, type ProjectState } from "@/core";
import { animationDialogueTracks, animationSoundTracks } from "@/core/animation/tracks";
import { PanelHeader, ToolbarButton } from "@/app/shell/workspace-chrome";
import type { AnimWindow } from "./TimeNavigator";
export function DialogueTrack({ state, occurrenceId, language, view, onOpen }: { state: ProjectState; occurrenceId: string; language: string; view: AnimWindow; onOpen: (id: string) => void }) {
  const tracks = [...animationDialogueTracks(state, occurrenceId, language), ...animationSoundTracks(state, occurrenceId, language)];
  return <section data-testid="anim-dialogue-tracks" className="shrink-0 border-t border-border"><PanelHeader title={L("Dialog og lyd", "Dialogue and sound")} />
    {tracks.length === 0 ? <p className="p-3 text-xs text-text-tertiary">{L("Ingen dialogopptak i scenen.", "No dialogue recordings in the scene.")}</p> : null}
    {tracks.map(t => <div key={t.clip.id} data-anim-track={t.clip.id} className="flex h-10 border-b border-border">
      <ToolbarButton className="h-full w-40 truncate border-r border-border" onClick={() => onOpen(t.clip.id)}>{t.clip.name}</ToolbarButton>
      <div className="relative min-w-0 flex-1 overflow-hidden bg-surface-0">
        <ToolbarButton data-testid="anim-dialogue-segment" data-clip-id={t.clip.id} data-take-id={t.version?.id ?? ""} data-block-id={t.clip.blockId ?? ""} data-start={t.start} data-end={t.end}
          title={t.block?.text ?? t.clip.name} aria-label={t.block?.text ?? t.clip.name} className="absolute top-1 h-8 overflow-hidden border border-border-control bg-accent-selection px-2 text-text-primary"
          style={{ left: `${(t.start - view.from) / view.span * 100}%`, width: `${Math.max(1, t.end - t.start) / view.span * 100}%` }} onClick={() => onOpen(t.clip.id)}>
          <span className="truncate">{t.block?.text ?? t.clip.name}{t.version ? ` · v${t.version.number}` : ""}</span>
        </ToolbarButton>
      </div>
    </div>)}
  </section>;
}
