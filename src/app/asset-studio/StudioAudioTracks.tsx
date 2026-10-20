/**
 * Lydsporene i Asset Studio (AS3, A5/A6): «Scenens lyd» (musikk, atmosfære, effekter) og «[Karakterens] lyd»
 * (replikklyd og alternative takes). Avkrysningene demper bare forhåndslyttingen i studioet; de endrer ikke den
 * lagrede scenen. «Lagre demping i scenen» legger dempingen i utkastet som vanlige lydklippendringer.
 */
import { audioClipFieldsOf, framesToSeconds, type AudioClip, type Command, type ProjectState, type Rational } from "@/core";
import { Button } from "@/components/ui/button";
import { TakesMicButton } from "@/app/audio/AudioTakesDialog";
import type { Commands } from "@/app/project/use-commands";
import { t } from "@/core/i18n/keyed";

export function muteDraftCommand(
  state: ProjectState,
  clips: readonly AudioClip[],
  previewMuted: ReadonlySet<string>,
): Command | null {
  const changed = clips.filter((c) => previewMuted.has(c.id) !== c.muted);
  if (!changed.length) return null;
  return {
    type: "UpdateAudioClips",
    clips: changed.map((c) => ({
      clipId: c.id,
      fields: { ...audioClipFieldsOf(state.audioClips[c.id] ?? c), muted: previewMuted.has(c.id) },
    })),
  } as Command;
}

export function StudioAudioTracks({
  state,
  projectId,
  cmds,
  occurrenceId,
  assetName,
  sceneClips,
  assetClips,
  durationFrames,
  fps,
  previewMuted,
  onPreviewMuted,
  editable,
  audioEditable,
  onSaveMute,
}: {
  state: ProjectState;
  projectId: string;
  cmds: Commands;
  occurrenceId: string;
  assetName: string;
  sceneClips: readonly AudioClip[];
  assetClips: readonly AudioClip[];
  durationFrames: number;
  fps: Rational;
  previewMuted: ReadonlySet<string>;
  onPreviewMuted: (next: Set<string>) => void;
  editable: boolean;
  audioEditable: boolean;
  onSaveMute: () => void;
}) {
  const durSec = Math.max(0.001, framesToSeconds(Math.max(1, durationFrames), fps));
  const all = [...sceneClips, ...assetClips];
  const dirty = all.some((c) => previewMuted.has(c.id) !== c.muted);

  function setMuted(ids: readonly string[], muted: boolean) {
    const next = new Set(previewMuted);
    for (const id of ids) {
      if (muted) next.add(id);
      else next.delete(id);
    }
    onPreviewMuted(next);
  }

  function group(title: string, testId: string, clips: readonly AudioClip[]) {
    const allOn = clips.length > 0 && clips.every((c) => !previewMuted.has(c.id));
    return (
      <div className="flex flex-col gap-0.5" data-testid={testId}>
        <label className="flex items-center gap-1.5 text-[11px] font-medium text-text-secondary">
          <input
            type="checkbox"
            checked={allOn}
            disabled={!clips.length}
            data-testid={`${testId}-toggle`}
            onChange={(e) => setMuted(clips.map((c) => c.id), !e.target.checked)}
            aria-label={t("app-asset-studio-studio-audio-tracks.group.aria-label.b942383b2028", { title: String(title) })}
          />
          {title}
        </label>
        {clips.length === 0 ? (
          <p className="pl-5 text-[11px] text-text-tertiary">{t("app-asset-studio-studio-audio-tracks.group.p.f61e319dc2f5")}</p>
        ) : null}
        {clips.map((c) => {
          const start = c.offsetMs / 1000;
          const len = Math.max(0.05, c.lengthMs / 1000);
          const name = c.name || state.assets[c.assetId]?.name || t("app-asset-studio-studio-audio-tracks.name.clips-map.8b2450cbd42b");
          const on = !previewMuted.has(c.id);
          return (
            <div key={c.id} className="flex items-center gap-1.5" data-testid="asset-studio-audio-clip">
              <input
                type="checkbox"
                checked={on}
                data-testid="asset-studio-audio-preview-toggle"
                data-clip-id={c.id}
                onChange={(e) => setMuted([c.id], !e.target.checked)}
                aria-label={t("app-asset-studio-studio-audio-tracks.group.aria-label.68e501d187ea", { name: String(name) })}
              />
              <div className="relative h-4 flex-1 rounded-sm bg-surface-2">
                <div
                  className={
                    "absolute top-0 h-full truncate rounded-sm px-1 text-[11px] leading-4 " +
                    (on ? "bg-surface-3 text-text-secondary" : "bg-surface-2 text-text-tertiary line-through")
                  }
                  style={{
                    left: `${Math.min(100, (start / durSec) * 100)}%`,
                    width: `${Math.min(100, (len / durSec) * 100)}%`,
                  }}
                  title={name}
                >
                  {name}
                </div>
              </div>
              {c.kind === "dialogue" && c.blockId && audioEditable ? (
                <TakesMicButton
                  projectId={projectId}
                  state={state}
                  cmds={cmds}
                  target={{ kind: "line", occurrenceId, blockId: c.blockId, clipId: c.id }}
                  label={t("app-asset-studio-studio-audio-tracks.group.label.69f1b007dd55", { name: String(name) })}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 pt-2" data-testid="asset-studio-audio">
      {group(t("app-asset-studio-studio-audio-tracks.studio-audio-tracks.group.74dcb9e83def"), "asset-studio-audio-scene", sceneClips)}
      {group(t("app-asset-studio-studio-audio-tracks.studio-audio-tracks.group.1541ae17795d", { assetName: String(assetName) }), "asset-studio-audio-asset", assetClips)}
      <p className="text-[11px] text-text-tertiary" data-testid="asset-studio-audio-direct-note">
        {t("app-asset-studio-studio-audio-tracks.studio-audio-tracks.p.35b1d8ef9a50")}
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={!editable || !dirty}
          onClick={onSaveMute}
          data-testid="asset-studio-save-mute"
          title={t("app-asset-studio-studio-audio-tracks.studio-audio-tracks.title.985c8836af1e")}
        >
          {t("app-asset-studio-studio-audio-tracks.studio-audio-tracks.button.2a843c3edb62")}
        </Button>
      </div>
    </div>
  );
}
