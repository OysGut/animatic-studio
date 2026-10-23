import { Thumbnail } from "@/app/shared/Thumbnail";
import { useMemo, useRef, useState } from "react";
import { Copy, ImagePlus, Pencil, Trash2 } from "lucide-react";
import { layerFieldsOf, insertImageSegment, replaceImageSegment, removeImageSegment, moveImageSegment, trimImageSegment, variantsOf, versionsOf, type Command, type LayerFields, type ProjectState } from "@/core";
import { animationImageTracks } from "@/core/animation/tracks";
import { useImageUrls } from "@/app/library/asset-images";
import { AssetThumb } from "@/app/library/AssetThumb";
import { VariantStrip, type StripImage } from "@/app/asset-studio/VariantStrip";
import { Toolbar, ToolbarGroup, IconButton, ToolbarButton } from "@/app/shell/workspace-chrome";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { FaceMarkDialog } from "./FaceMarkDialog";
import { animationUseOf } from "@/core/animation/rig";
import { MouthShapeEditor } from "./MouthShapeEditor";
import { BlinkPanel } from "./BlinkPanel";
import { CharacterPanel } from "./CharacterPanel";
import { layerVersion } from "@/core/composition/render";
import { ScanFace, Power, Speech, UserRound, Package, Mountain } from "lucide-react";
import type { AnimWindow } from "./TimeNavigator";
import { t as tk } from "@/core/i18n/keyed";

type Selection = { layerId: string; index: number };
export function VariantTracks({ state, compositionId, occurrenceId, duration, view, frame, editable, run, runGroup, onJump, onSeek, onStudio }: {
  state: ProjectState; compositionId: string; occurrenceId: string; duration: number; view: AnimWindow; frame: number; editable: boolean;
  run: (c: Command, label: string) => string | null; onSeek: (f: number) => void; onStudio: (id: string) => void;
  runGroup?: (commands: readonly Command[], label: string) => Promise<string | null>; onJump?: (occurrenceId: string) => void;
}) {
  const tracks = animationImageTracks(state, compositionId, duration);
  const [mouthVersion, setMouthVersion] = useState<string | null>(null);
  const [faceVersion, setFaceVersion] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [picking, setPicking] = useState<Selection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ layerId: string; fields: LayerFields } | null>(null);
  const drag = useRef<{ layerId: string; revision: number; index: number; kind: "move" | "trim"; x: number; start: number; fields: LayerFields; width: number; next?: LayerFields } | null>(null);
  const paths = useMemo(() => tracks.flatMap(t => [...t.segments.flatMap(s => s.version ? [s.version.mediaPath] : []), ...(t.layer.assetId ? variantsOf(state, t.layer.assetId).flatMap(v => versionsOf(state, v.id).map(ver => ver.mediaPath)) : [])]), [state, compositionId]);
  const urls = useImageUrls(paths).data ?? {};
  const current = selected ? tracks.find(t => t.layer.id === selected.layerId) : undefined;
  const use = current ? animationUseOf(state, current.layer.id, occurrenceId) : undefined;
  const segment = current?.segments.find(s => s.index === selected?.index);
  const write = (layerId: string, fields: LayerFields, label: string) => {
    setError(run({ type: "UpdateLayers", layers: [{ layerId: layerId as never, fields }] }, label));
  };
  function pick(img: StripImage) {
    if (!picking) return;
    const layer = state.layers[picking.layerId]; if (!layer) return;
    const fields = layerFieldsOf(layer);
    write(layer.id, picking.index < 0 ? insertImageSegment(fields, frame, img) : replaceImageSegment(fields, picking.index, img), tk("app-scene-editor-animation-variant-tracks.pick.write.c735ca6346f3"));
    setPicking(null);
  }
  function finish() {
    const d = drag.current; drag.current = null; setDraft(null);
    if (d?.next && state.layers[d.layerId]?.revision !== d.revision) {
      setError(tk("app-scene-editor-animation-variant-tracks.finish.set-error.455b4d5c5a23"));
      return;
    }
    if (d?.next) write(d.layerId, d.next, d.kind === "move" ? tk("app-scene-editor-animation-variant-tracks.finish.write.9edd02579b31") : tk("app-scene-editor-animation-variant-tracks.finish.write.dc0e400457f1"));
  }
  const positions = (start: number, end: number) => ({ left: `${(start - view.from) / view.span * 100}%`, width: `${(end - start) / view.span * 100}%`, minWidth: end - start === 1 ? "2.5rem" : undefined, maxWidth: end - start === 1 ? "2.5rem" : undefined, height: "2.5rem", zIndex: end - start === 1 ? 2 : 1 });
  return <section data-testid="anim-variant-tracks">
    <Toolbar><ToolbarGroup>
      <IconButton data-testid="anim-segment-add" label={tk("app-scene-editor-animation-variant-tracks.variant-tracks.label.a64252751a3c")} disabled={!editable || !current || current.layer.locked} onClick={() => current && setPicking({ layerId: current.layer.id, index: -1 })}><ImagePlus /></IconButton>
      <IconButton data-testid="anim-segment-replace" label={tk("app-scene-editor-animation-variant-tracks.variant-tracks.label.611baae3be56")} disabled={!editable || !selected || current?.layer.locked} onClick={() => setPicking(selected)}><Pencil /></IconButton>
      <IconButton data-testid="anim-segment-copy" label={tk("app-scene-editor-animation-variant-tracks.variant-tracks.label.c33983afbdb1")} disabled={!editable || !segment?.image || current?.layer.locked} onClick={() => { if (current && segment?.image) write(current.layer.id, insertImageSegment(layerFieldsOf(current.layer), frame, segment.image), tk("app-scene-editor-animation-variant-tracks.variant-tracks.write.c33983afbdb1")); }}><Copy /></IconButton>
      <IconButton data-testid="anim-segment-remove" label={tk("app-scene-editor-animation-variant-tracks.variant-tracks.label.72929a088058")} disabled={!editable || !current || !segment || current.layer.locked || current.segments.length < 2} onClick={() => { if (!current || !segment) return; const f = removeImageSegment(layerFieldsOf(current.layer), segment.index); if (f) write(current.layer.id, f, tk("app-scene-editor-animation-variant-tracks.variant-tracks.write.72929a088058")); setSelected(null); }}><Trash2 /></IconButton>
      <IconButton data-testid="ca3-mark-face" label={tk("app-scene-editor-animation-variant-tracks.variant-tracks.label.7cba01db7111")} disabled={!editable || !segment?.version || current?.layer.locked || !urls[segment.version.mediaPath]} onClick={() => setFaceVersion(segment?.version?.id ?? null)}><ScanFace /></IconButton>
      <IconButton data-testid="ca4-open-mouth" label={tk("app-scene-editor-animation-variant-tracks.variant-tracks.label.43543ac141be")} disabled={!editable || !segment?.version || current?.layer.locked || !urls[segment.version.mediaPath]} onClick={() => setMouthVersion(segment?.version?.id ?? null)}><Speech /></IconButton>
      <IconButton data-testid="ca3-animation-enabled" aria-pressed={use?.enabled ?? false} label={tk("app-scene-editor-animation-variant-tracks.variant-tracks.label.bed02c257838")} active={use?.enabled ?? false} disabled={!editable || !use || current?.layer.locked} onClick={() => { if (use) setError(run({ type: "SetAnimationLayerEnabled", useId: use.id, enabled: !use.enabled }, tk("app-scene-editor-animation-variant-tracks.variant-tracks.run.7bd464febff0"))); }}><Power /></IconButton>
      {use ? <BlinkPanel state={state} use={use} frame={frame} editable={editable && !current?.layer.locked} run={run} /> : null}
      {use ? <CharacterPanel state={state} use={use} editable={editable && !current?.layer.locked} run={run}
        runGroup={runGroup ?? (async (cs, label) => { for (const c of cs) { const e = run(c, label); if (e) return e; } return null; })}
        onJump={onJump ?? (() => undefined)} /> : null}
      {current ? <ToolbarButton data-testid="anim-open-asset-studio" onClick={() => onStudio(current.layer.id)}>{tk("app-scene-editor-animation-variant-tracks.variant-tracks.toolbar-button.cfc9ca026c9e")}</ToolbarButton> : null}
    </ToolbarGroup></Toolbar>
    {current && segment ? <div className="flex flex-wrap items-center gap-2 border-b border-border p-2 text-xs text-text-secondary">
      <label>{tk("app-scene-editor-animation-variant-tracks.variant-tracks.label.724e230faf0c")}<Input data-testid="anim-segment-start" type="number" className="h-7 w-20" min={1} max={duration - 1} value={segment.start} disabled={!editable || segment.index === 0 || current.layer.locked} onChange={e => write(current.layer.id, moveImageSegment(layerFieldsOf(current.layer), segment.index, Number(e.target.value), duration), tk("app-scene-editor-animation-variant-tracks.variant-tracks.write.238e8b6481a2"))} /></label>
      <label>{tk("app-scene-editor-animation-variant-tracks.variant-tracks.label.ec70208184a7")}<Input data-testid="anim-segment-duration" type="number" className="h-7 w-20" min={1} value={segment.end - segment.start} disabled={!editable || current.layer.locked} onChange={e => {
        const fields = layerFieldsOf(current.layer);
        const end = Math.min(duration, Math.max(segment.start + 1, segment.start + Number(e.target.value)));
        write(current.layer.id, segment.end < duration ? trimImageSegment(fields, segment.index, end) : { ...fields, activeRange: { from: fields.activeRange?.from ?? 0, to: end - 1 } }, tk("app-scene-editor-animation-variant-tracks.variant-tracks.write.7f59322590b1"));
      }} /></label>
    </div> : null}
    {error ? <p role="alert" className="p-2 text-xs text-status-danger">{error}</p> : null}
    {tracks.length === 0 ? <p className="p-3 text-xs text-text-tertiary">{tk("app-scene-editor-animation-variant-tracks.variant-tracks.p.6abdfce588eb")}</p> : null}
    {tracks.map(track => {
      const layer = draft?.layerId === track.layer.id ? { ...track.layer, ...draft.fields } : track.layer;
      const segments = animationImageTracks({ ...state, layers: { ...state.layers, [layer.id]: layer } }, compositionId, duration).find(t => t.layer.id === layer.id)?.segments ?? [];
      const thumb = layerVersion(state, layer, frame) ?? track.segments.find(s => s.version)?.version;
      const assetKind = layer.assetId ? state.assets[layer.assetId]?.kind : undefined;
      const Fallback = assetKind === "character" || assetKind === "animal" ? UserRound : assetKind === "location" || assetKind === "environment" ? Mountain : Package;
      const active = layer.activeRange ?? { from: 0, to: duration - 1 };
      return <div key={layer.id} data-anim-track={layer.id} className="flex h-12 shrink-0 border-b border-border">
        <HoverCard openDelay={400}>
          <HoverCardTrigger asChild><ToolbarButton className="h-full w-40 shrink-0 justify-start gap-2 overflow-hidden border-r border-border px-2" onClick={() => setSelected({ layerId: layer.id, index: 0 })}>
            <span data-testid={thumb && urls[thumb.mediaPath] ? "anim-layer-thumbnail" : "anim-layer-fallback"} data-asset-kind={assetKind ?? "prop"} className="flex size-6 shrink-0 items-center justify-center">{layer.assetId ? <AssetThumb state={state} assetId={layer.assetId} url={thumb ? urls[thumb.mediaPath] : undefined} size="sm" /> : <Fallback className="size-5 text-text-tertiary" />}</span>
            <span className="truncate">{layer.name}</span>
          </ToolbarButton></HoverCardTrigger>
          {thumb && urls[thumb.mediaPath] ? <HoverCardContent className="w-60 p-0" side="right"><Thumbnail data-testid="anim-layer-hover" className="max-h-60 w-60" src={urls[thumb.mediaPath]} alt={layer.name} /></HoverCardContent> : null}
        </HoverCard>
        <div className="relative min-w-0 flex-1 bg-surface-0">
          {segments.filter(s => s.end > active.from && s.start <= active.to && s.end > view.from && s.start < view.from + view.span).map(s => {
            const start = Math.max(s.start, active.from), end = Math.min(s.end, active.to + 1);
            const name = `${s.variant?.name ?? layer.name}${s.version ? ` · v${s.version.number}` : ""}`;
            return <ToolbarButton key={s.index} data-testid="anim-segment" data-layer-id={layer.id} data-index={s.index} data-start={start} data-end={end} data-version-id={s.version?.id} data-asset-id={s.image?.assetId}
              aria-label={name} title={name} active={selected?.layerId === layer.id && selected.index === s.index}
              className="group absolute top-1 h-10 overflow-visible border border-border-control bg-surface-3 px-0"
              style={positions(start, end)} onClick={() => { setSelected({ layerId: layer.id, index: s.index }); onSeek(start); }}
              onPointerDown={e => {
                if (!editable || layer.locked || s.index === 0) return;
                const width = e.currentTarget.parentElement?.clientWidth; if (!width) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = { layerId: layer.id, revision: layer.revision, index: s.index, kind: "move", x: e.clientX, start: s.start, fields: layerFieldsOf(layer), width };
              }}
              onPointerMove={e => { const d = drag.current; if (!d) return; const delta = Math.round((e.clientX - d.x) / d.width * view.span); if (!delta) return;
                d.next = d.kind === "move" ? moveImageSegment(d.fields, d.index, d.start + delta, duration) : trimImageSegment(d.fields, d.index, d.start + delta);
                setDraft({ layerId: d.layerId, fields: d.next });
              }} onPointerUp={finish} onPointerCancel={() => { drag.current = null; setDraft(null); }}
              onKeyDown={e => { if (e.key === "Escape") { drag.current = null; setDraft(null); } }}>
              {s.version && urls[s.version.mediaPath] ? <Thumbnail src={urls[s.version.mediaPath]} alt="" className="h-full w-10 shrink-0" /> : null}
              {end - start > 1 ? <span className="truncate px-1 text-xs">{name}</span> : null}
              {s.version && urls[s.version.mediaPath] ? <Thumbnail data-testid="anim-segment-hover" src={urls[s.version.mediaPath]} alt={name} className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 hidden h-32 w-32 border border-border bg-surface-1 group-hover:block group-focus-visible:block" /> : null}
              {editable && !layer.locked && s.end < duration ? <span data-testid="anim-segment-trim" role="separator" aria-label={tk("app-scene-editor-animation-variant-tracks.variant-tracks.aria-label.202d9160b65b")} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-border-control"
                onPointerDown={e => { e.stopPropagation(); const width = e.currentTarget.parentElement?.parentElement?.clientWidth; if (!width) return; e.currentTarget.parentElement?.setPointerCapture(e.pointerId); drag.current = { layerId: layer.id, revision: layer.revision, index: s.index, kind: "trim", x: e.clientX, start: s.end, fields: layerFieldsOf(layer), width }; }} /> : null}
            </ToolbarButton>;
          })}
        </div>
      </div>;
    })}
    {mouthVersion && current && state.assetVersions[mouthVersion] ? <MouthShapeEditor state={state} layerId={current.layer.id} occurrenceId={occurrenceId} versionId={mouthVersion} sourceUrl={urls[state.assetVersions[mouthVersion].mediaPath] ?? ""} run={run} onClose={() => setMouthVersion(null)} /> : null}
    {faceVersion && current && state.assetVersions[faceVersion] ? <FaceMarkDialog state={state} layerId={current.layer.id} occurrenceId={occurrenceId} versionId={faceVersion} url={urls[state.assetVersions[faceVersion].mediaPath] ?? ""} run={run} onClose={() => setFaceVersion(null)} /> : null}
    <Dialog open={!!picking} onOpenChange={open => { if (!open) setPicking(null); }}>
      {picking ? <DialogContent uiId="V-114" data-testid="anim-variant-picker"><DialogHeader><DialogTitle>{tk("app-scene-editor-animation-variant-tracks.variant-tracks.dialog-title.c0a1248d9562")}</DialogTitle><DialogDescription>{tk("app-scene-editor-animation-variant-tracks.variant-tracks.dialog-description.2b027d029fae")}</DialogDescription></DialogHeader>
        <VariantStrip state={state} assetId={state.layers[picking.layerId]?.assetId ?? null} urls={urls} editable={editable} replacing={picking.index >= 0} onPick={pick} />
      </DialogContent> : null}
    </Dialog>
  </section>;
}
