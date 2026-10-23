import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Copy, Eye, EyeOff, Lock, Unlock, Plus, Undo2, Redo2, MousePointer2, MoveUpRight, Minus, Type, Square, StickyNote, Scan, HelpCircle, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Stage } from "@/app/scene-editor/Stage";
import { UiId } from "@/app/shared/UiId";
import { Thumbnail } from "@/app/shared/Thumbnail";
import { useImageUrls } from "@/app/library/asset-images";
import { useUiPref } from "@/app/account/ui-prefs";
import type { Commands } from "@/app/project/use-commands";
import { t } from "@/core/i18n/keyed";
import { newId, keyBetween, layersOf, layerFieldsOf, layerVersion, versionImagePath, attachableVersions, defaultLayerFields, textLayerFields, panelDetails, panelFields, planPanelNumbers, numberCommands, planDuplicatePanel, panelKeyAfter, storyboardPanelsOf, productionStatusOf, SHOT_TYPES, SHOT_ANGLES, planArrowPath, compositionOfVariant, type Composition, type CompositionLayer, type ProjectState, type LayerFields, type Command, type PanelDetails } from "@/core";

const ctl = "w-full min-w-0 rounded-sm border border-border-control bg-surface-1 px-2 py-1 text-[13px] text-text-primary";
type Tool = "select" | "arrow" | "line" | "shape" | "text" | "note" | "camera";
const tools = [{ id: "select", icon: MousePointer2, key: "v" }, { id: "arrow", icon: MoveUpRight, key: "a" }, { id: "line", icon: Minus, key: "l" }, { id: "shape", icon: Square, key: "s" }, { id: "text", icon: Type, key: "t" }, { id: "note", icon: StickyNote, key: "n" }, { id: "camera", icon: Scan, key: "c" }] as const;
interface Guides { notes: boolean; thirds: boolean; safe: boolean; mask: string }
const defaultGuides: Guides = { notes: true, thirds: false, safe: false, mask: "project" };
const guideValid = (v: unknown): v is Guides => !!v && typeof v === "object" && typeof (v as Guides).notes === "boolean" && typeof (v as Guides).thirds === "boolean" && typeof (v as Guides).safe === "boolean" && ["project", "2.39", "1.85", "16:9", "9:16", "1:1"].includes((v as Guides).mask);

export function PanelEditor({ state, panel, editable, cmds, projectId }: { state: ProjectState; panel: Composition; editable: boolean; cmds: Commands; projectId: string }) {
  const navigate = useNavigate();
  const [selected, select] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [error, setError] = useState<string | null>(null);
  const [help, showHelp] = useState(false);
  const [renumber, showRenumber] = useState(false);
  const [snapshotId, showSnapshot] = useState("");
  const [pathTarget, setPathTarget] = useState("");
  const [confirmPath, showPath] = useState(false);
  const [search, setSearch] = useState("");
  const [comment, setComment] = useState("");
  const [fieldName, setFieldName] = useState("");
  const [guides, setGuides] = useUiPref("storyboard-editor-guides", defaultGuides, guideValid);
  const occurrence = panel.occurrenceId ? state.occurrences[panel.occurrenceId] : undefined;
  const productionId = occurrence?.productionId ?? "";
  const status = productionStatusOf(state, "storyboard", { compositionId: panel.id });
  const snapshots = Object.values(state.panelSnapshots ?? {}).filter(s => s.panelId === panel.id && !s.removed).sort((a,b) => b.panelRevision - a.panelRevision);
  const snapshot = snapshots.find(s => s.id === snapshotId);
  const viewPanel = snapshot ? { ...snapshot.snapshot.composition, removed: false } : panel;
  const viewState = snapshot ? { ...state, compositions: { ...state.compositions, [panel.id]: viewPanel }, layers: Object.fromEntries(snapshot.snapshot.layers.map(l => [l.id,{...l,removed:false}])) } : state;
  const allowed = editable && status?.status !== "done" && !snapshot;
  const layers = layersOf(viewState, panel.id);
  const layer = selected ? layers.find(l => l.id === selected) : undefined;
  const details = panelDetails(viewPanel);
  const fields = panelFields(state);
  const allPanels = Object.values(state.occurrences).filter(o => o.productionId === productionId && o.active).sort((a,b) => a.orderKey.localeCompare(b.orderKey)).flatMap(o => storyboardPanelsOf(state,o.id));
  const panelIndex = allPanels.findIndex(p => p.id === panel.id);
  const numbers = planPanelNumbers(state, productionId, true);
  const scene = compositionOfVariant(state, panel.variantId);
  const pathLayers = scene ? layersOf(state,scene.id).filter(l => !l.locked && l.kind !== "group") : [];
  const library = useMemo(() => attachableVersions(state).filter(v => `${v.assetName} ${v.variantName}`.toLowerCase().includes(search.toLowerCase())).slice(0,80), [state,search]);
  const paths = [...new Set([...library.flatMap(v => { const version = state.assetVersions[v.versionId]; return version ? [versionImagePath(version,"thumbnail")] : []; }), ...layers.flatMap(l => { const v = layerVersion(viewState,l); return v ? [versionImagePath(v,"playback")] : []; })])];
  const urls = useImageUrls(paths).data ?? {};
  const drawingState = guides.notes ? viewState : { ...viewState, layers: Object.fromEntries(Object.entries(viewState.layers).map(([id,l]) => [id,l.kind === "note" ? { ...l, visible:false } : l])) };
  const run = (c: Command, label = t("sb3.edit"), group?: string) => { if (!allowed) return t("sb3.readonly"); const e = cmds.run(c,label,group); setError(e); return e; };
  const group = (commands: readonly Command[], allowApproved = false) => {
    if ((!allowed && !allowApproved) || !editable || snapshot) return;
    const id = newId(); for (const c of commands) { const e = cmds.run(c,t("sb3.edit"),id); if (e) { setError(e); return; } }
  };
  const saveDetails = (patch: Partial<PanelDetails>) => run({ type:"SetStoryboardDetails",panelId:panel.id,details:{...panelDetails(panel),...patch} });
  const updateLayer = (l: CompositionLayer, patch: Partial<LayerFields>) => run({type:"UpdateLayers",layers:[{layerId:l.id,fields:{...layerFieldsOf(l),...patch}}]});
  const openPanel = (p: Composition | undefined) => { if (!p?.occurrenceId) return; select(null); showSnapshot(""); void navigate({to:"/prosjekt/$projectId/scene",params:{projectId},search:{scene:p.occurrenceId,panel:p.id}}); };
  const addPanel = () => { if (!occurrence) return; const id = newId<"composition">(); group([{type:"AddStoryboardPanel",panelId:id,occurrenceId:occurrence.id,variantId:occurrence.variantId,orderKey:panelKeyAfter(state,occurrence.id,panel.id)}]); void navigate({to:"/prosjekt/$projectId/scene",params:{projectId},search:{scene:occurrence.id,panel:id}}); };
  const duplicate = () => { const plan = planDuplicatePanel(state,panel.id); group(plan); const first = plan[0]; if (first?.type === "AddStoryboardPanel" && occurrence) void navigate({to:"/prosjekt/$projectId/scene",params:{projectId},search:{scene:occurrence.id,panel:first.panelId}}); };
  const colors = () => {
    const css = getComputedStyle(document.documentElement);
    const hex = (name: string, fallback: string) => { const canvas = document.createElement("canvas"); const ctx = canvas.getContext("2d"); if (!ctx) return fallback; ctx.fillStyle = css.getPropertyValue(name).trim() || fallback; return typeof ctx.fillStyle === "string" && /^#[a-f0-9]{6}$/i.test(ctx.fillStyle) ? ctx.fillStyle : fallback; };
    return { ink:hex("--text-primary",panel.background), paper:hex("--surface-2",panel.background), accent:hex("--accent-brand",panel.background) };
  };
  const addTool = (kind: Tool) => {
    setTool(kind); if (kind === "select" || !allowed) return;
    const c = colors(), id = newId<"composition_layer">();
    let f = defaultLayerFields(state,panel,{fill:c.paper,name:panelLabel(`sb3.tool.${kind}`)});
    f = {...f,width:Math.round(panel.width*.35),height:Math.round(panel.height*.25),fill:c.ink};
    if (kind === "text") f = {...textLayerFields(panel,t("sb3.text"),t("sb3.tool.text")),text:{...textLayerFields(panel,t("sb3.text"),t("sb3.tool.text")).text,color:c.ink} as NonNullable<LayerFields["text"]>};
    if (kind === "shape") f = {...f,kind:"other",fill:c.accent,shape:{type:"rect",radius:0,stroke:null}};
    if (kind === "note") f = {...f,kind:"note",fill:null,note:{text:t("sb3.note"),color:c.paper,noteType:"visual",handled:false,anchor:null}};
    if (kind === "arrow" || kind === "line") f = {...f,kind:"arrow",fill:null,arrow:{points:[{x:-panel.width*.14,y:0,smooth:false},{x:panel.width*.14,y:0,smooth:false}],form:"straight",thickness:6,color:c.accent,category:"character",layerId:null},...(kind === "line" ? {shape:{type:"line",radius:0,stroke:null}} : {})};
    if (kind === "camera") f = {...f,kind:"camera_mark",width:Math.round(panel.width*.6),height:Math.round(panel.height*.6),fill:null,cameraMark:{frame:{x:-panel.width*.3,y:-panel.height*.3,width:panel.width*.6,height:panel.height*.6},zoom:1,pan:{x:0,y:0},tilt:0}};
    if (!run({type:"AddLayers",layers:[{layerId:id,compositionId:panel.id,orderKey:keyBetween(layers.at(-1)?.orderKey ?? null,null),fields:f}]})) select(id);
  };
  const addResource = (versionId: string) => {
    const v = state.assetVersions[versionId], va = v ? state.assetVariants[v.variantId] : undefined;
    if (!v || !va || !allowed) return;
    const id = newId<"composition_layer">(); const f = {...defaultLayerFields(state,panel,{assetId:va.assetId,assetVariantId:va.id}),versionId:v.id,width:v.width ?? 512,height:v.height ?? 512};
    if (!run({type:"AddLayers",layers:[{layerId:id,compositionId:panel.id,orderKey:keyBetween(layers.at(-1)?.orderKey ?? null,null),fields:f}]})) select(id);
  };
  const editApproved = () => { if (!status) return; group([{type:"SnapshotStoryboardPanel",panelId:panel.id,snapshotId:newId()},{type:"SetProductionStatus",statusId:status.id,eventId:newId(),area:"storyboard",compositionId:panel.id,status:"in_progress"}],true); };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input,textarea,select,[contenteditable=true]")) return;
      if (e.key === "?") { e.preventDefault(); showHelp(true); return; }
      if (e.key === "PageDown" || e.key === "PageUp") { e.preventDefault(); openPanel(allPanels[panelIndex+(e.key === "PageDown" ? 1 : -1)]); return; }
      if (!allowed) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") { e.preventDefault(); duplicate(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); addPanel(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const found = tools.find(item => item.key === e.key.toLowerCase()); if (found) { e.preventDefault(); addTool(found.id); }
    };
    window.addEventListener("keydown",key); return () => window.removeEventListener("keydown",key);
  });
  return <section className="relative flex min-h-0 flex-1 flex-col bg-surface-0 text-text-primary" data-testid="sb3-editor" data-panel-id={panel.id}>
    <header className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2">
      <Link to="/prosjekt/$projectId/storyboard" params={{projectId}} search={{panel:panel.id}} className="me-3 flex items-center gap-1 text-[13px] underline"><ArrowLeft className="size-4"/>{t("sb2.mark-back")}</Link>
      <strong className="me-2 text-[13px]">{details.sceneNumber}.{details.number || panelIndex+1} · {panel.name}</strong>
      <Button size="icon" variant="ghost" title={t("sb3.previous")} aria-label={t("sb3.previous")} disabled={panelIndex <= 0} onClick={()=>openPanel(allPanels[panelIndex-1])}><ArrowLeft/></Button>
      <Button size="icon" variant="ghost" title={t("sb3.next")} aria-label={t("sb3.next")} disabled={panelIndex >= allPanels.length-1} onClick={()=>openPanel(allPanels[panelIndex+1])}><ArrowRight/></Button>
      <Button size="icon" variant="ghost" title={t("sb3.new")} aria-label={t("sb3.new")} disabled={!allowed} onClick={addPanel}><Plus/></Button>
      <Button size="icon" variant="ghost" title={t("sb2.duplicate")} aria-label={t("sb2.duplicate")} disabled={!allowed} onClick={duplicate}><Copy/></Button>
      <Button size="icon" variant="ghost" aria-label={t("sb3.undo")} disabled={!cmds.canUndo} onClick={()=>cmds.undo()}><Undo2/></Button>
      <Button size="icon" variant="ghost" aria-label={t("sb3.redo")} disabled={!cmds.canRedo} onClick={()=>cmds.redo()}><Redo2/></Button>
      {status?.status === "done" && !snapshot ? <Button size="sm" disabled={!editable} onClick={editApproved} data-testid="sb3-edit-approved">{t("sb3.edit-approved")}</Button> : null}
      <select className={ctl+" ms-auto max-w-48"} value={snapshotId} onChange={e=>{showSnapshot(e.target.value);select(null);}} aria-label={t("sb3.revisions")} data-testid="sb3-revisions"><option value="">{t("sb3.current")}</option>{snapshots.map(s=><option key={s.id} value={s.id}>{t("sb3.revision",{number:String(s.panelRevision)})}</option>)}</select>
      <Button size="icon" variant="ghost" aria-label={t("sb3.help")} onClick={()=>showHelp(true)}><HelpCircle/></Button>
    </header>
    {error ? <p role="alert" className="px-3 text-[13px] text-status-danger">{error}</p> : null}
    <div className="flex min-h-0 flex-1 flex-wrap lg:flex-nowrap">
      <aside className="w-44 shrink-0 overflow-auto border-e border-border p-2" aria-label={t("sb3.library")}>
        <input type="search" className={ctl} placeholder={t("attach.picker.search")} aria-label={t("attach.picker.search")} value={search} onChange={e=>setSearch(e.target.value)}/>
        <div className="mt-2 grid grid-cols-2 gap-1">{library.map(v=>{const version = state.assetVersions[v.versionId];const path = version ? versionImagePath(version,"thumbnail") : "";return <Button key={v.versionId} variant="ghost" className="h-auto min-w-0 flex-col p-1" disabled={!allowed} draggable={allowed} onDragStart={e=>{e.dataTransfer.setData("application/x-asset-studio-version",JSON.stringify({assetId:v.assetId,assetVariantId:version?.variantId,versionId:v.versionId}));e.dataTransfer.effectAllowed="copy";}} onClick={()=>addResource(v.versionId)} title={`${v.assetName} v${v.number}`} data-testid="sb3-resource"><span className="block aspect-[4/3] w-full">{urls[path] ? <Thumbnail src={urls[path]} alt=""/> : <Square className="size-6"/>}</span><span className="w-full truncate text-[11px]" dir="auto">{v.assetName}</span></Button>;})}</div>
      </aside>
      <div className="flex min-h-[440px] min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap gap-1 border-b border-border p-1" role="toolbar" aria-label={t("sb3.tools")}>
          {tools.map(item=><Button key={item.id} size="icon" variant={tool===item.id ? "secondary" : "ghost"} aria-label={panelLabel(`sb3.tool.${item.id}`)} title={panelLabel(`sb3.tool.${item.id}`)} aria-pressed={tool===item.id} disabled={item.id!=="select" && !allowed} onClick={()=>addTool(item.id)} data-testid={`sb3-tool-${item.id}`}><item.icon/></Button>)}
          <Button size="icon" variant="ghost" aria-label={t("sb3.notes-visible")} aria-pressed={guides.notes} onClick={()=>setGuides({...guides,notes:!guides.notes})}>{guides.notes ? <StickyNote/> : <EyeOff/>}</Button>
          <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={guides.safe} onChange={e=>setGuides({...guides,safe:e.target.checked})}/>{t("sb3.safe")}</label>
          <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={guides.thirds} onChange={e=>setGuides({...guides,thirds:e.target.checked})}/>{t("sb3.thirds")}</label>
          <select className={ctl+" max-w-32"} value={guides.mask} onChange={e=>setGuides({...guides,mask:e.target.value})} aria-label={t("sb3.mask")}>{["project","2.39","1.85","16:9","9:16","1:1"].map(v=><option key={v} value={v}>{v==="project" ? t("sb3.project-format") : v}</option>)}</select>
        </div>
        <div className="relative flex min-h-0 flex-1" data-testid="sb3-stage" onDragOver={e=>{if(allowed && e.dataTransfer.types.includes("application/x-asset-studio-version"))e.preventDefault();}} onDrop={e=>{const raw=e.dataTransfer.getData("application/x-asset-studio-version");if(!raw)return;e.preventDefault();e.stopPropagation();try{const parsed=JSON.parse(raw);if(typeof parsed.versionId==="string")addResource(parsed.versionId);}catch{setError(t("sb1.error.invalid-panel"));}}}>
          <Stage state={drawingState} composition={viewPanel} editable={allowed} selectedLayerId={selected} onSelect={select} run={run} imageUrls={urls} selectedShotId={null} onSelectShot={()=>undefined} frame={0} playing={false} view="scene" onViewChange={()=>undefined} autoKey={false}/>
          <PanelGuides width={panel.width} height={panel.height} guides={guides}/>
        </div>
        <div className="max-h-40 overflow-auto border-t border-border p-2" aria-label={t("sb3.layers")}>{[...layers].reverse().map((l,i)=><div key={l.id} className="flex items-center gap-1 text-[13px]" data-testid="sb3-layer"><Button size="sm" variant={l.id===selected ? "secondary" : "ghost"} className="min-w-0 flex-1 justify-start truncate" onClick={()=>select(l.id)}>{l.name}</Button><Button size="icon" variant="ghost" aria-label={t("sb3.visibility")} disabled={!allowed} onClick={()=>updateLayer(l,{visible:!l.visible})}>{l.visible?<Eye/>:<EyeOff/>}</Button><Button size="icon" variant="ghost" aria-label={t("sb3.lock")} disabled={!allowed} onClick={()=>updateLayer(l,{locked:!l.locked})}>{l.locked?<Lock/>:<Unlock/>}</Button><Button size="icon" variant="ghost" aria-label={t("sb3.up")} disabled={!allowed||i===0} onClick={()=>{const index=layers.findIndex(x=>x.id===l.id);run({type:"MoveLayer",layerId:l.id,beforeLayerId:layers[index+2]?.id??null});}}><ArrowUp/></Button><Button size="icon" variant="ghost" aria-label={t("sb3.down")} disabled={!allowed||i===layers.length-1} onClick={()=>{const index=layers.findIndex(x=>x.id===l.id);run({type:"MoveLayer",layerId:l.id,beforeLayerId:layers[index-1]?.id??null});}}><ArrowDown/></Button><Button size="icon" variant="ghost" aria-label={t("sb3.remove")} disabled={!allowed||l.locked} onClick={()=>run({type:"SetLayersRemoved",layerIds:[l.id],removed:true})}><Trash2/></Button></div>)}</div>
      </div>
      <aside className="w-full shrink-0 space-y-3 overflow-auto border-s border-border p-3 lg:w-72" aria-label={t("sb3.properties")}>
        {layer ? <LayerProperties layer={layer} layers={layers} disabled={!allowed||layer.locked} update={patch=>updateLayer(layer,patch)}/> : null}
        {layer?.arrow ? <div className="space-y-1"><select className={ctl} value={pathTarget} onChange={e=>setPathTarget(e.target.value)} aria-label={t("sb3.path-target")}><option value="">{t("sb3.path-target")}</option>{pathLayers.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select><Button size="sm" disabled={!allowed||!pathTarget} onClick={()=>showPath(true)} data-testid="sb3-use-path">{t("sb3.use-path")}</Button></div> : null}
        <fieldset disabled={!allowed} className="space-y-2"><legend className="text-[13px] font-semibold">{t("sb3.panel")}</legend>
          <TextField label={t("sb3.title")} value={panel.name} onSave={name=>run({type:"UpdateStoryboardPanel",panelId:panel.id,name})}/>
          <div className="flex gap-1"><Button size="sm" onClick={()=>group(numberCommands(state,planPanelNumbers(state,productionId,false)))} data-testid="sb3-lock-numbers">{t("sb3.lock-numbers")}</Button><Button size="sm" variant="outline" onClick={()=>showRenumber(true)}>{t("sb3.renumber")}</Button></div>
          <select className={ctl} value={details.shot??""} aria-label={t("sb3.shot")} onChange={e=>saveDetails({shot:(e.target.value||null) as PanelDetails["shot"]})}><option value="">{t("sb3.shot")}</option>{SHOT_TYPES.map(s=><option key={s}>{s}</option>)}</select>
          <select className={ctl} value={details.angle??""} aria-label={t("sb3.angle")} onChange={e=>saveDetails({angle:(e.target.value||null) as PanelDetails["angle"]})}><option value="">{t("sb3.angle")}</option>{SHOT_ANGLES.map(a=><option key={a} value={a}>{panelLabel(`sb3.angle.${a}`)}</option>)}</select>
          <NumberField label={t("sb3.focal")} value={details.focalMm??0} min={0} max={2000} save={focalMm=>saveDetails({focalMm:focalMm||null})}/>
          <TextField label={t("sb3.movement")} value={details.movement} onSave={movement=>saveDetails({movement})}/>
          {fields.map(f=><TextField key={f.id} label={f.name||panelLabel(`sb3.field.${f.id}`)} value={details.fields[f.id]??""} onSave={value=>saveDetails({fields:{...details.fields,[f.id]:value}})}/>)}
          <fieldset className="max-h-32 overflow-auto"><legend className="text-[11px]">{t("sb3.dialogue-links")}</legend>{Object.values(state.blocks).filter(b=>b.variantId===panel.variantId&&!b.removed&&b.kind==="dialogue").map(b=><label key={b.id} className="flex gap-1 text-[11px]"><input type="checkbox" checked={details.dialogueIds.includes(b.id)} onChange={e=>saveDetails({dialogueIds:e.target.checked?[...details.dialogueIds,b.id]:details.dialogueIds.filter(id=>id!==b.id)})}/><span dir="auto">{b.text}</span></label>)}</fieldset>
          <label className="block text-[11px]">{t("sb3.custom-field")}<input className={ctl} value={fieldName} onChange={e=>setFieldName(e.target.value)}/></label><Button size="sm" disabled={!fieldName.trim()} onClick={()=>{const id=`field_${newId().replaceAll("-","")}`;if(!run({type:"SetStoryboardFields",fields:[...fields,{id,name:fieldName.trim(),kind:"text"}]}))setFieldName("");}}>{t("sb3.add-field")}</Button>
        </fieldset>
        <section className="space-y-1"><h3 className="text-[13px] font-semibold">{t("sb3.comments")}</h3>{Object.values(state.annotations).filter(a=>a.panelId===panel.id&&!a.removed).map(a=><div key={a.id} className="border-b border-border py-1 text-[11px]"><span dir="auto">{a.text}</span><span className="block text-text-tertiary">{a.authorName}</span><Button size="sm" variant="ghost" disabled={!allowed} onClick={()=>run({type:"SetAnnotationResolved",annotationId:a.id,resolved:!a.resolved})}><Check/>{a.resolved?t("sb3.reopen"):t("sb3.resolve")}</Button></div>)}<textarea className={ctl} aria-label={t("sb3.comment")} value={comment} onChange={e=>setComment(e.target.value)} disabled={!allowed}/><Button size="sm" disabled={!allowed||!comment.trim()} onClick={()=>{if(!run({type:"AddAnnotations",annotations:[{annotationId:newId<"annotation">(),panelId:panel.id,layerId:selected as never,variantId:panel.variantId,blockId:null,start:0,end:0,quote:"",text:comment,authorName:""}]}))setComment("");}}>{t("sb3.add-comment")}</Button></section>
      </aside>
    </div>
    <Dialog open={help} onOpenChange={showHelp}><DialogContent uiId="V-170"><DialogTitle>{t("sb3.help")}</DialogTitle><DialogDescription>{t("sb3.shortcuts")}</DialogDescription><dl className="grid grid-cols-2 gap-1 text-[13px]">{tools.map(item=><div key={item.id}>{item.key.toUpperCase()} · {panelLabel(`sb3.tool.${item.id}`)}</div>)}<div>Ctrl/⌘ + Enter · {t("sb3.new")}</div><div>Ctrl/⌘ + D · {t("sb2.duplicate")}</div><div>PageUp / PageDown · {t("sb3.previous")} / {t("sb3.next")}</div></dl></DialogContent></Dialog>
    <Dialog open={renumber} onOpenChange={showRenumber}><DialogContent uiId="V-169"><DialogTitle>{t("sb3.renumber")}</DialogTitle><DialogDescription>{t("sb3.renumber-warning")}</DialogDescription><div className="max-h-64 overflow-auto text-[13px]">{numbers.map(n=><div key={n.panelId}>{n.sceneBefore}.{n.before||"–"} → {n.sceneAfter}.{n.after}</div>)}</div><Button onClick={()=>{group(numberCommands(state,numbers));showRenumber(false);}} data-testid="sb3-renumber-confirm">{t("sb3.confirm")}</Button></DialogContent></Dialog>
    <Dialog open={confirmPath} onOpenChange={showPath}><DialogContent uiId="V-168"><DialogTitle>{t("sb3.use-path")}</DialogTitle><DialogDescription>{t("sb3.path-warning")}</DialogDescription><Button onClick={()=>{const c=layer?planArrowPath(state,layer.id,pathTarget):null;if(c)run(c);showPath(false);}} data-testid="sb3-path-confirm">{t("sb3.confirm")}</Button></DialogContent></Dialog>
    <UiId id="V-167"/>
  </section>;
}

function TextField({label,value,onSave}:{label:string;value:string;onSave:(value:string)=>void}){const[draft,set]=useState(value);useEffect(()=>set(value),[value]);return <label className="block text-[11px]">{label}<textarea className={ctl} value={draft} onChange={e=>set(e.target.value)} onBlur={()=>{if(draft!==value)onSave(draft);}} rows={2}/></label>;}
function NumberField({label,value,save,min=-100000,max=100000}:{label:string;value:number;save:(n:number)=>void;min?:number;max?:number}){return <label className="block text-[11px]">{label}<input key={value} type="number" className={ctl} defaultValue={value} min={min} max={max} step="any" onBlur={e=>{const n=Number(e.target.value);if(Number.isFinite(n)&&n>=min&&n<=max&&n!==value)save(n);}}/></label>;}
function LayerProperties({layer:l,layers,disabled,update}:{layer:CompositionLayer;layers:CompositionLayer[];disabled:boolean;update:(p:Partial<LayerFields>)=>void}){
  return <fieldset disabled={disabled} className="space-y-1"><legend className="text-[13px] font-semibold">{t("sb3.layer")}</legend><TextField label={t("sb3.title")} value={l.name} onSave={name=>update({name})}/>
    <div className="grid grid-cols-2 gap-1">{(["x","y","scaleX","scaleY","rotation"] as const).map(k=><NumberField key={k} label={panelLabel(`sb3.transform.${k}`)} value={l.transform[k]} save={n=>update({transform:{...l.transform,[k]:n,...(k==="scaleX"?{scaleY:n}:k==="scaleY"?{scaleX:n}:{})}})}/>)}</div>
    {l.text ? <><TextField label={t("sb3.text")} value={l.text.content} onSave={content=>update({text:{...l.text,content} as NonNullable<LayerFields["text"]>})}/><NumberField label={t("sb3.size")} value={l.text.size} min={1} max={4096} save={size=>update({text:{...l.text,size} as NonNullable<LayerFields["text"]>})}/></> : null}
    {l.shape && !l.arrow ? <select className={ctl} value={l.shape.type} aria-label={t("sb3.shape")} onChange={e=>update({shape:{...l.shape,type:e.target.value as "rect"|"ellipse"|"line",radius:l.shape?.radius??0,stroke:l.shape?.stroke??null}})}>{["rect","ellipse","line"].map(k=><option key={k} value={k}>{panelLabel(`sb3.shape.${k}`)}</option>)}</select> : null}
    {l.note ? <><TextField label={t("sb3.note")} value={l.note.text} onSave={text=>update({note:{...l.note,text} as NonNullable<LayerFields["note"]>})}/><select className={ctl} value={l.note.noteType} aria-label={t("sb3.note-type")} onChange={e=>update({note:{...l.note,noteType:e.target.value as "visual"|"direction"|"camera"} as NonNullable<LayerFields["note"]>})}>{["visual","direction","camera"].map(k=><option key={k} value={k}>{panelLabel(`sb3.note-type.${k}`)}</option>)}</select><label className="flex gap-1 text-[11px]"><input type="checkbox" checked={l.note.handled} onChange={e=>update({note:{...l.note,handled:e.target.checked} as NonNullable<LayerFields["note"]>})}/>{t("sb3.handled")}</label><select className={ctl} aria-label={t("sb3.anchor")} value={l.note.anchor && "layerId" in l.note.anchor?l.note.anchor.layerId:l.note.anchor?"region":""} onChange={e=>update({note:{...l.note,anchor:e.target.value==="region"?{region:{x:l.transform.x,y:l.transform.y,width:l.width,height:l.height}}:e.target.value?{layerId:e.target.value}:null} as NonNullable<LayerFields["note"]>})}><option value="">{t("sb3.no-anchor")}</option><option value="region">{t("sb3.region")}</option>{layers.filter(x=>x.id!==l.id).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><NumberField label={t("sb3.width")} value={l.width} min={1} max={16384} save={width=>update({width})}/><NumberField label={t("sb3.height")} value={l.height} min={1} max={16384} save={height=>update({height})}/></> : null}
    {l.arrow ? <><select className={ctl} value={l.arrow.form} aria-label={t("sb3.form")} onChange={e=>update({arrow:{...l.arrow,form:e.target.value as "straight"|"curved"} as NonNullable<LayerFields["arrow"]>})}><option value="straight">{t("sb3.straight")}</option><option value="curved">{t("sb3.curved")}</option></select><select className={ctl} value={l.arrow.category} aria-label={t("sb3.category")} onChange={e=>update({arrow:{...l.arrow,category:e.target.value} as NonNullable<LayerFields["arrow"]>})}>{["character","camera","object","gaze","attention"].map(k=><option key={k} value={k}>{panelLabel(`sb3.category.${k}`)}</option>)}</select><NumberField label={t("sb3.thickness")} min={1} max={64} value={l.arrow.thickness} save={thickness=>update({arrow:{...l.arrow,thickness} as NonNullable<LayerFields["arrow"]>})}/><select className={ctl} aria-label={t("sb3.anchor")} value={l.arrow.layerId??""} onChange={e=>update({arrow:{...l.arrow,layerId:e.target.value||null} as NonNullable<LayerFields["arrow"]>})}><option value="">{t("sb3.no-anchor")}</option>{layers.filter(x=>x.id!==l.id).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>{l.arrow.points.map((p,i)=><div key={i} className="grid grid-cols-2 gap-1"><NumberField label={`${i+1} · X`} value={p.x} save={x=>update({arrow:{...l.arrow,points:l.arrow?.points.map((p,j)=>j===i?{...p,x}:p)} as NonNullable<LayerFields["arrow"]>})}/><NumberField label={`${i+1} · Y`} value={p.y} save={y=>update({arrow:{...l.arrow,points:l.arrow?.points.map((p,j)=>j===i?{...p,y}:p)} as NonNullable<LayerFields["arrow"]>})}/></div>)}<Button size="sm" onClick={()=>update({arrow:{...l.arrow,points:[...(l.arrow?.points??[]),{x:0,y:0,smooth:false}]} as NonNullable<LayerFields["arrow"]>})}>{t("sb3.add-point")}</Button></> : null}
    {l.cameraMark ? <>{(["zoom","tilt"] as const).map(k=><NumberField key={k} label={panelLabel(`sb3.camera.${k}`)} value={l.cameraMark?.[k]??0} min={k==="zoom"?.01:-360} max={k==="zoom"?100:360} save={n=>update({cameraMark:{...l.cameraMark,[k]:n} as NonNullable<LayerFields["cameraMark"]>})}/>)}{(["x","y"] as const).map(k=><NumberField key={k} label={panelLabel(`sb3.camera.pan-${k}`)} value={l.cameraMark?.pan[k]??0} save={n=>update({cameraMark:{...l.cameraMark,pan:{...l.cameraMark?.pan,[k]:n}} as NonNullable<LayerFields["cameraMark"]>})}/>)}{(["x","y","width","height"] as const).map(k=><NumberField key={k} label={panelLabel(`sb3.camera.frame-${k}`)} value={l.cameraMark?.frame[k]??0} save={n=>update({cameraMark:{...l.cameraMark,frame:{...l.cameraMark?.frame,[k]:n}} as NonNullable<LayerFields["cameraMark"]>})}/>)}</> : null}
    <label className="flex items-center gap-2 text-[11px]">{t("sb3.color")}<input type="color" value={l.note?.color??l.arrow?.color??l.text?.color??l.fill??""} onChange={e=>{const color=e.target.value;update(l.note?{note:{...l.note,color}}:l.arrow?{arrow:{...l.arrow,color}}:l.text?{text:{...l.text,color}}:{fill:color});}}/></label>
  </fieldset>;
}
function PanelGuides({width,height,guides}:{width:number;height:number;guides:Guides}){
  const ratio = guides.mask==="project"?width/height:guides.mask.includes(":")?Number(guides.mask.split(":")[0])/Number(guides.mask.split(":")[1]):Number(guides.mask);
  const h=Math.min(height,width/ratio),w=h*ratio,x=(width-w)/2,y=(height-h)/2;
  return <svg aria-hidden className="pointer-events-none absolute inset-0 size-full p-8 text-text-secondary" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">{guides.mask!=="project"?<path d={`M0 0H${width}V${height}H0Z M${x} ${y}V${y+h}H${x+w}V${y}Z`} fill="currentColor" fillRule="evenodd" opacity=".5"/>:null}{guides.safe?<><rect x={width*.05} y={height*.05} width={width*.9} height={height*.9} fill="none" stroke="currentColor" strokeWidth="2"/><rect x={width*.1} y={height*.1} width={width*.8} height={height*.8} fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="8 8"/></>:null}{guides.thirds?[1,2].flatMap(n=>[<line key={`v${n}`} x1={width*n/3} x2={width*n/3} y1="0" y2={height} stroke="currentColor" strokeWidth="2"/>,<line key={`h${n}`} y1={height*n/3} y2={height*n/3} x1="0" x2={width} stroke="currentColor" strokeWidth="2"/>]):null}</svg>;
}
function panelLabel(key: string): string {
  switch (key) {
    case "sb3.tool.select": return t("sb3.tool.select");
    case "sb3.tool.arrow": return t("sb3.tool.arrow");
    case "sb3.tool.line": return t("sb3.tool.line");
    case "sb3.tool.shape": return t("sb3.tool.shape");
    case "sb3.tool.text": return t("sb3.tool.text");
    case "sb3.tool.camera": return t("sb3.tool.camera");
    case "sb3.tool.note": return t("sb3.tool.note");
    case "sb3.field.action": return t("sb3.field.action");
    case "sb3.field.dialogue": return t("sb3.field.dialogue");
    case "sb3.field.sound": return t("sb3.field.sound");
    case "sb3.field.camera": return t("sb3.field.camera");
    case "sb3.field.notes": return t("sb3.field.notes");
    case "sb3.angle.eye": return t("sb3.angle.eye");
    case "sb3.angle.high": return t("sb3.angle.high");
    case "sb3.angle.low": return t("sb3.angle.low");
    case "sb3.angle.bird": return t("sb3.angle.bird");
    case "sb3.angle.dutch": return t("sb3.angle.dutch");
    case "sb3.shape.rect": return t("sb3.shape.rect");
    case "sb3.shape.ellipse": return t("sb3.shape.ellipse");
    case "sb3.shape.line": return t("sb3.shape.line");
    case "sb3.note-type.visual": return t("sb3.note-type.visual");
    case "sb3.note-type.direction": return t("sb3.note-type.direction");
    case "sb3.note-type.camera": return t("sb3.note-type.camera");
    case "sb3.category.character": return t("sb3.category.character");
    case "sb3.category.camera": return t("sb3.category.camera");
    case "sb3.category.object": return t("sb3.category.object");
    case "sb3.category.gaze": return t("sb3.category.gaze");
    case "sb3.category.attention": return t("sb3.category.attention");
    case "sb3.transform.x": return t("sb3.transform.x");
    case "sb3.transform.y": return t("sb3.transform.y");
    case "sb3.transform.scaleX": return t("sb3.transform.scaleX");
    case "sb3.transform.scaleY": return t("sb3.transform.scaleY");
    case "sb3.transform.rotation": return t("sb3.transform.rotation");
    case "sb3.camera.zoom": return t("sb3.camera.zoom");
    case "sb3.camera.tilt": return t("sb3.camera.tilt");
    case "sb3.camera.pan-x": return t("sb3.camera.pan-x");
    case "sb3.camera.pan-y": return t("sb3.camera.pan-y");
    case "sb3.camera.frame-x": return t("sb3.camera.frame-x");
    case "sb3.camera.frame-y": return t("sb3.camera.frame-y");
    case "sb3.camera.frame-width": return t("sb3.camera.frame-width");
    case "sb3.camera.frame-height": return t("sb3.camera.frame-height");
    default: return key;
  }
}
