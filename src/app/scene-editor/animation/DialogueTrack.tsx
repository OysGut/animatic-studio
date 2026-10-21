import { groupDialogueTracks, dialogueOverlaps, clipDrift, type ProjectState } from "@/core";
import { animationDialogueTracks, animationSoundTracks } from "@/core/animation/tracks";
import { PanelHeader, ToolbarButton } from "@/app/shell/workspace-chrome";
import type { AnimWindow } from "./TimeNavigator";
import { AssetThumb } from "@/app/library/AssetThumb";
import { t as tk } from "@/core/i18n/keyed";
export function DialogueTrack({ state, occurrenceId, language, view, onOpen }: { state: ProjectState; occurrenceId: string; language: string; view: AnimWindow; onOpen: (id: string) => void }) {
  const tracks = [...animationDialogueTracks(state, occurrenceId, language), ...animationSoundTracks(state, occurrenceId, language)];
  return <section data-testid="anim-dialogue-tracks" className="shrink-0 border-t border-border"><PanelHeader title={tk("app-scene-editor-animation-dialogue-track.dialogue-track.title.7d67f8352a10")} />
    {tracks.length === 0 ? <p className="p-3 text-xs text-text-tertiary">{tk("app-scene-editor-animation-dialogue-track.dialogue-track.p.ebcc66fec724")}</p> : null}
    {groupDialogueTracks(state, tracks).map(group => <div key={group.key} data-anim-track={group.items[0]?.clip.id} data-character-track={group.key} className="flex h-10 border-b border-border">
      <ToolbarButton className="h-full w-40 justify-start gap-2 overflow-hidden border-r border-border px-2" onClick={() => { const first = group.items[0]; if (first) onOpen(first.clip.id); }}><AssetThumb state={state} assetId={group.assetId ?? group.items[0]?.clip.assetId ?? ""} size="sm" /><span className="truncate">{group.label}</span></ToolbarButton>
      <div className="relative min-w-0 flex-1 overflow-hidden bg-surface-0">
        {group.items.map(t => <ToolbarButton key={t.clip.id} data-overlap={dialogueOverlaps(state, t.clip.id).length > 0} data-drift={!!t.clip.blockId && clipDrift(state, t.clip).status === "drift"} data-testid="anim-dialogue-segment" data-clip-id={t.clip.id} data-take-id={t.version?.id ?? ""} data-block-id={t.clip.blockId ?? ""} data-start={t.start} data-end={t.end}
          title={t.block?.text ?? t.clip.name} aria-label={t.block?.text ?? t.clip.name} className={"absolute top-1 h-8 overflow-hidden border bg-accent-selection px-2 text-text-primary " + (t.clip.blockId && clipDrift(state, t.clip).status === "drift" ? "border-status-danger bg-status-danger-bg" : "border-border-control")}
          style={{ left: `${(t.start - view.from) / view.span * 100}%`, width: `${Math.max(1, t.end - t.start) / view.span * 100}%` }} onClick={() => onOpen(t.clip.id)}>
          <span className="truncate">{t.block?.text ?? t.clip.name}{t.version ? ` · v${t.version.number}` : ""}</span>
        </ToolbarButton>)}
      </div>
    </div>)}
  </section>;
}
