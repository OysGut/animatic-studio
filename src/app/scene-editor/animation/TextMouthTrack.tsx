import { useState } from "react";
import { Download, RefreshCw, Scissors, Merge, Settings, Check, X } from "lucide-react";
import type { ProjectState } from "@/core/model";
import type { Command } from "@/core/commands/types";
import { animationDialogueTracks } from "@/core/animation/tracks";
import { clipEditOf } from "@/core/dialogue/versions";
import { draftMouthSpans, moveMouthBoundary, splitMouthSpan, mergeMouthSpans } from "@/core/interchange/mouth-draft";
import { mouthAudioSignature, mouthText, mouthTrackStale } from "@/core/interchange/mouth-export";
import { mouthShapes, type MouthSet, type MouthTrack, type MouthShape } from "@/core/interchange/mouth-types";
import { SceneSelect } from "@/app/shell/SceneSelect";
import { IconButton } from "@/app/shell/workspace-chrome";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TimelineRowGeometry } from "../Timeline";
import { t } from "@/core/i18n/keyed";

export function TextMouthTrack({state,occurrenceId,language,g,editable,run}:{state:ProjectState;occurrenceId:string;language:string;g:TimelineRowGeometry;editable:boolean;run:(c:Command,label:string)=>string|null}) {
  const [error,setError]=useState<string|null>(null),[settings,setSettings]=useState<MouthSet|null>(null),[proposal,setProposal]=useState<MouthTrack|null>(null),[selected,setSelected]=useState<{trackId:string;index:number}|null>(null);
  const tracks=animationDialogueTracks(state,occurrenceId,language);
  const save=(track:MouthTrack)=>setError(run({type:"SaveMouthTrack",track},t("ptg4.edit")));
  const draft=(clipId:string,set:MouthSet)=>{
    const row=tracks.find(r=>r.clip.id===clipId); if(!row?.block) return;
    const edit=clipEditOf(state,row.clip),audio=row.version;
    const clipEnd=row.clip.offsetMs+edit.lengthMs/edit.speed;
    const words=(audio?.alignment?.words ?? []).map(w=>({...w,startMs:w.startMs===null?null:Math.max(row.clip.offsetMs,row.clip.offsetMs+(w.startMs-edit.sourceInMs)/edit.speed),endMs:w.endMs===null?null:Math.min(clipEnd,row.clip.offsetMs+(w.endMs-edit.sourceInMs)/edit.speed)}));
    if(!words.some(w=>w.startMs!==null && w.endMs!==null)){setError(t("ptg4.no-times"));return;}
    const previous=Object.values(state.mouthTracks ?? {}).find(x=>!x.removed&&x.clipId===clipId&&x.language===language);
    const ratio=state.project.capture?.mode==="twos"?2:1;
    setError(null);setProposal({id:previous?.id ?? crypto.randomUUID(),revision:previous?.revision ?? 0,occurrenceId,characterId:set.characterId,setId:set.id,clipId,blockId:row.block.id,language,spans:draftMouthSpans(words,language,set.system,state.project.fps,ratio),source:{text:mouthText(state,row.block.id,language),blockRevision:row.block.revision,audioSignature:mouthAudioSignature(state,clipId),setSystem:set.system,algorithm:"ptg4-text-1"},removed:false});
  };
  if(!tracks.length)return null;
  const chosen=selected?state.mouthTracks[selected.trackId]:undefined;
  const span=chosen && selected?chosen.spans[selected.index]:undefined;
  return <section data-testid="ptg4-mouth-track" className="border-t border-border" aria-label={t("ptg4.title")}>
    <div className="sticky left-0 flex items-center gap-1 bg-surface-2 px-2 text-xs text-text-secondary" style={{width:g.labelW,height:g.rowH}}>{t("ptg4.title")}</div>
    {error?<p role="alert" className="sticky left-0 text-xs text-status-danger">{error}</p>:null}
    {tracks.map(row=>{
      const characterId=row.clip.characterAssetId ?? null;
      const character=characterId?state.assets[characterId]:undefined;
      if(!character || !characterId)return null;
      const set=Object.values(state.mouthSets ?? {}).find(x=>!x.removed&&x.characterId===characterId);
      const track=Object.values(state.mouthTracks ?? {}).find(x=>!x.removed&&x.clipId===row.clip.id&&x.language===language);
      const shown=proposal?.clipId===row.clip.id?proposal:track;
      return <div key={row.clip.id} data-testid={`ptg4-row-${row.clip.id}`} className="relative border-b border-border bg-surface-1" style={{height:g.rowH}}>
        <div className="sticky left-0 z-20 flex h-full items-center gap-1 border-r border-border bg-surface-1 px-2 text-xs text-text-secondary" style={{width:g.labelW}}>
          <span className="min-w-0 flex-1 truncate">{character.name}</span>
          {track && mouthTrackStale(state,track)?<span data-testid="ptg4-stale" title={t("ptg4.stale")} className="text-status-discrepancy">!</span>:null}
          <IconButton label={t("ptg4.set")} data-testid="ptg4-set" disabled={!editable} onClick={()=>{const system="rhubarb" as const;setSettings(set ?? {id:crypto.randomUUID(),revision:0,characterId,system,variants:{},removed:false});}}><Settings/></IconButton>
          <IconButton label={t("ptg4.draft")} data-testid="ptg4-draft" disabled={!editable || !set} onClick={()=>set&&draft(row.clip.id,set)}><RefreshCw/></IconButton>
          {proposal?.clipId===row.clip.id?<><IconButton label={t("ptg4.apply")} data-testid="ptg4-apply" onClick={()=>{const failure=run({type:"SaveMouthTrack",track:proposal},t("ptg4.draft"));setError(failure);if(!failure)setProposal(null);}}><Check/></IconButton><IconButton label={t("ptg4.discard")} onClick={()=>setProposal(null)}><X/></IconButton></>:null}
        </div>
        {shown?.spans.map((s,index)=><Button key={`${index}-${s.startFrame}`} data-testid="ptg4-span" data-shape={s.shape} aria-label={t("ptg4.span",{shape:s.shape,start:s.startFrame,end:s.endFrame})} size="sm" variant="outline" disabled={!editable || shown===proposal} className="absolute top-0 h-full overflow-hidden rounded-sm bg-surface-3 p-0 font-mono text-xs" style={{left:g.labelW+s.startFrame*g.ppf,width:Math.max(1,(s.endFrame-s.startFrame)*g.ppf)}} onClick={()=>track&&setSelected({trackId:track.id,index})}>{s.shape}</Button>)}
      </div>;
    })}
    <Dialog open={!!settings} onOpenChange={open=>{if(!open)setSettings(null);}}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{t("ptg4.set")}</DialogTitle></DialogHeader>{settings?<>
      <Select value={settings.system} onValueChange={system=>{if(system==="rhubarb"||system==="preston-blair")setSettings({...settings,system,variants:{}});}}><SelectTrigger data-testid="ptg4-system" aria-label={t("ptg4.system")}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="rhubarb">Rhubarb A–H / X</SelectItem><SelectItem value="preston-blair">Preston Blair</SelectItem></SelectContent></Select>
      {mouthShapes(settings.system).map(shape=><label key={shape} className="flex items-center gap-2 text-xs"><span className="w-10 font-mono">{shape}</span><SceneSelect testId={`ptg4-variant-${shape}`} value={settings.variants[shape]??""} ariaLabel={t("ptg4.variant")} emptyLabel={t("ptg4.none")} options={Object.values(state.assetVariants).filter(v=>v.assetId===settings.characterId).map(v=>({value:v.id,label:v.name}))} onChange={id=>setSettings({...settings,variants:{...settings.variants,[shape]:id||null}})} className="flex-1"/></label>)}
      <Button data-testid="ptg4-save-set" onClick={()=>{const failure=run({type:"SaveMouthSet",set:settings},t("ptg4.set"));setError(failure);if(!failure)setSettings(null);}}>{t("ptg4.save")}</Button>
    </>:null}</DialogContent></Dialog>
    <Dialog open={!!chosen&&!!span} onOpenChange={open=>{if(!open)setSelected(null);}}><DialogContent><DialogHeader><DialogTitle>{t("ptg4.edit")}</DialogTitle></DialogHeader>{chosen&&span&&selected?<>
      <Select value={span.shape} onValueChange={shape=>save({...chosen,spans:chosen.spans.map((s,i)=>i===selected.index?{...s,shape:shape as MouthShape}:s)})}><SelectTrigger data-testid="ptg4-shape" aria-label={t("ptg4.shape")}><SelectValue/></SelectTrigger><SelectContent>{mouthShapes(chosen.source.setSystem).map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
      <label className="text-xs">{t("ptg4.start")}<Input data-testid="ptg4-start" type="number" value={span.startFrame} min={0} max={span.endFrame-1} onChange={e=>{const f=Number(e.target.value);if(!Number.isInteger(f)||f<0||f>=span.endFrame)return;const prev=chosen.spans[selected.index-1];save({...chosen,spans:prev?.endFrame===span.startFrame?moveMouthBoundary(chosen.spans,selected.index,f):chosen.spans.map((s,i)=>i===selected.index?{...s,startFrame:f}:s)});}}/></label>
      <label className="text-xs">{t("ptg4.end")}<Input data-testid="ptg4-end" type="number" value={span.endFrame} min={span.startFrame+1} onChange={e=>{const f=Number(e.target.value);if(!Number.isInteger(f)||f<=span.startFrame)return;const next=chosen.spans[selected.index+1];save({...chosen,spans:next?.startFrame===span.endFrame?moveMouthBoundary(chosen.spans,selected.index+1,f):chosen.spans.map((s,i)=>i===selected.index?{...s,endFrame:f}:s)});}}/></label>
      <div className="flex gap-2"><Button data-testid="ptg4-split" variant="outline" disabled={span.endFrame-span.startFrame<2} onClick={()=>save({...chosen,spans:splitMouthSpan(chosen.spans,selected.index,Math.floor((span.startFrame+span.endFrame)/2))})}><Scissors/>{t("ptg4.split")}</Button><Button data-testid="ptg4-merge" variant="outline" disabled={chosen.spans[selected.index+1]?.startFrame!==span.endFrame} onClick={()=>save({...chosen,spans:mergeMouthSpans(chosen.spans,selected.index)})}><Merge/>{t("ptg4.merge")}</Button></div>
    </>:null}</DialogContent></Dialog>
  </section>;
}