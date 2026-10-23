import { useEffect, useState } from "react";
import { sourceLanguageOf, type Asset, type AssetVoice, type ProjectState } from "@/core";
import { PanelHeader } from "@/app/shell/workspace-chrome";
import { VoiceControls } from "@/app/audio/VoiceControls";
import { Button } from "@/components/ui/button";
import type { Commands } from "@/app/project/use-commands";
import { DialogueBatchPanel } from "./DialogueBatchPanel";
import { t } from "@/core/i18n/keyed";

export function CharacterVoiceSection({ state, asset, projectId, cmds, editable }: { state: ProjectState; asset: Asset; projectId: string; cmds: Commands; editable: boolean }) {
  const [voice, setVoice] = useState<AssetVoice | null>(asset.voice ?? null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setVoice(asset.voice ?? null), [asset.voice]);
  const versions = Object.values(state.dialogueVersions).filter(v => !v.removed && state.audioClips[v.clipId]?.characterAssetId === asset.id);
  return <section data-testid="character-voice-section" className="border-t border-border py-4">
    <PanelHeader title={t("app-library-character-voice-section.character-voice-section.title.bddbec8177e9")} />
    <VoiceControls projectId={projectId} value={voice} onChange={setVoice} disabled={!editable} defaultLanguage={sourceLanguageOf(state)} />
    <div className="mt-3 flex items-center gap-2">
      <Button data-testid="voice-save-default" size="sm" disabled={!editable || JSON.stringify(voice) === JSON.stringify(asset.voice ?? null)} onClick={() => setError(cmds.run({ type: "SetAssetVoice", assetId: asset.id, voice }, t("app-library-character-voice-section.character-voice-section.cmds-run.df5114228c2c")))}>{t("app-library-character-voice-section.character-voice-section.button.4cc97e574deb")}</Button>
      <Button variant="ghost" size="sm" asChild><a href="https://elevenlabs.io/app/voice-lab" target="_blank" rel="noopener noreferrer">{t("app-library-character-voice-section.character-voice-section.a.b1da0744e448")}</a></Button>
    </div>
    <p className="mt-2 text-xs text-text-tertiary">{t("app-library-character-voice-section.character-voice-section.p.bc13402828e0")}</p>
    {error ? <p role="alert" className="text-xs text-status-danger">{error}</p> : null}
    <div className="mt-3 flex flex-wrap gap-2"><DialogueBatchPanel state={state} asset={asset} projectId={projectId} editable={editable} /><DialogueBatchPanel state={state} asset={asset} projectId={projectId} editable={editable} drift /></div>
    {([ ["record", t("app-library-character-voice-section.character-voice-section.record-l-innspilte-versjoner-recorded-versions-ai-l-genererte-versjoner-generated-versions-as-const-map.22b3efff0221")], ["ai", t("app-library-character-voice-section.character-voice-section.record-l-innspilte-versjoner-recorded-versions-ai-l-genererte-versjoner-generated-versions-as-const-map.3d8e71da10df")] ] as const).map(([source, title]) => <div key={source} className="mt-3"><PanelHeader title={title} count={versions.filter(v => v.source === source).length} />
      <ul className="text-xs text-text-secondary">{versions.filter(v => v.source === source).map(v => <li key={v.id} data-testid="character-audio-version" className="border-b border-border py-1">{state.blocks[state.audioClips[v.clipId]?.blockId ?? ""]?.text ?? state.assets[v.assetId]?.name} {v.modelId ? ` · ${v.modelId}` : ""}</li>)}</ul>
    </div>)}
  </section>;
}