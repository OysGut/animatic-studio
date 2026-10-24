/**
 * C-5 «Storyboard Pro» i storyboardet: last ned en importpakke (manifest v1 + panelbilder + midlertidig
 * panellyd) for skriptpakken, og se kandidater fra returer. Ingenting tas i bruk automatisk:
 * «Bruk innkommende» kjører vanlige, angrebare kommandoer i én angregruppe.
 */
import { useContext, useState } from "react";
import { QueryClientContext, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ResizableDialogContent } from "@/app/shared/ResizableDialogContent";
import { Button } from "@/components/ui/button";
import { newId, type Command, type ProjectState } from "@/core";
import { applySbproText, buildSbproPackage, conformCommands, productionPanels, sha256Hex, type ConformPlan, type ConflictChoice, type SbproPackageFile } from "@/core/connectors";
import { storedZip } from "@/core/handoff/bytes";
import { keyBetween } from "@/core/order-key";
import { panelDetails } from "@/core/storyboard/editing";
import { storyboardPanelsOf } from "@/core/storyboard";
import { createSignedUrls } from "@/adapters/browser/storage-files";
import { resolveSbproCandidate, sbproCandidatesFor, type SbproCandidateView } from "@/adapters/connectors/sbpro.functions";
import { useSchemaAtLeast } from "@/app/shell/use-schema";
import type { Commands } from "@/app/project/use-commands";
import { t } from "@/core/i18n/keyed";
import { panelPngBase64 } from "./BoordsSend";

type Props = { state: ProjectState; projectId: string; productionId: string; cmds: Commands; editable: boolean };
export function SbproButton(props: Props) {
  return useContext(QueryClientContext) ? <SbproInner {...props} /> : null;
}
function SbproInner(props: Props) {
  const ready = useSchemaAtLeast(113);
  const [open, setOpen] = useState(false);
  if (!ready || !props.editable) return null;
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} data-testid="c5-open">{t("c5.open")}</Button>
      {open ? <SbproDialog {...props} open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}

const fromB64 = (b: string) => Uint8Array.from(atob(b), c => c.charCodeAt(0));
const ext = (mime: string) => (mime.includes("wav") ? "wav" : mime.includes("mpeg") ? "mp3" : mime.includes("ogg") ? "ogg" : "bin");

function SbproDialog({ open, onOpenChange, state, projectId, productionId, cmds }: Props & { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const listFn = useServerFn(sbproCandidatesFor), resolve = useServerFn(resolveSbproCandidate);
  const cands = useQuery({ queryKey: ["sbpro-candidates", projectId], queryFn: () => listFn({ data: { projectId } }) });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const panels = productionPanels(state, productionId);

  async function download() {
    setBusy(true); setMsg(null);
    try {
      const files: { path: string; data: Uint8Array }[] = [];
      const images = new Map<string, SbproPackageFile>(), sounds = new Map<string, SbproPackageFile>();
      let n = 0;
      for (const { panel } of panels) {
        setProgress(t("c5.progress", { done: String(++n), total: String(panels.length) }));
        const b = await panelPngBase64(state, panel.id).catch(() => null);
        if (b) { const data = fromB64(b), path = `panels/${panel.id}.png`; files.push({ path, data }); images.set(panel.id, { path, sha256: sha256Hex(data), byteSize: data.length, mimeType: "image/png" }); }
        const ta = panelDetails(panel).tempAudio;
        const v = ta ? state.assetVersions[ta.versionId as never] : undefined;
        if (ta && v && !sounds.has(ta.versionId)) {
          const [u] = await createSignedUrls("assets", [v.mediaPath], 600);
          const r = u?.signedUrl ? await fetch(u.signedUrl) : null;
          if (r?.ok) { const data = new Uint8Array(await r.arrayBuffer()), path = `sound/${ta.versionId}.${ext(v.mimeType)}`; files.push({ path, data }); sounds.set(ta.versionId, { path, sha256: sha256Hex(data), byteSize: data.length, mimeType: v.mimeType }); }
        }
      }
      const manifest = buildSbproPackage(state, { productionId, nowIso: new Date().toISOString(), images, sounds });
      files.unshift({ path: "manifest.json", data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) });
      const blob = new Blob([storedZip(files) as BlobPart], { type: "application/zip" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `ptg-sbpro-${projectId.slice(0, 8)}.zip`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      setMsg(t("c5.download.done", { count: String(panels.length) }));
    } catch { setMsg(t("c5.error")); } finally { setBusy(false); setProgress(null); }
  }

  function commandsFor(c: SbproCandidateView): Command[] | null {
    const inc = c.incoming;
    if (c.kind === "text" && c.panelId) {
      const p = state.compositions[c.panelId as never]; if (!p) return null;
      const d = panelDetails(p);
      return [{ type: "SetStoryboardDetails", panelId: p.id, details: { ...d, fields: applySbproText(d.fields, inc) } } as Command];
    }
    if (c.kind === "timing" && c.panelId && Number.isInteger(inc["durationFrames"])) return [{ type: "UpdateStoryboardPanel", panelId: c.panelId, durationFrames: inc["durationFrames"] as number } as Command];
    if (c.kind === "image" && c.mediaPath) {
      const assetId = newId<"asset">(), variantId = newId<"asset_variant">();
      return [
        { type: "CreateAssets", assets: [{ assetId, fields: { kind: "other", name: t("c5.image-name"), names: [], description: "", category: "", tags: [] } }] } as Command,
        { type: "CreateAssetVariant", assetId, variantId, fields: { name: t("c5.image-name"), style: "other", appearance: "" } } as Command,
        { type: "AddAssetVersion", versionId: newId() as never, variantId, media: { path: c.mediaPath, mimeType: "image/png", byteSize: c.mediaBytes ?? 1, sha256: c.mediaSha256 ?? "", width: null, height: null }, note: JSON.stringify({ kind: "sbpro-panel", panelId: c.panelId }) } as Command,
      ];
    }
    if (c.kind === "new_panel") {
      const occ = typeof inc["occurrenceId"] === "string" ? state.occurrences[inc["occurrenceId"] as never] : undefined;
      if (!occ) return null;
      const list = storyboardPanelsOf(state, occ.id), panelId = newId();
      const caps = (inc["captions"] ?? {}) as Record<string, unknown>;
      const out: Command[] = [{ type: "AddStoryboardPanel", panelId, occurrenceId: occ.id, variantId: occ.variantId, orderKey: keyBetween(list.at(-1)?.orderKey ?? null, null) } as Command];
      if (Number.isInteger(inc["durationFrames"])) out.push({ type: "UpdateStoryboardPanel", panelId, durationFrames: inc["durationFrames"] as number } as Command);
      out.push({ type: "SetStoryboardFields", panelId, fields: applySbproText({}, caps) } as unknown as Command);
      return out;
    }
    if (c.kind === "conform") return conformCommands(state, inc as unknown as ConformPlan);
    return null;
  }

  async function choose(c: SbproCandidateView, choice: ConflictChoice) {
    setBusy(true); setMsg(null);
    try {
      if (choice === "choose_incoming") {
        const commands = commandsFor(c);
        if (!commands) { setMsg(t("c5.stale")); return; }
        const group = newId();
        for (const command of commands) { const r = await cmds.runAndWait(command, t("c5.incoming"), group); if (r.error) throw Error(r.error); }
      }
      await resolve({ data: { id: c.id, choice, revision: c.revision } });
      setMsg(t("c0.conflict.done"));
      await qc.invalidateQueries({ queryKey: ["sbpro-candidates", projectId] });
    } catch { setMsg(t("c5.error")); } finally { setBusy(false); }
  }
  const label = (c: SbproCandidateView) => {
    const p = c.panelId ? state.compositions[c.panelId as never] : undefined;
    const name = p ? panelDetails(p).number || p.name || t("c1.panel") : t("c1.panel");
    return `${t(`c5.kind.${c.kind}`)} · ${c.kind === "conform" ? t("c5.all-panels") : name}`;
  };
  const list = cands.data ?? [];

  return (
    <Dialog open={open} onOpenChange={v => { if (!busy) onOpenChange(v); }}>
      <ResizableDialogContent uiId="V-184" sizeKey="sbpro" className="max-h-[90dvh] overflow-y-auto" data-testid="c5-dialog">
        <DialogTitle>{t("c5.title")}</DialogTitle>
        <DialogDescription>{t("c5.intro")}</DialogDescription>
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-text-secondary">{t("c5.download.info", { count: String(panels.length) })}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={busy || !panels.length} onClick={() => void download()} data-testid="c5-download">{t("c5.download")}</Button>
            {progress ? <span className="text-[12px] text-text-secondary" aria-live="polite">{progress}</span> : null}
          </div>
          <p className="text-[12px] text-text-secondary">{t("c5.login-info")}</p>
          <h3 className="text-[14px] font-medium">{t("c5.candidates")}</h3>
          {list.length === 0 ? <p className="text-[13px] text-text-secondary">{t("c5.none")}</p> : (
            <ul className="flex flex-col gap-2" data-testid="c5-candidates">
              {list.map(c => {
                const suggestion = c.kind === "conform" && !(c.incoming as { lossless?: boolean }).lossless;
                return (
                  <li key={c.id} className="rounded-sm border border-border p-2 text-[13px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{label(c)}</span>
                      {c.conflict ? <span className="rounded-sm bg-surface-2 px-1 text-[11px]">{t("c5.conflict")}</span> : null}
                    </div>
                    {c.kind === "text" ? <p dir="auto" className="mt-1 whitespace-pre-wrap text-text-secondary">{Object.entries(c.incoming).map(([k, v]) => `${k}: ${String(v)}`).join("\n")}</p> : null}
                    {c.kind === "timing" ? <p className="mt-1 text-text-secondary">{t("c5.timing", { from: String(c.incoming["current"] ?? ""), to: String(c.incoming["durationFrames"] ?? "") })}</p> : null}
                    {suggestion ? <p className="mt-1 text-text-secondary">{t("c5.suggestion", { reasons: ((c.incoming["reasons"] as string[]) ?? []).map(r => t(`c5.reason.${r}`)).join(", ") })}</p> : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {!suggestion ? <Button size="sm" disabled={busy} onClick={() => void choose(c, "choose_incoming")}>{t("c5.use-incoming")}</Button> : null}
                      {!suggestion ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void choose(c, "keep_both")}>{t("c5.keep-both")}</Button> : null}
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void choose(c, "choose_current")}>{t("c5.keep-current")}</Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void choose(c, "reject")}>{t("c5.reject")}</Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {msg ? <p className="text-[13px]" role="status">{msg}</p> : null}
        </div>
      </ResizableDialogContent>
    </Dialog>
  );
}
