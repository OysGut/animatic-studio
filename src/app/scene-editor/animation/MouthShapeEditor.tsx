/** CA4 authoring stays local until one revision-checked scene draft is explicitly saved. */
import { useRef, useState } from "react";
import { Download, Upload, Smartphone, Plus, Trash2 } from "lucide-react";
import { newId, parseUploadContext, type Command, type ProjectState } from "@/core";
import { animationUseOf, rigOfVariant, rigSpecError, type RigSpec } from "@/core/animation/rig";
import { emptyRigPart, PART_SLOTS, VISEMES, visemeExample, type RigPart, DEFAULT_ADJUSTMENTS } from "@/core/animation/parts";
import { useFilmLanguage } from "@/app/assembly/use-film-language";
import { animationDialogueTracks } from "@/core/animation/tracks";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Toolbar, ToolbarGroup, ToolbarButton, IconButton, PanelHeader } from "@/app/shell/workspace-chrome";
import { useImageUrls, uploadAssetImage, mediaFromStoredFile } from "@/app/library/asset-images";
import { MobileImportDialog } from "@/app/mobile/MobileImportDialog";
import type { MobileImportRow } from "@/adapters/browser/mobile-import";
import { MaskBrush } from "./MaskBrush";
import { AdjustPanel } from "./AdjustPanel";
import { RigPartPreview } from "./RigPartPreview";
import { drawingSheet, splitDrawingSheet } from "@/engine/export/mouth-sheet";
import { t as tk } from "@/core/i18n/keyed";
export function MouthShapeEditor({ state, layerId, occurrenceId, versionId, sourceUrl, run, onClose }: {
  state: ProjectState; layerId: string; occurrenceId: string; versionId: string; sourceUrl: string;
  run: (c: Command, label: string) => string | null; onClose: () => void;
}) {
  const source = state.assetVersions[versionId], variant = source ? state.assetVariants[source.variantId] : undefined;
  const rig = source ? rigOfVariant(state, source.variantId) : undefined, use = animationUseOf(state, layerId, occurrenceId);
  const saved = use ? state.animationRigVersions[use.rigVersionId] : rig?.currentVersionId ? state.animationRigVersions[rig.currentVersionId] : undefined;
  const initial = useRef({ rigRevision: rig?.revision, useRevision: use?.revision, sourceRevision: source?.revision });
  const [spec, setSpec] = useState<RigSpec>(saved?.spec ?? { format: 1, anchors: {} });
  const [slot, setSlot] = useState("mouth:A"), [details, setDetails] = useState(true), [mobile, setMobile] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Command[]>([]), [localUrls, setLocalUrls] = useState<Record<string, string>>({}), [accepted, setAccepted] = useState<string[]>([]);
  const partInput = useRef<HTMLInputElement>(null), sheetInput = useRef<HTMLInputElement>(null);
  const part = spec.parts?.[slot] ?? emptyRigPart();
  const paths = Object.values(spec.parts ?? {}).flatMap(p => { const image = p.versionId ? state.assetVersions[p.versionId] : undefined; return image ? [image.mediaPath] : []; });
  const [filmLanguage] = useFilmLanguage(state.project.id);
  const dialogue = animationDialogueTracks(state, occurrenceId, filmLanguage.dialogue);
  const [clipId, setClipId] = useState(dialogue[0]?.clip.id ?? "");
  const clip = dialogue.find(t => t.clip.id === clipId);
  const audioPaths = clip?.version ? [clip.version.mediaPath] : [];
  const urls = useImageUrls([...paths, ...audioPaths]).data ?? {};
  const partUrl = part.versionId ? localUrls[part.versionId] ?? urls[state.assetVersions[part.versionId]?.mediaPath ?? ""] : undefined;
  const change = (p: RigPart) => setSpec(s => ({ ...s, parts: { ...s.parts, [slot]: p } }));
  async function stage(files: { slot: string; file?: File; row?: MobileImportRow; flattened?: boolean }[]) {
    if (!source || !variant || busy) return;
    setBusy(true); setError(null);
    try {
      const next = { ...spec.parts }, commands: Command[] = [], preview: Record<string, string> = {}, imports: string[] = [];
      for (const item of files) {
        if (item.row) {
          const c = parseUploadContext(item.row.context);
          if (item.row.status !== "done" || item.row.dismissed || c?.type !== "rig" || c.target.assetId !== variant.assetId || c.target.variantId !== source.variantId || c.target.sourceVersionId !== source.id || c.target.slot !== item.slot) throw new Error(tk("app-scene-editor-animation-mouth-shape-editor.stage.message.399d9594d244"));
        }
        const up = item.file ? await uploadAssetImage(state.project.id, variant.assetId, item.file) : item.row ? { versionId: newId(), media: await mediaFromStoredFile(item.row.path), note: "" } : null;
        if (!up) continue;
        const partVariant = newId();
        commands.push({ type: "CreateAssetVariant", variantId: partVariant as never, assetId: variant.assetId, fields: { name: `${variant.name} · ${item.slot}`, style: "illustrated", appearance: "" } }, { type: "AddAssetVersion", versionId: up.versionId as never, variantId: partVariant as never, media: up.media, note: tk("app-scene-editor-animation-mouth-shape-editor.note.note.e21724d62391") });
        const { mobileImportId: _previousImport, ...previous } = next[item.slot] ?? emptyRigPart();
        next[item.slot] = { ...previous, versionId: up.versionId, drawing: [], ...(item.flattened ? { mask: [], adjustments: { ...DEFAULT_ADJUSTMENTS } } : {}), ...(item.row ? { mobileImportId: item.row.id } : {}) };
        const signed = await mediaUrl(up.media.path); if (signed) preview[up.versionId] = signed;
        if (item.row) imports.push(item.row.id);
      }
      const candidate = { ...spec, parts: next }; const problem = rigSpecError(candidate); if (problem) throw new Error(problem);
      setSpec(candidate); setUploads(u => [...u, ...commands]); setLocalUrls(u => ({ ...u, ...preview })); setAccepted(a => [...a, ...imports]);
    } catch (e) { setError(e instanceof Error ? e.message : tk("app-scene-editor-animation-mouth-shape-editor.stage.set-error.09320feecfea")); } finally { setBusy(false); }
  }
  async function mediaUrl(path: string) { const { createSignedUrls, ASSET_BUCKET } = await import("@/adapters/browser/storage-files"); return (await createSignedUrls(ASSET_BUCKET, [path], 3600))[0]?.signedUrl; }
  async function downloadSheet() {
    setBusy(true); setError(null);
    try {
      const mediaPaths = Object.fromEntries(Object.values(state.assetVersions).map(v => [v.id, v.mediaPath]));
      for (const c of uploads) if (c.type === "AddAssetVersion") mediaPaths[c.versionId] = c.media.path;
      const allUrls = { ...urls }; for (const [id, url] of Object.entries(localUrls)) if (mediaPaths[id]) allUrls[mediaPaths[id]] = url;
      const blob = await drawingSheet(spec, allUrls, mediaPaths); const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = `rig-${rig?.id ?? source?.id}-v${saved?.number ?? 1}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError(tk("app-scene-editor-animation-mouth-shape-editor.download-sheet.set-error.3b5d14c6ddda")); } finally { setBusy(false); }
  }
  function save() {
    if (!source || !variant || busy) return;
    const problem = rigSpecError(spec); if (problem) { setError(problem); return; }
    if (rig?.revision !== initial.current.rigRevision || use?.revision !== initial.current.useRevision || source.revision !== initial.current.sourceRevision) { setError(tk("app-scene-editor-animation-mouth-shape-editor.save.set-error.5aa79a1009d0")); return; }
    const layer = state.layers[layerId]; if (!layer) return;
    const rigId = rig?.id ?? newId(), rigVersionId = newId();
    const steps: Command[] = [...uploads];
    if (!rig) steps.push({ type: "CreateRig", rigId, variantId: source.variantId });
    steps.push({ type: "SaveRigVersion", rigId, versionId: rigVersionId, sourceVersionId: source.id, spec }, { type: "AttachAnimationUse", useId: use?.id ?? newId(), layerId, occurrenceId, rigVersionId });
    const failure = run({ type: "UpdateSceneDraft", compositionId: layer.compositionId, occurrenceId: occurrenceId as never, steps }, tk("app-scene-editor-animation-mouth-shape-editor.failure.run.1fae1952c163"));
    if (failure) setError(failure); else onClose();
  }
  const anchorKey = slot.startsWith("mouth:") ? "mouth" : slot.startsWith("eye:left") ? "leftEye" : slot.startsWith("eye:right") ? "rightEye" : slot === "nose" ? "nose" : "head";
  const anchor = spec.anchors[anchorKey] ?? { x: .5, y: .5 };
  return <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}><DialogContent data-testid="ca4-mouth-dialog" className="flex max-h-[90dvh] max-w-6xl flex-col overflow-y-auto">
    <DialogHeader><DialogTitle>{tk("app-scene-editor-animation-mouth-shape-editor.mouth-shape-editor.dialog-title.c4829cf8e935")}</DialogTitle><DialogDescription>{variant?.name ?? ""} · v{saved?.number ?? 1}</DialogDescription></DialogHeader>
    <Toolbar><ToolbarGroup><IconButton data-testid="ca4-sheet-export" label={tk("app-scene-editor-animation-mouth-shape-editor.mouth-shape-editor.label.a3aaf78fd1bf")} disabled={busy} onClick={() => void downloadSheet()}><Download /></IconButton><IconButton data-testid="ca4-sheet-import" label={tk("app-scene-editor-animation-mouth-shape-editor.mouth-shape-editor.label.d5a8fec2d4f4")} disabled={busy} onClick={() => sheetInput.current?.click()}><Upload /></IconButton><IconButton data-testid="ca4-part-import" label={tk("app-scene-editor-animation-mouth-shape-editor.mouth-shape-editor.label.6abee1fae2f3")} disabled={busy} onClick={() => partInput.current?.click()}><Plus /></IconButton><IconButton data-testid="ca4-mobile" label={tk("app-scene-editor-animation-mouth-shape-editor.mouth-shape-editor.label.0a96683d22df")} disabled={busy} onClick={() => setMobile(true)}><Smartphone /></IconButton><IconButton label={tk("app-scene-editor-animation-mouth-shape-editor.mouth-shape-editor.label.24268b20878c")} disabled={busy} onClick={() => setSpec(s => { const parts = { ...s.parts }; delete parts[slot]; return { ...s, parts }; })}><Trash2 /></IconButton></ToolbarGroup></Toolbar>
    <input ref={partInput} data-testid="ca4-part-file" type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void stage([{ slot, file }]); }} />
    <input ref={sheetInput} data-testid="ca4-sheet-file" type="file" accept="image/png" className="hidden" onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void splitDrawingSheet(file).then(files => stage(files.map(item => ({ ...item, flattened: true })))).catch(() => setError(tk("app-scene-editor-animation-mouth-shape-editor.mouth-shape-editor.set-error.ebbf5fd0a693"))); }} />
    <div className="flex flex-wrap gap-1" role="group" aria-label={tk("app-scene-editor-animation-mouth-shape-editor.mouth-shape-editor.aria-label.c24cbd07a8bb")}>{VISEMES.map(v => <ToolbarButton key={v} data-testid={`ca4-viseme-${v}`} active={slot === `mouth:${v}`} aria-pressed={slot === `mouth:${v}`} onClick={() => setSlot(`mouth:${v}`)}>{v} · {visemeExample(v)}</ToolbarButton>)}<select data-testid="ca4-part-slot" aria-label={tk("app-scene-editor-animation-mouth-shape-editor.mouth-shape-editor.aria-label.59460df7896b")} value={slot} onChange={e => setSlot(e.target.value)} className="h-7 border border-border-control bg-surface-3 text-xs text-text-primary">{PART_SLOTS.map(s => <option key={s} value={s}>{s.startsWith("mouth:") ? tk("app-scene-editor-animation-mouth-shape-editor.mouth-shape-editor.option.0fdfeeb97556", { value1: String(s.slice(6)) }) : s.startsWith("eye:left") ? s.endsWith("closed") ? tk("app-scene-editor-animation-mouth-shape-editor.left-eye-closed") : tk("app-scene-editor-animation-mouth-shape-editor.left-eye-open") : s.startsWith("eye:right") ? s.endsWith("closed") ? tk("app-scene-editor-animation-mouth-shape-editor.right-eye-closed") : tk("app-scene-editor-animation-mouth-shape-editor.right-eye-open") : s === "nose" ? tk("app-scene-editor-animation-mouth-shape-editor.mouth-shape-editor.option.206a1c4aa0ca") : tk("app-scene-editor-animation-mouth-shape-editor.mouth-shape-editor.option.c99c6655380f")}</option>)}</select></div>
    <div className="grid min-h-0 gap-3 md:grid-cols-2"><div><PanelHeader title={tk("app-scene-editor-animation-mouth-shape-editor.mouth-shape-editor.title.59460df7896b")} />{details ? <MaskBrush part={part} url={partUrl} onChange={change} /> : <ToolbarButton data-testid="ca4-edit-details" onClick={() => setDetails(true)}>{tk("app-scene-editor-animation-mouth-shape-editor.mouth-shape-editor.toolbar-button.86e969323a18")}</ToolbarButton>}{details ? <ToolbarButton data-testid="ca4-details-ok" onClick={() => setDetails(false)}>{tk("app-scene-editor-animation-mouth-shape-editor.mouth-shape-editor.toolbar-button.8a049176c731")}</ToolbarButton> : null}</div><div><PanelHeader title={tk("app-scene-editor-animation-mouth-shape-editor.mouth-shape-editor.title.04f575709789")} /><RigPartPreview sourceUrl={sourceUrl} partUrl={partUrl} part={part} anchor={anchor} /><select data-testid="ca4-preview-line" aria-label={tk("app-scene-editor-animation-mouth-shape-editor.mouth-shape-editor.aria-label.cdf07e33ff38")} value={clipId} onChange={e => setClipId(e.target.value)} className="h-7 w-full border border-border-control bg-surface-3 text-xs text-text-primary"><option value="">{tk("app-scene-editor-animation-mouth-shape-editor.mouth-shape-editor.option.151411776ecc")}</option>{dialogue.map(t => <option key={t.clip.id} value={t.clip.id}>{t.block?.text ?? t.clip.name}</option>)}</select>{clip?.version && urls[clip.version.mediaPath] ? <audio data-testid="ca4-preview-audio" controls src={urls[clip.version.mediaPath]} className="w-full" /> : null}</div></div>
    <AdjustPanel part={part} onChange={change} />
    <output data-testid="ca4-rig-size" className="text-xs text-text-tertiary">{Math.ceil(new TextEncoder().encode(JSON.stringify(spec)).length / 1024)} / 512 kB</output>
    {error ? <p role="alert" className="text-xs text-status-danger">{error}</p> : null}
    <div className="flex justify-end gap-2"><ToolbarButton disabled={busy} onClick={onClose}>{tk("app-scene-editor-animation-mouth-shape-editor.mouth-shape-editor.toolbar-button.4d5cc3781b8f")}</ToolbarButton><ToolbarButton data-testid="ca4-save" variant="primary" disabled={busy} onClick={save}>{busy ? tk("app-scene-editor-animation-mouth-shape-editor.mouth-shape-editor.toolbar-button.2d9cce94946f") : tk("app-scene-editor-animation-mouth-shape-editor.mouth-shape-editor.toolbar-button.c77696111ed5")}</ToolbarButton></div>
    {source && variant ? <MobileImportDialog open={mobile} onOpenChange={setMobile} projectId={state.project.id} label={tk("app-scene-editor-animation-mouth-shape-editor.mouth-shape-editor.label.a977ade1446a", { value1: String(state.assets[variant.assetId]?.name ?? variant.name), slot: String(slot) })} context={{ type: "rig", purpose: slot.startsWith("mouth:") ? "mouth_shape" : "rig_part", target: { assetId: variant.assetId, variantId: source.variantId, sourceVersionId: source.id, slot } }} actions={row => <ToolbarButton data-testid="ca4-approve-mobile" disabled={busy || accepted.includes(row.id) || !!row.asset_version_id || !!row.dismissed} onClick={() => void stage([{ slot, row }])}>{row.asset_version_id ? tk("app-scene-editor-animation-mouth-shape-editor.mouth-shape-editor.toolbar-button.dc33f796dd81") : accepted.includes(row.id) ? tk("app-scene-editor-animation-mouth-shape-editor.mouth-shape-editor.toolbar-button.b3db13118824") : tk("app-scene-editor-animation-mouth-shape-editor.mouth-shape-editor.toolbar-button.b16aacdf3b7e")}</ToolbarButton>} /> : null}
  </DialogContent></Dialog>;
}
