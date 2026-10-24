import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SketchCanvas } from "./SketchCanvas";
import { layersOf, defaultLayerFields, layerFieldsOf, newId, keyBetween, renderFrame, type Composition, type ProjectState } from "@/core";
import { onionPanels } from "@/core/storyboard/sketch";
import { t } from "@/core/i18n/keyed";
import type { Commands } from "@/app/project/use-commands";
export function PanelDrawing({state,panel,allowed,cmds,panels}:{state:ProjectState;panel:Composition;allowed:boolean;cmds:Commands;panels:readonly Composition[]}){
  const [selected,setSelected]=useState("");const layers=layersOf(state,panel.id),sketches=layers.filter(l=>l.kind==="sketch"),layer=sketches.find(l=>l.id===selected)??sketches[0];const neighbors=onionPanels(panels,panel.id);
  const add=()=>{const id=newId<"composition_layer">();const result=cmds.run({type:"AddLayers",layers:[{layerId:id,compositionId:panel.id,orderKey:keyBetween(layers.at(-1)?.orderKey??null,null),fields:{...defaultLayerFields(state,panel,{fill:panel.background}),kind:"sketch",fill:null,name:t("sb8.sketch"),sketch:{version:1,role:sketches.length?"clean":"rough",strokes:[]}}}]},t("sb8.sketch"));if(!result)setSelected(id);};
  const style=Object.values(state.styleProfiles??{}).find(p=>!p.removed);
  return <div className="flex min-h-0 flex-1 flex-col" data-testid="sb8-panel-drawing">
    <div className="flex items-center gap-1 border-b border-border p-1"><Pencil className="size-4"/>{sketches.map(l=><Button key={l.id} size="sm" variant={l.id===layer?.id?"secondary":"ghost"} onClick={()=>setSelected(l.id)}>{l.sketch?.role==="clean"?t("sb8.clean"):t("sb8.rough")}</Button>)}<Button size="icon" variant="ghost" disabled={!allowed} title={t("sb8.add-layer")} aria-label={t("sb8.add-layer")} onClick={add}><Plus/></Button></div>
    {layer?.sketch?<SketchCanvas width={panel.width} height={panel.height} spec={layer.sketch} disabled={!allowed||layer.locked} save={sketch=>cmds.run({type:"UpdateLayers",layers:[{layerId:layer.id,fields:{...layerFieldsOf(layer),sketch}}]},t("sb8.stroke"))} backdrop={renderFrame({...state,layers:Object.fromEntries(Object.entries(state.layers).map(([id,l])=>[id,id===layer.id?{...l,visible:false}:l]))},panel,0)} previous={neighbors.previous?renderFrame(state,neighbors.previous,0):undefined} next={neighbors.next?renderFrame(state,neighbors.next,0):undefined} palette={style?.guide.palette.colors} undo={()=>cmds.undo()} redo={()=>cmds.redo()} canUndo={cmds.canUndo} canRedo={cmds.canRedo}/>:<Button variant="outline" disabled={!allowed} onClick={add}><Pencil/>{t("sb8.add-layer")}</Button>}
  </div>;
}