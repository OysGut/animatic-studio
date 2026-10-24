import { useRef, useState } from "react";
import type * as React from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProjectState } from "@/core/model";
import type { FilmClip } from "@/core/assembly/film";
import { exportImageSource, type ExportImageSource } from "@/core/storyboard/playback";
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
import { exportCompositing } from "@/engine/export/compositing";
import { filmAudio } from "@/core/audio";
import { audioBank } from "@/app/audio/use-audio-playback";
import type { AeCameraMode } from "@/core/interchange/ae-jsx";
import { loadImages } from "@/engine/export/animatic";
import { signedUrls } from "@/app/library/asset-images";
import { t } from "@/core/i18n/keyed";
import { useQueryClient } from "@tanstack/react-query";
import { exportRecordsKey } from "@/app/projects/use-history-records";
import { exportMouthPackage } from "@/engine/export/mouth-list";

type PtgCard = "shotlist" | "dragonframe" | "ae" | "fbx" | "editorial" | "compositing" | "mouth";

export function ShotlistExport({ state, productionId, clips, language, disabled, imageSource = "animation" }: {
  state: ProjectState; productionId: string; clips: readonly FilmClip[];
  language: { dialogue: string; subtitles: string | null }; disabled: boolean;
  imageSource?: ExportImageSource;
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
  const [active, setActive] = useState<PtgCard | null>(null);
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
  async function startPackage(kind: "fbx" | "ae" | "mouth" | "compositing") {
    const initial = buildInterchange(state, { productionId, language, occurrenceIds: clips.map(c => c.occurrenceId) });
    const fileName = `${initial.project.code}-${kind === "fbx" ? "camera" : kind === "mouth" ? "mouth" : kind === "compositing" ? "compositing" : "after-effects"}.zip`;
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
      if (kind === "mouth") {
        await exportMouthPackage(state, doc, sink, ctrl.signal);
      } else if (kind === "fbx") {
        await exportCameraFbx({ doc, sink, signal: ctrl.signal });
      } else {
        const used = new Set<string>();
        for (const s of doc.shots) {
          for (const l of s.layers) { if (l.fileId) used.add(l.fileId); for (const w of l.swaps) if (w.fileId) used.add(w.fileId); }
          for (const a of s.audio) if (a.fileId) used.add(a.fileId);
        }
        const paths = doc.references.filter(r => used.has(r.id)).map(r => r.mediaPath);
        if (kind === "compositing") await exportCompositing({ doc, sink, signal: ctrl.signal, urls: await signedUrls([...new Set(paths)], 600) });
        else await exportAePackage({ doc, cameraMode, sink, titleCard: titleCard ? { origin: window.location.origin } : null, signal: ctrl.signal, urls: await signedUrls([...new Set(paths)], 600),
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
    const source = editorial ? imageSource : "animation";
    const initial = buildInterchange(state, { productionId, language, occurrenceIds: clips.map(c => c.occurrenceId), imageSource: source });
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
      const doc = buildInterchange(state, { productionId, language, occurrenceIds: clips.map(c => c.occurrenceId), versions: reservation.versions, imageSource: source });
      const adapted = exportImageSource(languageState(state, language.dialogue), clips, source);
      const ls = adapted.state;
      const imagePaths = doc.references.filter(r => r.mimeType.startsWith("image/")).map(r => r.mediaPath);
      const { images } = await loadImages(await signedUrls(editorial && !editorialMedia ? [] : imagePaths, 600));
      const filmPaths = clips.flatMap(c => c.parts.flatMap(p => p.take?.mediaRef ? [p.take.mediaRef] : []));
      const items = filmAudio(ls, clips, ls.project.fps, language.dialogue);
      const audioPaths = [...new Set(items.flatMap(it => it.version ? [it.version.mediaPath] : []))];
      if (!editorial || editorialMedia) await audioBank.loadAll(await signedUrls(audioPaths, 600));
      const options = { doc, state: ls, clips: adapted.clips, images, filmUrls: await signedUrls(editorial && !editorialMedia ? [] : [...new Set(filmPaths)], 600),
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
  const off = disabled || !!progress;
  const noRun = off || clips.length === 0 || !userId;
  const field = "flex items-center gap-2 text-xs text-text-secondary";
  const sel = "h-8 min-w-0 rounded-sm border border-border-control bg-surface-3 px-2 text-text-primary";
  const cameraSelect = (testId?: string) => (
    <label className={field}>{t("ptg3.camera-mode")}
      <select data-testid={testId} disabled={off} value={cameraMode} onChange={e => setCameraMode(e.target.value as AeCameraMode)} className={sel}>
        <option value="ae">{t("ptg3.mode-ae")}</option><option value="parallax">{t("ptg3.mode-parallax")}</option>
      </select>
    </label>
  );
  const run = (card: PtgCard, fn: () => Promise<void>) => { setActive(card); void fn(); };
  const card = (id: PtgCard, title: string, desc: string, options: React.ReactNode, button: React.ReactNode) => (
    <div data-testid={`ptg-card-${id}`} className="flex min-w-0 flex-col gap-2 rounded-sm border border-border bg-surface-1 p-3">
      <div>
        <h4 className="text-[13px] font-semibold text-text-primary">{title}</h4>
        <p className="text-xs text-text-tertiary">{desc}</p>
      </div>
      {options ? <div className="flex flex-wrap items-center gap-x-4 gap-y-2">{options}</div> : null}
      <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-1">
        {active === id && progress ? <><span role="status" className="text-xs text-text-secondary">{progress.done} / {progress.total}</span><Button size="icon" variant="ghost" aria-label={t("ptg1.cancel")} onClick={() => abort.current?.abort()}><X /></Button></> : null}
        {button}
      </div>
      {active === id && ready ? <a data-testid="ptg-download" href={ready.url} download={ready.name} className="block text-right text-xs text-text-primary">{ready.name}</a> : null}
      {active === id && error ? <p role="alert" className="text-xs text-status-danger">{error}</p> : null}
    </div>
  );
  return <section data-testid="ptg-export-section" className="@container flex min-w-0 flex-col gap-3">
    <h3 className="text-sm font-semibold text-text-primary">{t("ptg1.to-production")}</h3>
    <div className="rounded-sm border border-border bg-surface-1 px-3 py-2">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">{t("ptg.layout.shared")}</div>
      <InterchangeSettings state={state} userId={userId} editable={editable} disabled={off} />
    </div>
    <div className="grid grid-cols-1 gap-3 @[560px]:grid-cols-2">
      {card("shotlist", t("ptg.card.shotlist.title"), t("ptg.card.shotlist.desc"),
        <label className={field}>{t("ptg1.profile")}
          <select data-testid="ptg-profile" disabled={off} value={profile} onChange={e => setProfile(e.target.value as ShotlistProfile)} className={sel}>
            <option value="standard">{t("ptg1.standard")}</option><option value="flow">Flow</option><option value="ftrack">ftrack</option><option value="kitsu">Kitsu</option>
          </select>
        </label>,
        <Button data-testid="ptg-export-shotlist" size="sm" variant="outline" disabled={noRun} onClick={() => run("shotlist", start)}><Download />{t("ptg1.shotlist")}</Button>)}
      {card("dragonframe", t("ptg.card.dragonframe.title"), t("ptg.card.dragonframe.desc"),
        <>
          <label className={field}><input type="checkbox" data-testid="ptg-df-png" disabled={off} checked={dfPng} onChange={e => setDfPng(e.target.checked)} />{t("ptg2.option-png")}</label>
          <label className={field}><input type="checkbox" data-testid="ptg-df-burnin" disabled={off} checked={dfBurnIn} onChange={e => setDfBurnIn(e.target.checked)} />{t("ptg2.option-burnin")}</label>
        </>,
        <Button data-testid="ptg-export-dragonframe" size="sm" variant="outline" disabled={noRun} onClick={() => run("dragonframe", () => startDragonframe())}><Download />{t("ptg2.send")}</Button>)}
      {card("ae", t("ptg.card.ae.title"), t("ptg.card.ae.desc"),
        <>
          {cameraSelect("ptg-camera-mode")}
          <label className={field}><input type="checkbox" data-testid="ptg-title-card" disabled={off} checked={titleCard} onChange={e => setTitleCard(e.target.checked)} />{t("ptg3b.option")}</label>
        </>,
        <Button data-testid="ptg-export-ae" size="sm" variant="outline" disabled={noRun} onClick={() => run("ae", () => startPackage("ae"))}><Download />{t("ptg3.ae-package")}</Button>)}
      {card("fbx", t("ptg.card.fbx.title"), t("ptg.card.fbx.desc"),
        cameraSelect("ptg-camera-mode-fbx"),
        <Button data-testid="ptg-export-fbx" size="sm" variant="outline" disabled={noRun} onClick={() => run("fbx", () => startPackage("fbx"))}><Download />{t("ptg3.camera-fbx")}</Button>)}
      {card("editorial", t("ptg.card.editorial.title"), t("ptg.card.editorial.desc"),
        <label className={field}><input type="checkbox" data-testid="ptg-editorial-media" disabled={off} checked={editorialMedia} onChange={e => setEditorialMedia(e.target.checked)} />{t("ptg6.include-media")}</label>,
        <Button data-testid="ptg-export-editorial" size="sm" variant="outline" disabled={noRun} onClick={() => run("editorial", () => startDragonframe(true))}><Download />{t("ptg6.export")}</Button>)}
      {card("compositing", t("ptg.card.compositing.title"), t("ptg.card.compositing.desc"), null,
        <Button data-testid="ptg-export-compositing" size="sm" variant="outline" disabled={noRun} onClick={() => run("compositing", () => startPackage("compositing"))}><Download />{t("ptg7.export")}</Button>)}
      {card("mouth", t("ptg.card.mouth.title"), t("ptg.card.mouth.desc"), null,
        <Button data-testid="ptg4-export" size="sm" variant="outline" disabled={noRun} onClick={() => run("mouth", () => startPackage("mouth"))}><Download />{t("ptg4.export")}</Button>)}
    </div>
  </section>;
}
