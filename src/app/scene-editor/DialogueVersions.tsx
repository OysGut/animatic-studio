import { useEffect, useRef, useState } from "react";
import { L, versionsOfClip, mirroredClip, audioVersion, dialogueOverlaps, editOf, type AudioClip, type ProjectState, type FilmAudioItem } from "@/core";
import { Button } from "@/components/ui/button";
import { PanelHeader } from "@/app/shell/workspace-chrome";
import { Wave } from "@/app/assembly/AudioTracks";
import { audioBank, useAudioLoaded } from "@/app/audio/use-audio-playback";
import { useImageUrls } from "@/app/library/asset-images";
import { AudioClipEditor } from "@/app/audio/AudioClipEditor";
import { scheduleOne } from "@/engine/audio/mixer";
import type { Commands } from "@/app/project/use-commands";

export function DialogueVersions({ state, clip, cmds, onStopScene }: { state: ProjectState; clip: AudioClip; cmds: Commands; onStopScene: () => void }) {
  const versions = versionsOfClip(state, clip.id);
  const files = versions.map(v => ({ v, clip: mirroredClip({ ...clip, activeVersionId: v.id }, v) }));
  const urls = useImageUrls(files.flatMap(f => { const v = audioVersion(state, f.clip); return v ? [v.mediaPath] : []; }));
  const loaded = useAudioLoaded();
  const [preview, setPreview] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const context = useRef<AudioContext | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const stop = () => { try { source.current?.stop(); } catch { /* already ended */ } source.current = null; setPreview(null); };
  useEffect(() => { if (urls.data) void audioBank.loadAll(urls.data); }, [urls.data]);
  useEffect(() => () => { try { source.current?.stop(); } catch { /* ended */ } void context.current?.close(); }, []);
  const edited = files.find(f => f.v.id === editing);
  return <section data-testid="dialogue-versions" className="border-t border-border pt-2">
    <PanelHeader title={L("Lydversjoner", "Audio versions")} count={versions.length} />
    {dialogueOverlaps(state, clip.id).length ? <p role="alert" data-testid="dialogue-overlap" className="text-xs text-status-uncertain">{L("Replikker på samme karakterspor overlapper. Ingen andre replikker flyttes.", "Lines on the same character track overlap. No other lines are moved.")}</p> : null}
    {files.map(({ v, clip: projected }, i) => {
      const file = audioVersion(state, projected);
      const active = clip.activeVersionId === v.id;
      return <div key={v.id} data-testid="dialogue-version" data-version-id={v.id} data-active={active} className="border-b border-border py-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary"><span>{L(`Versjon ${i + 1}`, `Version ${i + 1}`)} · {v.source === "record" ? L("Opptak", "Recording") : v.source === "ai" ? L("Generert", "Generated") : v.source === "upload" ? L("Opplastet", "Uploaded") : L("Tidligere lyd", "Previous audio")} {v.modelId ?? ""}</span>{active ? <strong className="text-accent-brand">{L("Aktiv filmversjon", "Active film version")}</strong> : null}</div>
        <div data-testid="dialogue-version-wave" className="relative my-1 h-10 overflow-hidden bg-surface-1">{file ? <Wave path={file.mediaPath} sourceIn={v.sourceInMs / 1000} length={v.lengthMs * v.speed / 1000} width={640} height={40} color="var(--text-secondary)" loaded={loaded} /> : null}</div>
        <div className="flex flex-wrap gap-2">
          <Button data-testid="dialogue-version-preview" size="sm" variant="secondary" disabled={!file || !audioBank.get(file.mediaPath)} onClick={() => {
            if (preview === v.id) { stop(); return; }
            stop(); onStopScene();
            if (!file) return;
            const buf = audioBank.get(file.mediaPath); if (!buf) return;
            const ctx = context.current ?? new AudioContext(); context.current = ctx; void ctx.resume();
            const item: FilmAudioItem = { clip: projected, version: file, start: 0, length: v.lengthMs / 1000, fullLength: v.lengthMs / 1000, sourceIn: v.sourceInMs / 1000, speed: v.speed, gain: Math.pow(10, v.gainDb / 20), fadeIn: v.fadeInMs / 1000, fadeOut: v.fadeOutMs / 1000, keys: v.volumeKeys.map(k => ({ t: k.t / 1000, db: k.db })) };
            source.current = scheduleOne(ctx, ctx.destination, item, buf, { from: 0, startAt: ctx.currentTime + 0.03 });
            setPreview(v.id); if (source.current) source.current.onended = () => setPreview(null);
          }}>{preview === v.id ? L("Stopp forhåndslytting", "Stop preview") : L("Forhåndslytt", "Preview")}</Button>
          <Button data-testid="dialogue-version-activate" size="sm" variant="secondary" disabled={active} onClick={() => { stop(); setError(cmds.run({ type: "SetActiveDialogueVersion", clipId: clip.id, dialogueVersionId: v.id }, L("Velg filmversjon", "Choose film version"))); }}>{L("Bruk i filmen", "Use in film")}</Button>
          <Button data-testid="dialogue-version-edit" size="sm" variant="ghost" onClick={() => { stop(); setEditing(v.id); }}>{L("Rediger lydprofil", "Edit audio profile")}</Button>
          <Button data-testid="dialogue-version-delete" size="sm" variant="ghost" disabled={active} onClick={() => setDeleting(v.id)}>{L("Slett versjon …", "Delete version …")}</Button>
        </div>
        {deleting === v.id ? <div role="alertdialog" aria-label={L("Bekreft sletting av versjon", "Confirm version deletion")} className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-primary">
          {L("Slett denne inaktive versjonen? Handlingen kan angres.", "Delete this inactive version? This can be undone.")}
          <Button data-testid="dialogue-version-delete-confirm" size="sm" variant="destructive" onClick={() => { setError(cmds.run({ type: "SetDialogueVersionRemoved", dialogueVersionId: v.id, removed: true }, L("Slett lydversjon", "Delete audio version"))); setDeleting(null); }}>{L("Ja, slett versjonen", "Yes, delete version")}</Button>
          <Button size="sm" variant="ghost" onClick={() => setDeleting(null)}>{L("Avbryt", "Cancel")}</Button>
        </div> : null}
      </div>;
    })}
    {preview ? <p role="status" className="text-xs text-text-tertiary">{L("Forhåndslytting endrer ikke filmversjonen.", "Preview does not change the film version.")}</p> : null}
    {error ? <p role="alert" className="text-xs text-status-danger">{error}</p> : null}
    {edited ? <AudioClipEditor open onOpenChange={o => { if (!o) setEditing(null); }} state={state} clip={edited.clip} sceneSeconds={null} editable url={urls.data?.[audioVersion(state, edited.clip)?.mediaPath ?? ""] ?? null} onChange={(_label, patch) => setError(cmds.run({ type: "UpdateDialogueVersionEdit", dialogueVersionId: edited.v.id, edit: { ...editOf(edited.v), ...patch } }, L("Rediger lydversjon", "Edit audio version")))} /> : null}
  </section>;
}