import { useEffect, useState } from "react";
import { L, qualityProfileSnapshot, estimateCostUsd, formatUsd, SPEECH_MODEL, speechLanguageOf, type AssetVoice, type ProjectState } from "@/core";
import { QualityProfilePicker, QualityProfileBudget, useQualityProfile } from "@/app/ai/QualityProfilePicker";
import { VoiceControls } from "@/app/audio/VoiceControls";
import { generateSpeech } from "@/adapters/ai/speech.functions";
import { Button } from "@/components/ui/button";
import { signedUrls } from "@/app/library/asset-images";
import { audioDuration } from "@/app/library/asset-audio";
import { saveTake } from "@/app/audio/takes";
import type { Commands } from "@/app/project/use-commands";
import { t } from "@/core/i18n/keyed";

export function GenerateDialogue({ state, projectId, occurrenceId, blockId, characterId, cmds, onSaved, onBusy }: { state: ProjectState; projectId: string; occurrenceId: string; blockId: string; characterId: string | null; cmds: Commands; onSaved: () => void; onBusy: (busy: boolean) => void }) {
  const quality = useQualityProfile(state);
  const defaultVoice = characterId ? state.assets[characterId]?.voice ?? null : null;
  const language = speechLanguageOf(state, occurrenceId, blockId, characterId);
  const standard = defaultVoice ? { ...defaultVoice, language } : null;
  const [voice, setVoice] = useState<AssetVoice | null>(standard);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setVoice(defaultVoice ? { ...defaultVoice, language } : null); setConfirm(false); }, [blockId, characterId, defaultVoice, language]);
  const block = state.blocks[blockId];
  const model = voice?.modelId ?? quality.profile?.spec.models?.speech ?? SPEECH_MODEL;
  const cost = estimateCostUsd("elevenlabs", model, { characters: block?.text.replace(/\s+/g, " ").trim().length ?? 0 });
  async function run() {
    if (!voice || !block || busy || quality.budgetError) return;
    onBusy(true); setBusy(true); setConfirm(false); setError(null);
    const approvedVoice = { ...voice, settings: { ...voice.settings } };
    try {
      const r = await generateSpeech({ data: { projectId, blockId, voiceId: voice.voiceId, modelId: model, language: voice.language ?? "no", settings: voice.settings ?? {}, scriptRevision: block.currentRev, approved: true, qualityProfile: quality.profile ? qualityProfileSnapshot(quality.profile) : null } });
      if (!r.ok) throw new Error(r.message);
      const url = (await signedUrls([r.media.path], 600))[r.media.path];
      if (!url) throw new Error(t("app-scene-editor-generate-dialogue.run.message.b6737e0b5a59"));
      const response = await fetch(url); if (!response.ok) throw new Error(t("app-scene-editor-generate-dialogue.run.message.b6737e0b5a59.2"));
      const durationMs = await audioDuration(await response.arrayBuffer());
      if (durationMs === null) throw new Error(t("app-scene-editor-generate-dialogue.run.message.52f8ec37256c"));
      const current = cmds.current();
      if (!current) throw new Error(t("app-scene-editor-generate-dialogue.run.message.12b237836818"));
      const result = await saveTake(cmds, current, { kind: "line", occurrenceId, blockId }, { ...r.media, durationMs }, t("app-scene-editor-generate-dialogue.result.save-take.b19702b8562f"), r.assetId,
        { source: "ai", provider: "elevenlabs", voiceId: approvedVoice.voiceId, modelId: model, settings: { ...approvedVoice.settings, language: approvedVoice.language ?? "no", ...(quality.profile ? {qualityProfileId:quality.profile.id, qualityProfileName:quality.profile.name, qualityProfileSnapshot:JSON.stringify(qualityProfileSnapshot(quality.profile))} : {}) }, scriptRevision: r.scriptRevision ?? block.currentRev, parentVersionId: Object.values(current.audioClips).find(c => !c.removed && c.occurrenceId === occurrenceId && c.blockId === blockId)?.activeVersionId ?? null }, true);
      const fresh = cmds.current();
      if (!fresh) throw new Error(t("app-scene-editor-generate-dialogue.run.message.12b237836818.2"));
      const clip = result.clipId ? fresh.audioClips[result.clipId] : Object.values(fresh.audioClips).find(c => !c.removed && c.occurrenceId === occurrenceId && c.blockId === blockId);
      if (clip && characterId) { const linked = await cmds.runAndWait({ type: "SetDialogueCharacter", clipIds: [clip.id], characterAssetId: characterId as never }, t("app-scene-editor-generate-dialogue.linked.cmds-run-and-wait.80b555fbb51a")); if (linked.error) throw new Error(linked.error); }
      onSaved();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); onBusy(false); }
  }
  return <section data-testid="dialogue-generation" className="border-t border-border pt-2">
    <Button data-testid="dialogue-generate-open" size="sm" variant="secondary" disabled={busy} onClick={() => setOpen(!open)}>{t("app-scene-editor-generate-dialogue.generate-dialogue.button.daa0584f5037")}</Button>
    {open ? <div className="mt-3 flex flex-col gap-3"><QualityProfilePicker state={state} value={quality.choice} disabled={busy} onChange={v => { quality.setChoice(v); setVoice(old => { if (!old) return old; const { modelId: _modelId, ...rest } = old; return rest; }); setConfirm(false); }} /><QualityProfileBudget error={quality.budgetError} /><VoiceControls projectId={projectId} value={voice ? { ...voice, modelId: model } : null} onChange={v => { setVoice(v); setConfirm(false); }} disabled={busy} />
      {confirm ? <div role="alertdialog" data-testid="dialogue-generation-confirm" aria-label={t("app-scene-editor-generate-dialogue.generate-dialogue.aria-label.5aad2202408b")} className="flex flex-col gap-2 border border-border p-2 text-xs text-text-primary">
        {L(`ElevenLabs · ${model} · ${voice?.language ?? "no"} · anslått ${cost === null ? "ukjent pris" : formatUsd(cost)}. En ny aktiv versjon lages. Gamle filer og redigeringer beholdes.`, `ElevenLabs · ${model} · ${voice?.language ?? "no"} · estimated ${cost === null ? "unknown price" : formatUsd(cost)}. A new active version is created. Previous files and edits are preserved.`)}
        <Button data-testid="dialogue-generation-approve" size="sm" disabled={busy || !!quality.budgetError} onClick={() => void run()}>{t("app-scene-editor-generate-dialogue.generate-dialogue.button.686a55a7ebf5")}</Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>{t("app-scene-editor-generate-dialogue.generate-dialogue.button.18b2f897b3d7")}</Button>
      </div> : <Button data-testid="dialogue-generation-start" size="sm" disabled={!voice || busy || cost === null || !!quality.budgetError} onClick={() => setConfirm(true)}>{busy ? t("app-scene-editor-generate-dialogue.generate-dialogue.button.d20d6afa2eb6") : t("app-scene-editor-generate-dialogue.generate-dialogue.button.75e32e6da4db")}</Button>}
    </div> : null}
    {open && cost === null ? <p role="alert" className="text-xs text-status-uncertain">{t("app-scene-editor-generate-dialogue.generate-dialogue.p.9f7936a9da7d")}</p> : null}
    {error ? <p role="alert" className="text-xs text-status-danger">{error}</p> : null}
  </section>;
}