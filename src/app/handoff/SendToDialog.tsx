/**
 * C-1 «Send to …» / «Export for …»: one dialog for assets, storyboard panels, audio clips and scenes.
 * It says honestly what the receiver gets, builds the file with the hand-off marker and Manifest v1,
 * downloads a ZIP and shows the return QR/link (short-lived token, stored only as hash on the server).
 */
import { useContext, useState } from "react";
import { QueryClientContext, useQueryClient } from "@tanstack/react-query";
import { useSchemaAtLeast } from "@/app/shell/use-schema";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ProjectState } from "@/core";
import { sourceLanguageOf } from "@/core/dialogue/languages";
import { sha256Hex } from "@/core/connectors";
import { FORMAT_FACTS, FORMATS_FOR, adapterFor, formatsForAsset, handoffFileName, handoffManifest, handoffZip, type HandoffFormat, type HandoffTarget } from "@/core/handoff";
import { createHandoff } from "@/adapters/handoff/handoff.functions";
import { downloadBlob } from "@/app/audio/composition-actions";
import { QrCode } from "@/app/mobile/QrCode";
import { t } from "@/core/i18n/keyed";
import { assetImageLayer, buildClipWav, buildImageFile, buildSceneOtio, panelLayers } from "./build-file";
import { handoffsKey } from "./use-handoffs";

export type SendTarget =
  | { kind: "asset"; assetId: string }
  | { kind: "panel"; panelId: string }
  | { kind: "clip"; clipId: string }
  | { kind: "scene"; occurrenceId: string };

interface Resolved { kind: HandoffTarget; id: string; name: string; revision: number; assetId: string | null; variantId: string | null; sceneId: string | null; baseVersionId: string | null; formats: readonly HandoffFormat[] }

export function resolveTarget(s: ProjectState, target: SendTarget): Resolved | null {
  if (target.kind === "asset") {
    const a = s.assets[target.assetId as never]; if (!a || a.removed) return null;
    const variant = Object.values(s.assetVariants).find((v) => v.assetId === a.id && !v.archived && v.approvedVersionId) ?? Object.values(s.assetVariants).find((v) => v.assetId === a.id && !v.archived);
    if (!variant) return null;
    return { kind: "asset", id: a.id, name: a.name, revision: a.revision, assetId: a.id, variantId: variant.id, sceneId: null, baseVersionId: variant.approvedVersionId, formats: formatsForAsset(a.kind) };
  }
  if (target.kind === "panel") {
    const p = s.compositions[target.panelId as never]; if (!p || p.removed) return null;
    const occ = p.occurrenceId ? s.occurrences[p.occurrenceId] : undefined;
    return { kind: "panel", id: p.id, name: p.name || t("c1.panel"), revision: p.revision, assetId: null, variantId: null, sceneId: occ ? occ.sceneId : null, baseVersionId: null, formats: FORMATS_FOR.panel };
  }
  if (target.kind === "clip") {
    const c = s.audioClips[target.clipId as never]; if (!c || c.removed) return null;
    const occ = s.occurrences[c.occurrenceId];
    const variant = c.assetVariantId ? s.assetVariants[c.assetVariantId] : Object.values(s.assetVariants).find((v) => v.assetId === c.assetId && !v.archived);
    return { kind: "clip", id: c.id, name: c.name, revision: c.revision, assetId: c.assetId, variantId: variant?.id ?? null, sceneId: occ ? occ.sceneId : null, baseVersionId: c.versionId ?? variant?.approvedVersionId ?? null, formats: FORMATS_FOR.clip };
  }
  const o = s.occurrences[target.occurrenceId as never]; if (!o) return null;
  return { kind: "scene", id: o.id, name: t("c1.scene"), revision: o.revision, assetId: null, variantId: null, sceneId: o.sceneId, baseVersionId: null, formats: FORMATS_FOR.scene };
}

export function formatLabel(f: HandoffFormat): string {
  if (f === "sbpro") return adapterFor(f).name; // produktnavn, oversettes ikke
  return { psd: t("c1.format.psd"), png: t("c1.format.png"), svg: t("c1.format.svg"), wav: t("c1.format.wav"), otio: t("c1.format.otio") }[f];
}

export function factLines(format: HandoffFormat): string[] {
  const f = FORMAT_FACTS[format];
  return [
    f.editableLayers ? t("c1.fact.layers") : f.flatImage ? t("c1.fact.flat") : null,
    f.audio ? t("c1.fact.audio") : null,
    f.timeline ? t("c1.fact.timeline") : null,
    f.editableLayers || f.flatImage ? t("c1.fact.text-raster") : null,
    f.returnable ? t("c1.fact.returnable") : t("c1.fact.not-returnable"),
  ].filter((x): x is string => !!x);
}

export function SendToDialog({ open, onOpenChange, state, target }: { open: boolean; onOpenChange: (v: boolean) => void; state: ProjectState; target: SendTarget }) {
  const r = resolveTarget(state, target);
  const [format, setFormat] = useState<HandoffFormat | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ url: string; expiresAt: string } | null>(null);
  const create = useServerFn(createHandoff);
  const qc = useQueryClient();
  const fmt = format ?? r?.formats[0] ?? null;

  async function send() {
    if (!r || !fmt) return;
    setBusy(true); setError(null);
    try {
      const fileName = handoffFileName(r.name, fmt);
      const h = await create({ data: { projectId: state.project.id, targetKind: r.kind, targetId: r.id, assetId: r.assetId, variantId: r.variantId, sceneId: r.sceneId, baseVersionId: r.baseVersionId, baseRevision: r.revision, format: fmt, fileName } });
      let data: Uint8Array;
      if (r.kind === "panel") data = await buildImageFile(fmt, h.id, await panelLayers(state, state.compositions[r.id as never]!));
      else if (r.kind === "asset" && fmt !== "wav") {
        const v = r.baseVersionId ? state.assetVersions[r.baseVersionId as never] : undefined;
        if (!v) throw new Error(t("c1.no-image"));
        data = await buildImageFile(fmt, h.id, await assetImageLayer(v.mediaPath, r.name));
      } else if (r.kind === "clip") data = await buildClipWav(state, state.audioClips[r.id as never]!, h.id);
      else if (r.kind === "scene") { const o = state.occurrences[r.id as never]!; data = buildSceneOtio(state, o.productionId, o.id, o.sceneId, sourceLanguageOf(state), h.id); }
      else throw new Error(t("c1.build-failed"));
      const url = `${window.location.origin}${h.returnPath}`;
      const manifest = handoffManifest(state, { kind: r.kind, id: r.id, name: r.name, revision: r.revision, baseVersionId: r.baseVersionId, sceneId: r.sceneId }, fmt, h.id, new Date().toISOString(), { path: fileName, sha256: sha256Hex(data), byteSize: data.length });
      const zip = handoffZip({ file: { name: fileName, data }, manifest, readme: `${t("c1.readme", { app: adapterFor(fmt).name })}\n\n${url}\n` });
      downloadBlob(new Blob([zip as BlobPart], { type: "application/zip" }), fileName.replace(/\.[^.]+$/, "") + "-ptg.zip");
      setDone({ url, expiresAt: h.expiresAt });
      await qc.invalidateQueries({ queryKey: handoffsKey(state.project.id) });
    } catch (e) { setError((e as Error).message || t("c1.build-failed")); } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setDone(null); setError(null); } onOpenChange(v); }}>
      <DialogContent uiId="V-180" className="max-h-[88vh] max-w-[560px] overflow-y-auto border-border bg-surface-2" data-testid="send-to-dialog">
        <DialogTitle>{t("c1.send.title", { name: r?.name ?? "" })}</DialogTitle>
        <DialogDescription>{t("c1.send.intro")}</DialogDescription>
        {!r ? <p className="text-sm text-destructive">{t("c1.build-failed")}</p> : done ? (
          <div className="space-y-3" data-testid="send-to-done">
            <p className="text-sm">{t("c1.send.done")}</p>
            <div className="flex justify-center"><QrCode value={done.url} size={200} /></div>
            <p className="break-all text-xs"><a className="text-accent-brand underline" href={done.url}>{done.url}</a></p>
            <p className="text-xs text-muted-foreground">{t("c1.send.expires", { date: new Date(done.expiresAt).toLocaleString() })}</p>
            <p className="text-xs text-muted-foreground">{t("c1.send.ipad")}</p>
            <Button size="sm" variant="outline" onClick={() => void navigator.clipboard?.writeText(done.url)}>{t("c1.send.copy")}</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t("c1.send.format")}</legend>
              {r.formats.map((f) => (
                <label key={f} className="flex items-start gap-2 rounded border border-border p-2 text-sm">
                  <input type="radio" name="handoff-format" value={f} checked={fmt === f} onChange={() => setFormat(f)} data-testid={`format-${f}`} />
                  <span>
                    <span className="font-medium">{formatLabel(f)}</span> · {t("c1.send.for", { app: adapterFor(f).name })}
                    <ul className="mt-1 list-disc ps-4 text-xs text-muted-foreground" data-testid={`facts-${f}`}>{factLines(f).map((l) => <li key={l}>{l}</li>)}</ul>
                  </span>
                </label>
              ))}
            </fieldset>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            <Button onClick={() => void send()} disabled={busy || !fmt} data-testid="send-to-go">{busy ? t("c1.send.busy") : t("c1.send.go")}</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Shown only when the database has the C-1 tables (0110) and inside the app's query client. */
export function SendToButton(props: { state: ProjectState; target: SendTarget; disabled?: boolean }) {
  return useContext(QueryClientContext) ? <SendToGate {...props} /> : null;
}
function SendToGate(props: { state: ProjectState; target: SendTarget; disabled?: boolean }) {
  return useSchemaAtLeast(110) ? <SendToLive {...props} /> : null;
}
function SendToLive({ state, target, disabled }: { state: ProjectState; target: SendTarget; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => setOpen(true)} data-testid="send-to-open">{t("c1.send.button")}</Button>
      {open ? <SendToDialog open={open} onOpenChange={setOpen} state={state} target={target} /> : null}
    </>
  );
}
