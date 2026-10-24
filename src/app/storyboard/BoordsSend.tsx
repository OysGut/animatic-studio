/**
 * C-4 «Send til Boords» i storyboardet: send paneler (action/sound/dialogue + panelets rasterisering),
 * hent endringer, og se kandidater og kommentarer fra Boords. Ingenting fra Boords tas i bruk automatisk:
 * «Bruk innkommende» kjører vanlige, angrebare kommandoer (SetStoryboardDetails, eller et nytt bibliotekbilde).
 */
import { useContext, useState } from "react";
import { QueryClientContext, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Dialog, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ResizableDialogContent } from "@/app/shared/ResizableDialogContent";
import { Button } from "@/components/ui/button";
import { newId, type Command, type ProjectState } from "@/core";
import { applyTextCandidate, BOORDS_FIELDS, type ConflictChoice } from "@/core/connectors";
import { panelDetails } from "@/core/storyboard/editing";
import { storyboardPanelsOf } from "@/core/storyboard";
import { panelStructureFrame } from "@/core/storyboard/ai-output";
import { drawFrame, type ImageSource } from "@/engine/compositor/canvas";
import { createSignedUrls } from "@/adapters/browser/storage-files";
import { boordsCommentsFor, myBoordsCandidates, myBoordsConnections, pushToBoords, resolveBoordsCandidate, syncBoordsNow, type BoordsCandidateView } from "@/adapters/connectors/boords.functions";
import { useSchemaAtLeast } from "@/app/shell/use-schema";
import type { Commands } from "@/app/project/use-commands";
import { t } from "@/core/i18n/keyed";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

async function panelPngBase64(s: ProjectState, panelId: string): Promise<string | null> {
  const panel = s.compositions[panelId as never]; if (!panel) return null;
  const frame = panelStructureFrame(s, panel, "composition", null);
  const paths = [...new Set(frame.items.flatMap(it => it.version ? [it.version.mediaPath] : []))];
  const urls = paths.length ? Object.fromEntries((await createSignedUrls("assets", paths, 600)).map(r => [r.path, r.signedUrl])) : {};
  const images = new Map<string, ImageSource>();
  try {
    await Promise.all(paths.map(async p => { const u = urls[p]; if (u) { const r = await fetch(u); if (r.ok) images.set(p, await createImageBitmap(await r.blob())); } }));
    const canvas = document.createElement("canvas"); canvas.width = panel.width; canvas.height = panel.height;
    const ctx = canvas.getContext("2d"); if (!ctx) return null;
    drawFrame(ctx, frame, { images, placeholders: false, view: [1, 0, 0, 1, panel.width / 2, panel.height / 2] });
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, "image/png"));
    if (!blob || blob.size > MAX_IMAGE_BYTES) return null;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  } finally { for (const im of images.values()) if ("close" in im) (im as ImageBitmap).close(); }
}

type SendProps = { state: ProjectState; projectId: string; productionId: string; cmds: Commands; editable: boolean };
/** Uten QueryClient (enkelte isolerte visninger og tester) vises ikke knappen. */
export function BoordsSendButton(props: SendProps) {
  return useContext(QueryClientContext) ? <BoordsSendInner {...props} /> : null;
}
function BoordsSendInner({ state, projectId, productionId, cmds, editable }: SendProps) {
  const ready = useSchemaAtLeast(112);
  const [open, setOpen] = useState(false);
  if (!ready || !editable) return null;
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} data-testid="c4-open">{t("c4.send.open")}</Button>
      {open ? <BoordsDialog open={open} onOpenChange={setOpen} state={state} projectId={projectId} productionId={productionId} cmds={cmds} /> : null}
    </>
  );
}

function BoordsDialog({ open, onOpenChange, state, projectId, productionId, cmds }: { open: boolean; onOpenChange: (v: boolean) => void; state: ProjectState; projectId: string; productionId: string; cmds: Commands }) {
  const qc = useQueryClient();
  const conns = useQuery({ queryKey: ["boords-connections"], queryFn: useServerFn(myBoordsConnections) });
  const candFn = useServerFn(myBoordsCandidates), commFn = useServerFn(boordsCommentsFor);
  const cands = useQuery({ queryKey: ["boords-candidates"], queryFn: () => candFn() });
  const comments = useQuery({ queryKey: ["boords-comments", projectId], queryFn: () => commFn({ data: { projectId } }) });
  const push = useServerFn(pushToBoords), sync = useServerFn(syncBoordsNow), resolve = useServerFn(resolveBoordsCandidate);
  const [connectionId, setConnectionId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const conn = connectionId || conns.data?.[0]?.id || "";
  const panels = Object.values(state.occurrences).filter(o => o.productionId === productionId && o.active).sort((a, b) => a.orderKey.localeCompare(b.orderKey)).flatMap(o => storyboardPanelsOf(state, o.id)).filter(p => p.active !== false);
  const mine = (cands.data ?? []).filter(c => c.projectId === projectId);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["boords-candidates"] }), qc.invalidateQueries({ queryKey: ["boords-comments", projectId] })]);

  async function send() {
    if (!conn || !panels.length) return;
    setBusy(true); setMsg(null);
    try {
      const images: Record<string, string> = {};
      for (const p of panels) { const b = await panelPngBase64(state, p.id).catch(() => null); if (b) images[p.id] = b; }
      const r = await push({ data: { projectId, connectionId: conn, title: state.project.name, panelIds: panels.map(p => p.id), images } });
      setMsg(t("c4.send.done", { created: String(r.created), updated: String(r.updated) }));
    } catch { setMsg(t("c4.error")); } finally { setBusy(false); }
  }
  async function pull() {
    if (!conn) return;
    setBusy(true); setMsg(null);
    try { const r = await sync({ data: { projectId, connectionId: conn } }); setMsg(t("c4.pull.done", { candidates: String(r.candidates), conflicts: String(r.conflicts), comments: String(r.comments) })); await refresh(); }
    catch { setMsg(t("c4.error")); } finally { setBusy(false); }
  }
  async function choose(c: BoordsCandidateView, choice: ConflictChoice) {
    setBusy(true); setMsg(null);
    try {
      if (choice === "choose_incoming") {
        const group = newId();
        const commands: Command[] = [];
        if (c.kind === "text") {
          const panel = state.compositions[c.panelId as never]; if (!panel) throw Error();
          const d = panelDetails(panel), fields = applyTextCandidate(d.fields, c.incoming, choice);
          if (fields) commands.push({ type: "SetStoryboardDetails", panelId: panel.id, details: { ...d, fields } } as Command);
        } else if (c.mediaPath) {
          const assetId = newId<"asset">(), variantId = newId<"asset_variant">();
          commands.push(
            { type: "CreateAssets", assets: [{ assetId, fields: { kind: "other", name: t("c4.image-name"), names: [], description: "", category: "", tags: [] } }] } as Command,
            { type: "CreateAssetVariant", assetId, variantId, fields: { name: t("c4.image-name"), style: "other", appearance: "" } } as Command,
            { type: "AddAssetVersion", versionId: newId() as never, variantId, media: { path: c.mediaPath, mimeType: "image/png", byteSize: Number(c.incoming["byteSize"] ?? 1), sha256: c.incoming["imageSha256"] ?? "", width: null, height: null }, note: JSON.stringify({ kind: "boords-frame", panelId: c.panelId }) } as Command,
          );
        }
        for (const command of commands) { const r = await cmds.runAndWait(command, t("c4.incoming"), group); if (r.error) throw Error(r.error); }
      }
      await resolve({ data: { id: c.id, choice, revision: c.revision } });
      setMsg(t("c0.conflict.done"));
      await refresh();
    } catch { setMsg(t("c4.error")); } finally { setBusy(false); }
  }
  const label = (id: string) => { const p = state.compositions[id as never]; return p ? panelDetails(p).number || p.name || t("c1.panel") : t("c1.panel"); };

  return (
    <Dialog open={open} onOpenChange={v => { if (!busy) onOpenChange(v); }}>
      <ResizableDialogContent uiId="V-183" sizeKey="boords-send" className="max-h-[90dvh] overflow-y-auto" data-testid="c4-dialog">
        <DialogTitle>{t("c4.send.title")}</DialogTitle>
        <DialogDescription>{t("c4.send.intro")}</DialogDescription>
        {(conns.data ?? []).length === 0 && !conns.isLoading ? (
          <p className="text-[13px] text-text-secondary">{t("c4.send.no-connection")} <Link to="/konto" className="text-accent-brand underline">{t("c4.send.to-account")}</Link></p>
        ) : (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-[13px]">{t("c4.send.connection")}
              <select className="rounded-sm border border-border bg-surface-1 px-2 py-1" value={conn} onChange={e => setConnectionId(e.target.value)} data-testid="c4-connection">
                {(conns.data ?? []).map(c => <option key={c.id} value={c.id}>{c.ownerKind === "workspace" ? t("c4.owner.workspace") : t("c4.owner.user")} · {c.keyHint}{c.label ? ` · ${c.label}` : ""}</option>)}
              </select>
            </label>
            <p className="text-[13px] text-text-secondary">{t("c4.send.fields", { count: String(panels.length), fields: BOORDS_FIELDS.join(", ") })}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy || !panels.length} onClick={() => void send()} data-testid="c4-send">{t("c4.send.button")}</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void pull()} data-testid="c4-pull">{t("c4.pull.button")}</Button>
            </div>
          </div>
        )}
        {mine.length ? (
          <section className="flex flex-col gap-2" aria-labelledby="c4-cands">
            <h3 id="c4-cands" className="text-[13px] font-semibold">{t("c4.cand.title")}</h3>
            <p className="text-[13px] text-text-secondary">{t("c4.cand.intro")}</p>
            {mine.map(c => (
              <div key={c.id} data-testid="c4-candidate" className="flex flex-col gap-1 rounded-sm border border-border p-2 text-[13px]">
                <span className="font-medium">{t("c4.cand.panel", { panel: label(c.panelId) })}{c.conflict ? ` · ${t("c4.cand.conflict")}` : ""}</span>
                {c.kind === "text" ? Object.entries(c.incoming).map(([k, v]) => <span key={k} dir="auto" className="text-text-secondary">{k}: {v}</span>) : <span className="text-text-secondary">{t("c4.cand.image")}</span>}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy} onClick={() => void choose(c, "keep_both")}>{t("c0.conflict.keep-both")}</Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void choose(c, "choose_current")}>{t("c0.conflict.current")}</Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void choose(c, "choose_incoming")} data-testid="c4-incoming">{t("c0.conflict.incoming")}</Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void choose(c, "reject")}>{t("c0.conflict.reject")}</Button>
                </div>
              </div>
            ))}
          </section>
        ) : null}
        {(comments.data ?? []).length ? (
          <section className="flex flex-col gap-1" aria-labelledby="c4-comments">
            <h3 id="c4-comments" className="text-[13px] font-semibold">{t("c4.comments.title")}</h3>
            {(comments.data ?? []).map(c => <p key={c.id} dir="auto" className="text-[13px] text-text-secondary">{c.direction === "in" ? t("c4.comments.in") : t("c4.comments.out")} · {c.panelId ? label(c.panelId) : "–"} · {c.author}: {c.text}</p>)}
          </section>
        ) : null}
        {msg ? <p role="status" className="text-[13px] text-text-secondary">{msg}</p> : null}
      </ResizableDialogContent>
    </Dialog>
  );
}
