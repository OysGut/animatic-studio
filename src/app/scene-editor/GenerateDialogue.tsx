import { useEffect, useState } from "react";
import { L, estimateCostUsd, formatUsd, SPEECH_MODEL, type AssetVoice, type ProjectState } from "@/core";
import { VoiceControls } from "@/app/audio/VoiceControls";
import { generateSpeech } from "@/adapters/ai/speech.functions";
import { Button } from "@/components/ui/button";
import { signedUrls } from "@/app/library/asset-images";
import { audioDuration } from "@/app/library/asset-audio";
import { saveTake } from "@/app/audio/takes";
import type { Commands } from "@/app/project/use-commands";

export function GenerateDialogue({ state, projectId, occurrenceId, blockId, characterId, cmds, onSaved, onBusy }: { state: ProjectState; projectId: string; occurrenceId: string; blockId: string; characterId: string | null; cmds: Commands; onSaved: () => void; onBusy: (busy: boolean) => void }) {
  const standard = characterId ? state.assets[characterId]?.voice ?? null : null;
  const [voice, setVoice] = useState<AssetVoice | null>(standard);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setVoice(standard); setConfirm(false); }, [blockId, characterId, standard]);
  const block = state.blocks[blockId];
  const model = voice?.modelId ?? SPEECH_MODEL;
  const cost = estimateCostUsd("elevenlabs", model, { characters: block?.text.replace(/\s+/g, " ").trim().length ?? 0 });
  async function run() {
    if (!voice || !block || busy) return;
    onBusy(true); setBusy(true); setConfirm(false); setError(null);
    const approvedVoice = { ...voice, settings: { ...voice.settings } };
    try {
      const r = await generateSpeech({ data: { projectId, blockId, voiceId: voice.voiceId, modelId: model, language: voice.language ?? "no", settings: voice.settings ?? {}, scriptRevision: block.currentRev, approved: true } });
      if (!r.ok) throw new Error(r.message);
      const url = (await signedUrls([r.media.path], 600))[r.media.path];
      if (!url) throw new Error(L("Lydfilen kunne ikke hentes.", "The audio file could not be loaded."));
      const response = await fetch(url); if (!response.ok) throw new Error(L("Lydfilen kunne ikke hentes.", "The audio file could not be loaded."));
      const durationMs = await audioDuration(await response.arrayBuffer());
      if (durationMs === null) throw new Error(L("Lydlengden kunne ikke måles. Filen er bevart hos prosjektet.", "The audio duration could not be measured. The file is preserved in the project."));
      const current = cmds.current();
      if (!current) throw new Error(L("Prosjektet er lukket.", "The project is closed."));
      const result = await saveTake(cmds, current, { kind: "line", occurrenceId, blockId }, { ...r.media, durationMs }, L("AI-generert replikk", "AI-generated line"), r.assetId,
        { source: "ai", provider: "elevenlabs", voiceId: approvedVoice.voiceId, modelId: model, settings: { ...approvedVoice.settings, language: approvedVoice.language ?? "no" }, scriptRevision: r.scriptRevision ?? block.currentRev, parentVersionId: Object.values(current.audioClips).find(c => !c.removed && c.occurrenceId === occurrenceId && c.blockId === blockId)?.activeVersionId ?? null }, true);
      const fresh = cmds.current();
      if (!fresh) throw new Error(L("Prosjektet er lukket.", "The project is closed."));
      const clip = result.clipId ? fresh.audioClips[result.clipId] : Object.values(fresh.audioClips).find(c => !c.removed && c.occurrenceId === occurrenceId && c.blockId === blockId);
      if (clip && characterId) { const linked = await cmds.runAndWait({ type: "SetDialogueCharacter", clipIds: [clip.id], characterAssetId: characterId as never }, L("Koble karakter til replikken", "Link character to line")); if (linked.error) throw new Error(linked.error); }
      onSaved();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); onBusy(false); }
  }
  return <section data-testid="dialogue-generation" className="border-t border-border pt-2">
    <Button data-testid="dialogue-generate-open" size="sm" variant="secondary" disabled={busy} onClick={() => setOpen(!open)}>{L("Generer lydfil", "Generate audio file")}</Button>
    {open ? <div className="mt-3 flex flex-col gap-3"><VoiceControls projectId={projectId} value={voice} onChange={v => { setVoice(v); setConfirm(false); }} disabled={busy} />
      {confirm ? <div role="alertdialog" data-testid="dialogue-generation-confirm" aria-label={L("Godkjenn kostnaden", "Approve cost")} className="flex flex-col gap-2 border border-border p-2 text-xs text-text-primary">
        {L(`ElevenLabs · ${model} · ${voice?.language ?? "no"} · anslått ${cost === null ? "ukjent pris" : formatUsd(cost)}. En ny aktiv versjon lages. Gamle filer og redigeringer beholdes.`, `ElevenLabs · ${model} · ${voice?.language ?? "no"} · estimated ${cost === null ? "unknown price" : formatUsd(cost)}. A new active version is created. Previous files and edits are preserved.`)}
        <Button data-testid="dialogue-generation-approve" size="sm" disabled={busy} onClick={() => void run()}>{L("Godkjenn og generer", "Approve and generate")}</Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>{L("Avbryt", "Cancel")}</Button>
      </div> : <Button data-testid="dialogue-generation-start" size="sm" disabled={!voice || busy || cost === null} onClick={() => setConfirm(true)}>{busy ? L("Genererer …", "Generating …") : L("Generer …", "Generate …")}</Button>}
    </div> : null}
    {open && cost === null ? <p role="alert" className="text-xs text-status-uncertain">{L("Modellprisen er ukjent. Administratoren må registrere prisen før generering.", "The model price is unknown. An administrator must register the price before generation.")}</p> : null}
    {error ? <p role="alert" className="text-xs text-status-danger">{error}</p> : null}
  </section>;
}