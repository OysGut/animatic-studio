/** Manual marking never changes the original image. Save is one ordinary scene-draft transaction. */
import { ResizableDialogContent } from "@/app/shared/ResizableDialogContent";
import { useRef, useState } from "react";
import { Crosshair, Hand, RotateCcw } from "lucide-react";
import { newId, type Command, type ProjectState } from "@/core";
import { FACE_ANCHORS, animationUseOf, rigOfVariant, type FaceAnchor, type RigAnchors } from "@/core/animation/rig";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Toolbar, ToolbarGroup, ToolbarButton, IconButton } from "@/app/shell/workspace-chrome";
import { t } from "@/core/i18n/keyed";
const labels = () => ({ head: t("app-scene-editor-animation-face-mark-dialog.head.head.4a98496b03f8"), mouth: t("app-scene-editor-animation-face-mark-dialog.mouth.mouth.88650f55ba66"), nose: t("app-scene-editor-animation-face-mark-dialog.nose.nose.8f99e0834531"), leftEye: t("app-scene-editor-animation-face-mark-dialog.left-eye.left-eye.e262db91bc1b"), rightEye: t("app-scene-editor-animation-face-mark-dialog.right-eye.right-eye.1c5ff0080e26") });
export function FaceMarkDialog({ state, layerId, occurrenceId, versionId, url, run, onClose }: {
  state: ProjectState; layerId: string; occurrenceId: string; versionId: string; url: string;
  run: (command: Command, label: string) => string | null; onClose: () => void;
}) {
  const source = state.assetVersions[versionId];
  const rig = source ? rigOfVariant(state, source.variantId) : undefined;
  const use = animationUseOf(state, layerId, occurrenceId);
  const saved = use ? state.animationRigVersions[use.rigVersionId] : rig?.currentVersionId ? state.animationRigVersions[rig.currentVersionId] : undefined;
  const initial = useRef({ rigRevision: rig?.revision, useRevision: use?.revision });
  const [anchors, setAnchors] = useState<RigAnchors>(saved?.spec.anchors ?? {});
  const [anchor, setAnchor] = useState<FaceAnchor>("head");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const image = useRef<HTMLImageElement>(null);
  const drag = useRef<{ x: number; y: number; pan: typeof pan } | null>(null);
  const save = () => {
    if (!source) return;
    if (rig?.revision !== initial.current.rigRevision || use?.revision !== initial.current.useRevision) { setError(t("app-scene-editor-animation-face-mark-dialog.save.set-error.b6500c2ae58d")); return; }
    const rigId = rig?.id ?? newId(), rigVersionId = newId();
    const layer = state.layers[layerId]; if (!layer) return;
    const steps: Command[] = [];
    if (!rig) steps.push({ type: "CreateRig", rigId, variantId: source.variantId });
    steps.push({ type: "SetRigAnchors", rigId, versionId: rigVersionId, sourceVersionId: source.id, anchors });
    steps.push({ type: "AttachAnimationUse", useId: use?.id ?? newId(), layerId, occurrenceId, rigVersionId });
    const failure = run({ type: "UpdateSceneDraft", compositionId: layer.compositionId, occurrenceId: occurrenceId as never, steps }, t("app-scene-editor-animation-face-mark-dialog.failure.run.6187a03941e1"));
    if (failure) setError(failure); else onClose();
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><ResizableDialogContent sizeKey="face-mark" data-testid="ca3-face-dialog" className="flex h-[min(85vh,48rem)] max-w-4xl flex-col">
    <DialogHeader><DialogTitle>{t("app-scene-editor-animation-face-mark-dialog.face-mark-dialog.dialog-title.f057f080a791")}</DialogTitle><DialogDescription>{source ? state.assetVariants[source.variantId]?.name : ""}</DialogDescription></DialogHeader>
    <Toolbar><ToolbarGroup>{FACE_ANCHORS.map(key => <ToolbarButton key={key} data-testid={`ca3-anchor-${key}`} active={anchor === key && !panning} onClick={() => { setAnchor(key); setPanning(false); }}>{labels()[key]}</ToolbarButton>)}</ToolbarGroup><ToolbarGroup>
      <IconButton label={t("app-scene-editor-animation-face-mark-dialog.face-mark-dialog.label.81c12cab89b8")} active={panning} onClick={() => setPanning(v => !v)}><Hand /></IconButton>
      <select data-testid="ca3-face-zoom" aria-label={t("app-scene-editor-animation-face-mark-dialog.face-mark-dialog.aria-label.b39c120b2400")} className="h-7 border border-border-control bg-surface-3 text-xs text-text-primary" value={zoom} onChange={e => setZoom(Number(e.target.value))}>{[1, 2, 4].map(z => <option key={z} value={z}>{z === 1 ? t("app-scene-editor-animation-face-mark-dialog.face-mark-dialog.option.b327a1f16be1") : `${z * 100}%`}</option>)}</select>
      <IconButton label={t("app-scene-editor-animation-face-mark-dialog.face-mark-dialog.label.ba2dc3e8fc16")} onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><RotateCcw /></IconButton>
    </ToolbarGroup></Toolbar>
    <div data-testid="ca3-face-stage" className="relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden bg-media" tabIndex={0} aria-label={t("app-scene-editor-animation-face-mark-dialog.face-mark-dialog.aria-label.5a6b85d5c4eb")}
      onPointerDown={e => {
        if (panning || e.button === 1) { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, pan }; return; }
        const rect = image.current?.getBoundingClientRect(); if (!rect?.width || !rect.height) return;
        const x = (e.clientX - rect.left) / rect.width, y = (e.clientY - rect.top) / rect.height;
        if (x >= 0 && x <= 1 && y >= 0 && y <= 1) setAnchors(a => ({ ...a, [anchor]: { x, y } }));
      }}
      onPointerMove={e => { const d = drag.current; if (d) setPan({ x: d.pan.x + e.clientX - d.x, y: d.pan.y + e.clientY - d.y }); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <div className="relative h-full max-w-full" style={{ aspectRatio: `${source?.width || 1} / ${source?.height || 1}`, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
        <img ref={image} data-testid="ca3-face-image" src={url} alt={source ? state.assetVariants[source.variantId]?.name ?? "" : ""} className="h-full w-full object-fill" draggable={false} />
        {FACE_ANCHORS.map(key => { const point = anchors[key]; return point ? <span key={key} data-testid={`ca3-point-${key}`} data-x={point.x} data-y={point.y} className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 text-accent-brand" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}><Crosshair className="size-5" /><span className="bg-surface-1 px-1 text-xs text-text-primary">{labels()[key]}</span></span> : null; })}
      </div>
    </div>
    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">{FACE_ANCHORS.map(key => <label key={key} className="text-text-secondary">{labels()[key]}<span className="flex gap-1">{(["x", "y"] as const).map(axis => <input key={axis} data-testid={`ca3-coordinate-${key}-${axis}`} aria-label={`${labels()[key]} ${axis}`} className="min-w-0 w-full border border-border-control bg-surface-3 px-1 text-text-primary" type="number" min={0} max={1} step={0.01} value={anchors[key]?.[axis] ?? ""} onChange={e => { const value = Number(e.target.value); if (Number.isFinite(value) && value >= 0 && value <= 1) setAnchors(a => ({ ...a, [key]: { x: a[key]?.x ?? 0.5, y: a[key]?.y ?? 0.5, [axis]: value } })); }} />)}</span></label>)}</div>
    {error ? <p role="alert" className="text-xs text-status-danger">{error}</p> : null}
    <div className="flex justify-end gap-2"><ToolbarButton onClick={onClose}>{t("app-scene-editor-animation-face-mark-dialog.face-mark-dialog.toolbar-button.16e8dc6a1b7f")}</ToolbarButton><ToolbarButton data-testid="ca3-face-save" variant="primary" disabled={!source || !FACE_ANCHORS.every(key => anchors[key])} onClick={save}>{t("app-scene-editor-animation-face-mark-dialog.face-mark-dialog.toolbar-button.3209a49e7862")}</ToolbarButton></div>
  </ResizableDialogContent></Dialog>;
}
