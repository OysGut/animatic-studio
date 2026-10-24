import { useRef, useState } from "react";
import { Mic, Square, Upload, Smartphone } from "lucide-react";
import { newId, secondsToFrames, panelDetails, type Composition, type ProjectState, type PanelDetails } from "@/core";
import { usePanelAudioPlan } from "@/core/storyboard/temp-audio";
import { useRecorder } from "@/app/audio/use-recorder";
import { createSoundAsset, nameFromFile, audioMediaFromStoredFile } from "@/app/library/asset-audio";
import { MobileImportDialog } from "@/app/mobile/MobileImportDialog";
import { claimMobileImport, linkMobileImport, type MobileImportRow } from "@/adapters/browser/mobile-import";
import { Button } from "@/components/ui/button";
import type { Commands } from "@/app/project/use-commands";
import { t } from "@/core/i18n/keyed";

export function PanelAudio({ projectId, state, panel, cmds, allowed, save }: { projectId: string; state: ProjectState; panel: Composition; cmds: Commands; allowed: boolean; save: (patch: Partial<PanelDetails>) => string | null }) {
  const recorder = useRecorder();
  const input = useRef<HTMLInputElement>(null);
  const [mobile, setMobile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const details = panelDetails(panel);
  const persist = async (file: File) => {
    if (!allowed || busy) return;
    setBusy(true); setError(null);
    try {
      const name = nameFromFile(file);
      const sound = await createSoundAsset(cmds, projectId, file, name);
      const now = cmds.current()?.compositions[panel.id];
      if (!now || now.removed) return;
      const result = await cmds.runAndWait({ type: "SetStoryboardDetails", panelId: panel.id, details: { ...panelDetails(now), tempAudio: { assetId: sound.assetId, versionId: sound.versionId, name, durationMs: sound.durationMs } } }, t("sb4.temp-audio"));
      if (result.error) setError(result.error);
    } catch (e) { setError(e instanceof Error ? e.message : t("sb2.load-error")); }
    finally { setBusy(false); }
  };
  const record = async () => {
    const take = await recorder.start();
    if (!take) return;
    try { await persist(new File([take.blob], `${t("sb4.temp-audio")}.${take.ext}`, { type: take.mime })); }
    finally { URL.revokeObjectURL(take.url); }
  };
  const useMobile = async (row: MobileImportRow) => {
    if (!allowed || busy || row.kind !== "audio" || row.asset_version_id) return;
    setBusy(true); setError(null);
    try {
      if (!(await claimMobileImport(row.id))) throw new Error(t("sb2.load-error"));
      const media = await audioMediaFromStoredFile(row.path, row.mime_type);
      if (!media.durationMs) throw new Error(t("sb2.load-error"));
      const assetId = newId<"asset">(), variantId = newId<"asset_variant">(), versionId = newId<"asset_version">(), group = newId();
      const name = row.file_name || t("sb4.temp-audio");
      const commands = [
        { type: "CreateAssets" as const, assets: [{ assetId, fields: { kind: "sound" as const, name, names: [], description: "", category: "", tags: [] } }] },
        { type: "CreateAssetVariant" as const, variantId, assetId, fields: { name, style: "other" as const, appearance: "" } },
        { type: "AddAssetVersion" as const, versionId, variantId, media, note: "" },
      ];
      for (const command of commands) { const r = await cmds.runAndWait(command, t("sb4.temp-audio"), group); if (r.error) throw new Error(r.error); }
      const now = cmds.current()?.compositions[panel.id];
      if (!now || now.removed) return;
      const r = await cmds.runAndWait({ type: "SetStoryboardDetails", panelId: panel.id, details: { ...panelDetails(now), tempAudio: { assetId, versionId, durationMs: media.durationMs, name } } }, t("sb4.temp-audio"), group);
      if (r.error) throw new Error(r.error);
      const linked = await linkMobileImport(row.id, { assetId, versionId });
      if (linked) throw new Error(linked.message);
    } catch (e) { setError(e instanceof Error ? e.message : t("sb2.load-error")); }
    finally { setBusy(false); }
  };
  const apply = () => {
    if (!allowed) return;
    const current = cmds.current() ?? state;
    const group = newId();
    for (const command of usePanelAudioPlan(current, panel.id, newId<"audio_clip">())) { const e = cmds.run(command, t("sb4.use-scene"), group); if (e) { setError(e); return; } }
    setConfirm(false);
  };
  return <section className="space-y-2 border-t border-border pt-2" data-testid="sb4-panel-audio">
    <h3 className="text-[13px] font-semibold">{t("sb4.temp-audio")}</h3>
    {details.tempAudio ? <div className="text-xs"><span dir="auto">{details.tempAudio.name}</span> · {(details.tempAudio.durationMs / 1000).toFixed(1)} s
      <div className="flex flex-wrap gap-1 mt-1">
        <Button size="sm" variant="outline" disabled={!allowed || busy} onClick={() => { const e = cmds.run({ type: "UpdateStoryboardPanel", panelId: panel.id, durationFrames: secondsToFrames((details.tempAudio?.durationMs ?? 0) / 1000, state.project.fps) }, t("sb4.audio-timing")); setError(e); }} data-testid="sb4-audio-timing">{t("sb4.audio-timing")}</Button>
        <Button size="sm" variant="outline" disabled={!allowed || busy} onClick={() => setConfirm(true)} data-testid="sb4-use-scene">{t("sb4.use-scene")}</Button>
        <Button size="sm" variant="ghost" disabled={!allowed || busy} onClick={() => save({ tempAudio: null })}>{t("sb3.remove")}</Button>
      </div>
    </div> : null}
    {confirm ? <div className="space-y-1 border-s-2 border-status-uncertain ps-2"><p className="text-xs">{t("sb4.mix-confirm")}</p><Button size="sm" disabled={!allowed || busy} onClick={apply} data-testid="sb4-mix-confirm">{t("sb3.confirm")}</Button><Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>{t("sb2.cancel")}</Button></div> : null}
    <div className="flex gap-1">
      <Button size="icon" variant="ghost" disabled={!allowed || busy || recorder.phase === "starting"} aria-label={recorder.phase === "recording" ? t("sb4.stop") : t("sb4.record")} onClick={() => recorder.phase === "recording" ? recorder.stop() : void record()} data-testid="sb4-record">{recorder.phase === "recording" ? <Square/> : <Mic/>}</Button>
      <Button size="icon" variant="ghost" disabled={!allowed || busy} aria-label={t("sb4.upload-audio")} onClick={() => input.current?.click()}><Upload/></Button>
      <Button size="icon" variant="ghost" disabled={!allowed || busy} aria-label={t("sb4.mobile-audio")} onClick={() => setMobile(true)}><Smartphone/></Button>
      {recorder.phase === "recording" ? <output className="font-mono text-xs">{(recorder.ms / 1000).toFixed(1)} s</output> : null}
      <input ref={input} hidden type="file" accept="audio/*" onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void persist(file); }} data-testid="sb4-audio-upload"/>
    </div>
    {busy ? <p role="status" className="text-xs">{t("sb2.loading")}</p> : null}
    {error || recorder.error ? <p role="alert" className="text-xs text-status-danger">{error ?? recorder.error}</p> : null}
    <MobileImportDialog open={mobile} onOpenChange={setMobile} projectId={projectId} context={{ type: "draft", draftKey: `sb4-${panel.id}`, assetKind: "sound" }} label={`${t("sb4.temp-audio")} · ${panel.name}`} actions={row => row.kind === "audio" && !row.asset_version_id ? <Button size="sm" disabled={!allowed || busy} onClick={() => void useMobile(row)}>{t("sb4.temp-audio")}</Button> : null}/>
  </section>;
}