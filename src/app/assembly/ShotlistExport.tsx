import { useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProjectState } from "@/core/model";
import type { FilmClip } from "@/core/assembly/film";
import { buildInterchange } from "@/core/interchange";
import type { ShotlistProfile } from "@/core/interchange/shotlist";
import { languageState } from "@/core/language";
import { useSession } from "@/app/auth/use-session";
import { canEdit, useMembers } from "@/app/project/use-project";
import { useCommands } from "@/app/project/use-commands";
import { InterchangeSettings } from "@/app/projects/InterchangeSettings";
import { reserveInterchangeExport, completeInterchangeExport } from "@/adapters/browser/interchange";
import { openZipSink } from "@/engine/export/zip";
import { exportShotlist } from "@/engine/export/shotlist";
import { exportCameraFbx } from "@/engine/export/camera-export";
import { exportAePackage } from "@/engine/export/ae-export";
import { exportDragonframe } from "@/engine/export/dragonframe";
import { exportEditorial } from "@/engine/export/editorial";
import { filmAudio } from "@/core/audio";
import { audioBank } from "@/app/audio/use-audio-playback";
import type { AeCameraMode } from "@/core/interchange/ae-jsx";
import { loadImages } from "@/engine/export/animatic";
import { signedUrls } from "@/app/library/asset-images";
import { t } from "@/core/i18n/keyed";
import { useQueryClient } from "@tanstack/react-query";
import { exportRecordsKey } from "@/app/projects/use-history-records";
import { ExportHistory } from "@/app/projects/ExportHistory";

export function ShotlistExport({ state, productionId, clips, language, disabled }: {
  state: ProjectState; productionId: string; clips: readonly FilmClip[];
  language: { dialogue: string; subtitles: string | null }; disabled: boolean;
}) {
  const session = useSession();
  const qc = useQueryClient();
  const userId = session.status === "signed-in" ? session.session.user.id : "";
  const members = useMembers(state.project.id);
  const editable = canEdit(members.data?.find(m => m.user_id === userId)?.role);
  const commands = useCommands(state.project.id, userId, editable);
  const [profile, setProfile] = useState<ShotlistProfile>("standard");
  const [cameraMode, setCameraMode] = useState<AeCameraMode>("ae");
  const [titleCard, setTitleCard] = useState(true); // PTG3b: på som standard
  const [dfPng, setDfPng] = useState(false); // PTG2: PNG-sekvens er valgfri
  const [dfBurnIn, setDfBurnIn] = useState(true);
  const [editorialMedia, setEditorialMedia] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<{ url: string; name: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  async function start() {
    const initial = buildInterchange(state, { productionId, language, occurrenceIds: clips.map(c => c.occurrenceId) });
    const fileName = `${initial.project.code}-shotlist.zip`;
    // Picker must be opened synchronously from the click, before waiting for commands.
    const sinkPromise = openZipSink(fileName);
    const ctrl = new AbortController(); abort.current = ctrl;
    setError(null); setReady(null); setProgress({ done: 0, total: initial.shots.length });
    const sink = await sinkPromise;
    if (!sink) { setProgress(null); return; }
    try {
      await commands.whenIdle();
      const reservation = await reserveInterchangeExport({ projectId: state.project.id, productionId, occurrenceIds: clips.map(c => c.occurrenceId), fileName,
        settings: { profile, language: language.dialogue, format: "csv-json", captureFpsNum: initial.captureFps.num, captureFpsDen: initial.captureFps.den } });
      const doc = buildInterchange(state, { productionId, language, occurrenceIds: clips.map(c => c.occurrenceId), versions: reservation.versions });
      const imagePaths = doc.references.filter(r => r.mimeType.startsWith("image/")).map(r => r.mediaPath);
      const { images } = await loadImages(await signedUrls(imagePaths, 600));
      const filmPaths = clips.flatMap(c => c.parts.flatMap(p => p.take?.mediaRef ? [p.take.mediaRef] : []));
      await exportShotlist({ doc, state: languageState(state, language.dialogue), clips, profile, images, sink,
        filmUrls: await signedUrls([...new Set(filmPaths)], 600), signal: ctrl.signal,
        onProgress: (done, total) => setProgress({ done, total }) });
      setReady(sink.link?.() ?? null);
      await completeInterchangeExport(state.project.id, reservation.batchId);
      void qc.invalidateQueries({ queryKey: exportRecordsKey(productionId) });
    } catch (e) {
      await sink.abort().catch(() => undefined);
      if (!ctrl.signal.aborted) setError(t("ptg1.export-failed"));
    } finally { abort.current = null; setProgress(null); }
  }
  async function startPackage(kind: "fbx" | "ae") {
    const initial = buildInterchange(state, { productionId, language, occurrenceIds: clips.map(c => c.occurrenceId) });
    const fileName = `${initial.project.code}-${kind === "fbx" ? "camera" : "after-effects"}.zip`;
    // Picker must be opened synchronously from the click, before waiting for commands.
    const sinkPromise = openZipSink(fileName);
    const ctrl = new AbortController(); abort.current = ctrl;
    setError(null); setReady(null); setProgress({ done: 0, total: 1 });
    const sink = await sinkPromise;
    if (!sink) { setProgress(null); return; }
    try {
      await commands.whenIdle();
      const reservation = await reserveInterchangeExport({ projectId: state.project.id, productionId, occurrenceIds: clips.map(c => c.occurrenceId), fileName,
        settings: { format: kind, language: language.dialogue, cameraMode, ...(kind === "ae" ? { titleCard } : {}), captureFpsNum: initial.captureFps.num, captureFpsDen: initial.captureFps.den } });
      const doc = buildInterchange(state, { productionId, language, occurrenceIds: clips.map(c => c.occurrenceId), versions: reservation.versions });
      if (kind === "fbx") {
        await exportCameraFbx({ doc, sink, signal: ctrl.signal });
      } else {
        const used = new Set<string>();
        for (const s of doc.shots) {
          for (const l of s.layers) { if (l.fileId) used.add(l.fileId); for (const w of l.swaps) if (w.fileId) used.add(w.fileId); }
          for (const a of s.audio) if (a.fileId) used.add(a.fileId);
        }
        const paths = doc.references.filter(r => used.has(r.id)).map(r => r.mediaPath);
        await exportAePackage({ doc, cameraMode, sink, titleCard: titleCard ? { origin: window.location.origin } : null, signal: ctrl.signal, urls: await signedUrls([...new Set(paths)], 600),
          onProgress: p => setProgress({ done: p.files, total: p.totalFiles }) });
      }
      setReady(sink.link?.() ?? null);
      await completeInterchangeExport(state.project.id, reservation.batchId);
      void qc.invalidateQueries({ queryKey: exportRecordsKey(productionId) });
    } catch {
      await sink.abort().catch(() => undefined);
      if (!ctrl.signal.aborted) setError(t("ptg1.export-failed"));
    } finally { abort.current = null; setProgress(null); }
  }
  async function startDragonframe(editorial = false) {
    const initial = buildInterchange(state, { productionId, language, occurrenceIds: clips.map(c => c.occurrenceId) });
    const fileName = `${initial.project.code}-${editorial ? "editorial" : "dragonframe"}.zip`;
    // Picker must be opened synchronously from the click, before waiting for commands.
    const sinkPromise = openZipSink(fileName);
    const ctrl = new AbortController(); abort.current = ctrl;
    setError(null); setReady(null); setProgress({ done: 0, total: initial.shots.length });
    const sink = await sinkPromise;
    if (!sink) { setProgress(null); return; }
    try {
      await commands.whenIdle();
      const reservation = await reserveInterchangeExport({ projectId: state.project.id, productionId, occurrenceIds: clips.map(c => c.occurrenceId), fileName,
        settings: { format: editorial ? "editorial" : "dragonframe", language: language.dialogue, png: dfPng, burnIn: dfBurnIn, includeMedia: editorialMedia, captureFpsNum: initial.captureFps.num, captureFpsDen: initial.captureFps.den } });
      const doc = buildInterchange(state, { productionId, language, occurrenceIds: clips.map(c => c.occurrenceId), versions: reservation.versions });
      const ls = languageState(state, language.dialogue);
      const imagePaths = doc.references.filter(r => r.mimeType.startsWith("image/")).map(r => r.mediaPath);
      const { images } = await loadImages(await signedUrls(editorial && !editorialMedia ? [] : imagePaths, 600));
      const filmPaths = clips.flatMap(c => c.parts.flatMap(p => p.take?.mediaRef ? [p.take.mediaRef] : []));
      const items = filmAudio(ls, clips, ls.project.fps, language.dialogue);
      const audioPaths = [...new Set(items.flatMap(it => it.version ? [it.version.mediaPath] : []))];
      if (!editorial || editorialMedia) await audioBank.loadAll(await signedUrls(audioPaths, 600));
      const options = { doc, state: ls, clips, images, filmUrls: await signedUrls(editorial && !editorialMedia ? [] : [...new Set(filmPaths)], 600),
        audio: { items, bank: audioBank }, sink, signal: ctrl.signal,
        onProgress: (done: number, total: number) => setProgress({ done, total }) };
      if (editorial) await exportEditorial({ ...options, includeMedia: editorialMedia });
      else await exportDragonframe({ ...options, png: dfPng, burnIn: dfBurnIn });
      setReady(sink.link?.() ?? null);
      await completeInterchangeExport(state.project.id, reservation.batchId);
      void qc.invalidateQueries({ queryKey: exportRecordsKey(productionId) });
    } catch {
      await sink.abort().catch(() => undefined);
      if (!ctrl.signal.aborted) setError(t("ptg1.export-failed"));
    } finally { abort.current = null; setProgress(null); }
  }
  return <section data-testid="ptg-export-section" className="border-t border-border pt-3">
    <h3 className="mb-3 text-sm font-semibold text-text-primary">{t("ptg1.to-production")}</h3>
    <InterchangeSettings state={state} userId={userId} editable={editable} disabled={disabled || !!progress} />
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-xs text-text-secondary">{t("ptg1.profile")}
        <select data-testid="ptg-profile" disabled={disabled || !!progress} value={profile} onChange={e => setProfile(e.target.value as ShotlistProfile)} className="h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-text-primary">
          <option value="standard">{t("ptg1.standard")}</option><option value="flow">Flow</option><option value="ftrack">ftrack</option><option value="kitsu">Kitsu</option>
        </select>
      </label>
      <Button data-testid="ptg-export-shotlist" size="sm" variant="outline" disabled={disabled || !!progress || clips.length === 0 || !userId} onClick={() => void start()}><Download />{t("ptg1.shotlist")}</Button>
      <label className="flex items-center gap-2 text-xs text-text-secondary">{t("ptg3.camera-mode")}
        <select data-testid="ptg-camera-mode" disabled={disabled || !!progress} value={cameraMode} onChange={e => setCameraMode(e.target.value as AeCameraMode)} className="h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-text-primary">
          <option value="ae">{t("ptg3.mode-ae")}</option><option value="parallax">{t("ptg3.mode-parallax")}</option>
        </select>
      </label>
      <Button data-testid="ptg-export-fbx" size="sm" variant="outline" disabled={disabled || !!progress || clips.length === 0 || !userId} onClick={() => void startPackage("fbx")}><Download />{t("ptg3.camera-fbx")}</Button>
      <label className="flex items-center gap-2 text-xs text-text-secondary">
        <input type="checkbox" data-testid="ptg-title-card" disabled={disabled || !!progress} checked={titleCard} onChange={e => setTitleCard(e.target.checked)} />
        {t("ptg3b.option")}
      </label>
      <Button data-testid="ptg-export-ae" size="sm" variant="outline" disabled={disabled || !!progress || clips.length === 0 || !userId} onClick={() => void startPackage("ae")}><Download />{t("ptg3.ae-package")}</Button>
      <label className="flex items-center gap-2 text-xs text-text-secondary">
        <input type="checkbox" data-testid="ptg-df-png" disabled={disabled || !!progress} checked={dfPng} onChange={e => setDfPng(e.target.checked)} />
        {t("ptg2.option-png")}
      </label>
      <label className="flex items-center gap-2 text-xs text-text-secondary">
        <input type="checkbox" data-testid="ptg-df-burnin" disabled={disabled || !!progress} checked={dfBurnIn} onChange={e => setDfBurnIn(e.target.checked)} />
        {t("ptg2.option-burnin")}
      </label>
      <Button data-testid="ptg-export-dragonframe" size="sm" variant="outline" disabled={disabled || !!progress || clips.length === 0 || !userId} onClick={() => void startDragonframe()}><Download />{t("ptg2.send")}</Button>
      <label className="flex items-center gap-2 text-xs text-text-secondary">
        <input type="checkbox" data-testid="ptg-editorial-media" disabled={disabled || !!progress} checked={editorialMedia} onChange={e => setEditorialMedia(e.target.checked)} />
        {t("ptg6.include-media")}
      </label>
      <Button data-testid="ptg-export-editorial" size="sm" variant="outline" disabled={disabled || !!progress || clips.length === 0 || !userId} onClick={() => void startDragonframe(true)}><Download />{t("ptg6.export")}</Button>
      {progress ? <><span role="status" className="text-xs text-text-secondary">{progress.done} / {progress.total}</span><Button size="icon" variant="ghost" aria-label={t("ptg1.cancel")} onClick={() => abort.current?.abort()}><X /></Button></> : null}
    </div>
    {ready ? <a data-testid="ptg-download" href={ready.url} download={ready.name} className="mt-2 block text-xs text-text-primary">{ready.name}</a> : null}
    {error ? <p role="alert" className="mt-2 text-xs text-status-danger">{error}</p> : null}
    <div className="mt-2"><ExportHistory productionId={productionId} kinds={["script"]} /></div>
  </section>;
}