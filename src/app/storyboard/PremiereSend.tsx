/**
 * C-3 «Premiere Pro» i storyboardet: last ned sekvenspakken (FCP7 XML + OTIO med markører, panelbilder og
 * lyd) for Premiere-panelet, og se forslag fra Premiere side om side. Hvert panel godtas eller avvises for seg;
 * «Godta» kjører vanlige, angrebare kommandoer. Scener, scenenumre og manus endres aldri.
 */
import { useContext, useState } from "react";
import { QueryClientContext, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ResizableDialogContent } from "@/app/shared/ResizableDialogContent";
import { Button } from "@/components/ui/button";
import { newId, type ProjectState } from "@/core";
import { buildPremiereSequence, framesToTimecode, premiereEditCommands, premiereOtio, premiereXml, PREMIERE_ADAPTER } from "@/core/connectors";
import { sourceLanguageOf } from "@/core/dialogue/languages";
import { storedZip } from "@/core/handoff/bytes";
import { panelDetails } from "@/core/storyboard/editing";
import { createSignedUrls } from "@/adapters/browser/storage-files";
import { resolveSbproCandidate } from "@/adapters/connectors/sbpro.functions";
import { premiereProposalsFor, type PremiereProposalView } from "@/adapters/connectors/premiere.functions";
import { useSchemaAtLeast } from "@/app/shell/use-schema";
import type { Commands } from "@/app/project/use-commands";
import { t } from "@/core/i18n/keyed";
import { panelPngBase64 } from "./BoordsSend";

type Props = { state: ProjectState; projectId: string; productionId: string; cmds: Commands; editable: boolean };
export function PremiereButton(props: Props) {
  return useContext(QueryClientContext) ? <PremiereInner {...props} /> : null;
}
function PremiereInner(props: Props) {
  const ready = useSchemaAtLeast(114);
  const [open, setOpen] = useState(false);
  if (!ready || !props.editable) return null;
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} data-testid="c3-open">{t("c3.open")}</Button>
      {open ? <PremiereDialog {...props} open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}

const fromB64 = (b: string) => Uint8Array.from(atob(b), c => c.charCodeAt(0));

function PremiereDialog({ open, onOpenChange, state, projectId, productionId, cmds }: Props & { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const listFn = useServerFn(premiereProposalsFor), resolve = useServerFn(resolveSbproCandidate);
  const proposals = useQuery({ queryKey: ["premiere-proposals", projectId], queryFn: () => listFn({ data: { projectId } }) });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const fps = state.project.fps;
  const { sequence, audioVersions } = buildPremiereSequence(state, productionId, sourceLanguageOf(state));

  async function download() {
    setBusy(true); setMsg(null);
    try {
      const files: { path: string; data: Uint8Array }[] = [];
      let n = 0;
      for (const p of sequence.panels) {
        setProgress(t("c3.progress", { done: String(++n), total: String(sequence.panels.length) }));
        const b = await panelPngBase64(state, p.panelId).catch(() => null);
        if (b) files.push({ path: p.image, data: fromB64(b) });
      }
      if (audioVersions.length) {
        const urls = await createSignedUrls("assets", audioVersions.map(v => v.mediaPath), 600);
        for (const v of audioVersions) {
          const u = urls.find(x => x.path === v.mediaPath)?.signedUrl;
          const r = u ? await fetch(u) : null;
          if (r?.ok) files.push({ path: sequence.audio.find(a => a.path.startsWith(`audio/${v.id}.`))?.path ?? `audio/${v.id}.bin`, data: new Uint8Array(await r.arrayBuffer()) });
        }
      }
      const enc = (s: string) => new TextEncoder().encode(s);
      const meta = { manifestVersion: 1, createdAt: new Date().toISOString(), projectId, frameRate: fps, sampleRate: 48000, sourceApp: { name: "From Pen to Glass", version: "1" }, adapter: { ...PREMIERE_ADAPTER }, items: [{ kind: "project", id: projectId, name: state.project.name }], premiere: { productionId, sequence: "sequence.xml", otio: "sequence.otio", panels: sequence.panels.length } };
      files.unshift({ path: "manifest.json", data: enc(JSON.stringify(meta, null, 2)) }, { path: "sequence.xml", data: enc(premiereXml(sequence)) }, { path: "sequence.otio", data: enc(premiereOtio(sequence)) });
      const blob = new Blob([storedZip(files) as BlobPart], { type: "application/zip" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `ptg-premiere-${projectId.slice(0, 8)}.zip`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      setMsg(t("c3.download.done", { count: String(sequence.panels.length) }));
    } catch { setMsg(t("c3.error")); } finally { setBusy(false); setProgress(null); }
  }

  async function choose(p: PremiereProposalView, accept: boolean) {
    setBusy(true); setMsg(null);
    try {
      if (accept) {
        const commands = premiereEditCommands(state, p.edit);
        if (!commands) { setMsg(t("c3.stale")); return; }
        const group = newId();
        for (const command of commands) { const r = await cmds.runAndWait(command, t("c3.accept"), group); if (r.error) throw Error(r.error); }
      }
      await resolve({ data: { id: p.id, choice: accept ? "choose_incoming" : "reject", revision: p.revision } });
      setMsg(accept ? t("c3.accepted") : t("c3.rejected"));
      await qc.invalidateQueries({ queryKey: ["premiere-proposals", projectId] });
    } catch { setMsg(t("c3.error")); } finally { setBusy(false); }
  }
  const nameOf = (panelId: string) => { const c = state.compositions[panelId as never]; return c ? panelDetails(c).number || c.name || t("c1.panel") : t("c1.panel"); };
  const sceneOf = (occ: string | null) => { if (!occ) return ""; const o = state.occurrences[occ as never]; const sc = o ? state.scenes[o.sceneId as never] : undefined; return sc ? String((sc as { number?: unknown }).number ?? sc.id).slice(0, 12) : occ.slice(0, 8); };
  const list = proposals.data ?? [];

  return (
    <Dialog open={open} onOpenChange={v => { if (!busy) onOpenChange(v); }}>
      <ResizableDialogContent uiId="V-185" sizeKey="premiere" className="max-h-[90dvh] overflow-y-auto" data-testid="c3-dialog">
        <DialogTitle>{t("c3.title")}</DialogTitle>
        <DialogDescription>{t("c3.intro")}</DialogDescription>
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-text-secondary">{t("c3.download.info", { count: String(sequence.panels.length), audio: String(sequence.audio.length) })}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={busy || !sequence.panels.length} onClick={() => void download()} data-testid="c3-download">{t("c3.download")}</Button>
            {progress ? <span className="text-[12px] text-text-secondary" aria-live="polite">{progress}</span> : null}
          </div>
          <p className="text-[12px] text-text-secondary">{t("c3.login-info")}</p>
          <h3 className="text-[14px] font-medium">{t("c3.proposals")}</h3>
          <p className="text-[12px] text-text-secondary">{t("c3.rule")}</p>
          {list.length === 0 ? <p className="text-[13px] text-text-secondary">{t("c3.none")}</p> : (
            <table className="w-full border-collapse text-[13px]" data-testid="c3-proposals">
              <thead>
                <tr className="text-start text-text-secondary">
                  <th scope="col" className="p-1 text-start font-normal">{t("c1.panel")}</th>
                  <th scope="col" className="p-1 text-start font-normal">{t("c3.col.current")}</th>
                  <th scope="col" className="p-1 text-start font-normal">{t("c3.col.premiere")}</th>
                  <th scope="col" className="p-1 text-start font-normal"><span className="sr-only">{t("c3.col.choice")}</span></th>
                </tr>
              </thead>
              <tbody>
                {list.map(p => {
                  const e = p.edit;
                  return (
                    <tr key={p.id} className="border-t border-border align-top" data-testid="c3-proposal">
                      <td className="p-1" dir="auto">
                        <span className="font-medium">{nameOf(p.panelId)}</span>
                        {p.conflict ? <span className="ms-1 rounded-sm bg-surface-2 px-1 text-[11px]">{t("c3.conflict")}</span> : null}
                      </td>
                      <td className="p-1">
                        <div>{t("c3.position", { n: String(e.currentIndex + 1) })}</div>
                        <div>{t("c3.duration", { tc: framesToTimecode(e.currentDuration, fps), frames: String(e.currentDuration) })}</div>
                      </td>
                      <td className="p-1">
                        <div className={e.orderChanged ? "font-medium" : ""}>{t("c3.position", { n: String(e.proposedIndex + 1) })}</div>
                        <div className={e.durationChanged ? "font-medium" : ""}>{t("c3.duration", { tc: framesToTimecode(e.durationFrames, fps), frames: String(e.durationFrames) })}</div>
                        {e.movedToOccurrenceId ? <div className="text-text-secondary">{t("c3.moved-scene", { scene: sceneOf(e.movedToOccurrenceId) })}</div> : null}
                      </td>
                      <td className="p-1">
                        <div className="flex flex-wrap gap-1">
                          <Button size="sm" disabled={busy || (!e.durationChanged && !(e.orderChanged && !e.movedToOccurrenceId))} onClick={() => void choose(p, true)} data-testid="c3-accept">{t("c3.accept")}</Button>
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => void choose(p, false)} data-testid="c3-reject">{t("c3.reject")}</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {msg ? <p className="text-[13px]" role="status">{msg}</p> : null}
        </div>
      </ResizableDialogContent>
    </Dialog>
  );
}
