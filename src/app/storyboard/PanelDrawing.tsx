import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SketchCanvas } from "./SketchCanvas";
import { layersOf, defaultLayerFields, layerFieldsOf, newId, keyBetween, renderFrame, type Composition, type ProjectState } from "@/core";
import { onionPanels } from "@/core/storyboard/sketch";
import { t } from "@/core/i18n/keyed";
import { createSketchSession, revokeSketchSession } from "@/adapters/mobile/sketch.functions";
import { QrCode } from "@/app/mobile/QrCode";
import { uploadAssetImage } from "@/app/library/asset-images";
import { drawFrame } from "@/engine/compositor/canvas";
import type { Commands } from "@/app/project/use-commands";
export function PanelDrawing({state,panel,allowed,cmds,panels}:{state:ProjectState;panel:Composition;allowed:boolean;cmds:Commands;panels:readonly Composition[]}){
  const [selected,setSelected]=useState(""),[session,setSession]=useState<{token:string;sessionId:string;url:string}|null>(null),[error,setError]=useState("");const layers=layersOf(state,panel.id),sketches=layers.filter(l=>l.kind==="sketch"),layer=sketches.find(l=>l.id===selected)??sketches[0];const neighbors=onionPanels(panels,panel.id);
  const add=()=>{const id=newId<"composition_layer">();const result=cmds.run({type:"AddLayers",layers:[{layerId:id,compositionId:panel.id,orderKey:keyBetween(layers.at(-1)?.orderKey??null,null),fields:{...defaultLayerFields(state,panel,{fill:panel.background}),kind:"sketch",fill:null,name:t("sb8.sketch"),sketch:{version:1,role:sketches.length?"clean":"rough",strokes:[]}}}]},t("sb8.sketch"));if(!result)setSelected(id);};
  const style=Object.values(state.styleProfiles??{}).find(p=>!p.removed);
  const saveSketchImage=async()=>{
    if(!allowed||!layer)return;setError("");
    try{await cmds.whenIdle();const fresh=cmds.current()??state;const c=document.createElement("canvas");c.width=panel.width;c.height=panel.height;const ctx=c.getContext("2d");if(!ctx)return;
      drawFrame(ctx,renderFrame(fresh,panel.id,0,{onlyLayers:new Set([layer.id])}),{images:new Map(),background:"transparent",placeholders:false});
      const blob=await new Promise<Blob|null>(resolve=>c.toBlob(resolve,"image/png"));if(!blob)return;const assetId=newId<"asset">(),variantId=newId<"asset_variant">(),group=newId();
      const commands:import("@/core").Command[]=[{type:"CreateAssets",assets:[{assetId,fields:{kind:"other",name:t("sb7.sketch"),names:[],description:"",category:"",tags:[]}}]},{type:"CreateAssetVariant",assetId,variantId,fields:{name:t("sb7.sketch"),style:"other",appearance:""}}];
      for(const command of commands){const r=await cmds.runAndWait(command,t("sb7.sketch"),group);if(r.error)throw Error(r.error);}
      const up=await uploadAssetImage(fresh.project.id,assetId,new File([blob],"sketch.png",{type:"image/png"}));const r=await cmds.runAndWait({type:"AddAssetVersion",versionId:up.versionId as import("@/core").AssetVersionId,variantId,media:up.media,note:JSON.stringify({panelId:panel.id,layerId:layer.id,layerRevision:layer.revision,kind:"sketch"})},t("sb7.sketch"),group);if(r.error)throw Error(r.error);
    }catch(e){setError(e instanceof Error?e.message:t("sb8.session-error"));}
  };
  return <div className="flex min-h-0 flex-1 flex-col" data-testid="sb8-panel-drawing">
    <div className="flex items-center gap-1 border-b border-border p-1"><Pencil className="size-4"/>{sketches.map(l=><Button key={l.id} size="sm" variant={l.id===layer?.id?"secondary":"ghost"} onClick={()=>setSelected(l.id)}>{l.sketch?.role==="clean"?t("sb8.clean"):t("sb8.rough")}</Button>)}<Button size="icon" variant="ghost" disabled={!allowed} title={t("sb8.add-layer")} aria-label={t("sb8.add-layer")} onClick={add}><Plus/></Button></div>
    <div className="flex flex-wrap items-center gap-2 p-1"><Button size="sm" variant="outline" disabled={!allowed||!layer} onClick={()=>{if(!layer)return;setError("");void createSketchSession({data:{projectId:state.project.id,panelId:panel.id,layerId:layer.id}}).then(s=>setSession({...s,url:`${window.location.origin}/m/${s.token}`})).catch(()=>setError(t("sb8.session-error")));}}>{t("sb8.mobile")}</Button><Button size="sm" variant="outline" disabled={!allowed||!layer?.sketch?.strokes.length} onClick={()=>void saveSketchImage()}>{t("sb7.sketch")}</Button>{session?<><QrCode value={session.url} size={96}/><Button size="sm" variant="ghost" onClick={()=>void revokeSketchSession({data:{sessionId:session.sessionId}}).then(()=>setSession(null)).catch(()=>setError(t("sb8.session-error")))}>{t("sb8.revoke")}</Button></>:null}{error?<span role="alert" className="text-status-danger">{error}</span>:null}</div>
    {layer?.sketch?<SketchCanvas width={panel.width} height={panel.height} spec={layer.sketch} disabled={!allowed||layer.locked} save={sketch=>cmds.run({type:"UpdateLayers",layers:[{layerId:layer.id,fields:{...layerFieldsOf(layer),sketch}}]},t("sb8.stroke"))} backdrop={renderFrame({...state,layers:Object.fromEntries(Object.entries(state.layers).map(([id,l])=>[id,id===layer.id?{...l,visible:false}:l]))},panel.id,0)} previous={neighbors.previous?renderFrame(state,neighbors.previous.id,0):undefined} next={neighbors.next?renderFrame(state,neighbors.next.id,0):undefined} palette={style?.guide.palette.colors} undo={()=>cmds.undo()} redo={()=>cmds.redo()} canUndo={cmds.canUndo} canRedo={cmds.canRedo}/>:<Button variant="outline" disabled={!allowed} onClick={add}><Pencil/>{t("sb8.add-layer")}</Button>}
  </div>;
}