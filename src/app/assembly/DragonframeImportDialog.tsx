import { useMemo, useRef, useState } from "react";
import { Columns2, FolderOpen, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SceneSelect } from "@/app/shell/SceneSelect";
import { dragonframeImportDocument, dragonframeFilmFrames, dragonframeWarnings, recognizeDragonframeShot, type DragonframeWarning } from "@/core/interchange/dragonframe-import";
import { fpsToNumber, type Rational } from "@/core/time";
import type { ProjectState } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { t } from "@/core/i18n/keyed";
import { dragonframeSources, encodeDragonframe, inspectDragonframe, type DragonframeInput } from "./dragonframe-import";
import { FILM_ACCEPT, readFilmMetadata, uploadFilm } from "./film-import";
import { CompareTakesDialog } from "./CompareTakesDialog";

function warningText(w: DragonframeWarning): string {
  switch (w) {
    case "twos": return t("ptg5.twos"); case "short": return t("ptg5.short"); case "long": return t("ptg5.long");
    case "partial": return t("ptg5.partial"); case "hidden": return t("ptg5.hidden"); case "deleted": return t("ptg5.deleted");
    case "fps": return t("ptg5.fps-warning"); case "no-edl": return t("ptg5.no-edl");
  }
}
type Candidate = { names: string[]; input: DragonframeInput | null; film: File | null; frames: number; fps: Rational | null };

export function DragonframeImportDialog({ open, onOpenChange, state, productionId, cmds }: {
  open: boolean; onOpenChange: (open: boolean) => void; state: ProjectState; productionId: string; cmds: Commands;
}) {
  const directory = useRef<HTMLInputElement>(null), archive = useRef<HTMLInputElement>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [occurrenceId, setOccurrenceId] = useState("");
  const [rate, setRate] = useState(24);
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null), [saved, setSaved] = useState(false), [compare, setCompare] = useState(false);
  // Expected shot lengths must not be derived from a currently active imported film.
  const doc = useMemo(() => dragonframeImportDocument(state, productionId), [state, productionId]);
  const match = candidate ? recognizeDragonframeShot(candidate.names, doc) : null;
  const shot = doc.shots.find(s => s.id === occurrenceId);
  const fps = candidate?.fps ?? { num: Math.round(rate * 1000), den: 1000 };
  const frames = candidate?.input ? candidate.input.timeline.files.length : candidate?.frames ?? 0;
  const warnings = candidate && shot ? dragonframeWarnings({ frames, fps, expectedFps: doc.fps, shot,
    ...(candidate.input ? { timeline: candidate.input.timeline, hasEdl: candidate.input.hasEdl } : {}),
  }) : [];
  async function read(files: File[]) {
    if (!files.length) return;
    setBusy(true); setError(null); setSaved(false); setCandidate(null); setOccurrenceId("");
    try {
      let next: Candidate;
      const file = files[0];
      if (files.length === 1 && file && /\.(mp4|mov|m4v|qt|webm)$/i.test(file.name)) {
        const meta = await readFilmMetadata(file);
        const sourceFps = meta.fps ? { num: Math.round(meta.fps * 1000), den: 1000 } : state.project.fps;
        next = { names: [file.name], film: file, input: null, frames: dragonframeFilmFrames(meta.durationMs / 1000, sourceFps), fps: sourceFps };
      } else {
        const sources = await dragonframeSources(files); const input = await inspectDragonframe(sources);
        if (!input.timeline.files.length) throw new Error(t("ptg5.empty"));
        next = { names: sources.map(s => s.path), input, film: null, frames: input.timeline.files.length, fps: input.fps };
      }
      const recognized = recognizeDragonframeShot(next.names, doc);
      setCandidate(next); setOccurrenceId(recognized?.shot.id ?? ""); setRate(fpsToNumber(doc.fps));
    } catch (e) { setError(e instanceof Error ? e.message : t("ptg5.invalid")); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!candidate || !shot || rate <= 0 || !Number.isFinite(rate)) return;
    setBusy(true); setError(null); setProgress(0);
    try {
      const name = match?.shot.id === shot.id ? match.name : shot.name;
      const file = candidate.film ?? (candidate.input ? await encodeDragonframe(candidate.input, fps, name, setProgress) : null);
      if (!file) throw new Error(t("ptg5.empty"));
      const film = await uploadFilm(state.project.id, file, state.project.fps);
      const result = await cmds.runAndWait({ type: "AddTake", takeId: film.takeId as never, occurrenceId: shot.id as never,
        segmentId: null, kind: "imported_film", status: warnings.includes("partial") ? "in_progress" : "reference",
        durationFrames: film.durationFrames, mediaRef: film.mediaRef, media: film.media }, t("ptg5.heading"));
      if (result.error) throw new Error(result.error);
      setSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : t("ptg5.invalid")); }
    finally { setBusy(false); }
  }
  return <>
    <Dialog open={open} onOpenChange={o => { if (!busy) onOpenChange(o); }}>
      <DialogContent uiId="V-041" className="max-w-xl" data-testid="ptg5-dialog">
        <DialogHeader><DialogTitle>{t("ptg5.heading")}</DialogTitle><DialogDescription>{t("ptg5.description")}</DialogDescription></DialogHeader>
        <div className="flex flex-wrap gap-2">
          <input ref={directory} type="file" multiple className="sr-only" data-testid="ptg5-folder" aria-label={t("ptg5.folder")}
            {...{ webkitdirectory: "" }} onChange={e => { void read(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
          <input ref={archive} type="file" accept={`.zip,${FILM_ACCEPT}`} className="sr-only" data-testid="ptg5-file" aria-label={t("ptg5.file")}
            onChange={e => { void read(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
          <Button variant="outline" size="sm" disabled={busy} onClick={() => directory.current?.click()}><FolderOpen />{t("ptg5.folder")}</Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => archive.current?.click()}><Upload />{t("ptg5.file")}</Button>
        </div>
        {candidate ? <div className="space-y-3">
          {match ? <p className="text-xs text-status-success" data-testid="ptg5-recognized">{t("ptg5.recognized", { name: match.name, version: match.version })}</p> : <p className="text-xs text-status-uncertain">{t("ptg5.unmatched")}</p>}
          <SceneSelect value={occurrenceId} onChange={id => { setOccurrenceId(id); setSaved(false); }} disabled={busy || saved}
            emptyLabel={t("ptg5.shot")} ariaLabel={t("ptg5.shot")} testId="ptg5-shot" options={doc.shots.map(s => ({ value: s.id, label: s.name, number: s.sceneNumber ?? "", occurrence: state.occurrences[s.id] }))} />
          {!candidate.fps ? <label className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">{t("ptg5.rate-missing")}
            <input type="number" min="1" max="1000" step="0.001" value={rate} onChange={e => setRate(Number(e.target.value))} disabled={busy || saved} data-testid="ptg5-rate"
              className="h-8 w-24 rounded-sm border border-border-control bg-surface-3 px-2 text-text-primary" />
          </label> : null}
          {shot ? <p className="text-xs text-text-secondary" data-testid="ptg5-length">{t("ptg5.length", { frames, fps: fpsToNumber(fps), expected: shot.lengthFrames + shot.handleIn + shot.handleOut })}</p> : null}
          <ul className="space-y-1 text-xs text-status-uncertain" data-testid="ptg5-warnings">{warnings.map(w => <li key={w} data-testid={`ptg5-warning-${w}`}>{warningText(w)}</li>)}</ul>
          <Button disabled={busy || saved || !shot || !Number.isFinite(rate) || rate <= 0} onClick={() => void save()} data-testid="ptg5-save"><Upload />{t("ptg5.save")}</Button>
        </div> : null}
        {busy ? <p role="status" className="text-xs text-text-secondary">{t("ptg5.working", { progress })}</p> : null}
        {saved ? <div role="status" className="space-y-2 text-xs text-status-success" data-testid="ptg5-saved"><p>{t("ptg5.saved")}</p><Button variant="outline" size="sm" onClick={() => setCompare(true)} data-testid="ptg5-compare"><Columns2 />{t("ptg5.compare")}</Button></div> : null}
        {error ? <p role="alert" className="text-xs text-status-danger">{error}</p> : null}
      </DialogContent>
    </Dialog>
    {compare && shot ? <CompareTakesDialog importedOnly open onOpenChange={setCompare} state={state} occurrenceId={shot.id} segmentId={null} title={shot.name} jobs={[]} editable={false} cmds={cmds} productionId={productionId} /> : null}
  </>;
}