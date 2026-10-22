import type { ProjectState } from "../model";
import { audioVersion } from "../audio";
import { clipEditOf } from "../dialogue/versions";
import { translationOf } from "../translation";
import { framesToSeconds, secondsToFrames } from "../time";
import type { InterchangeDoc, Shot } from "./types";
import { exposureOf, shotExposures } from "./dragonframe";
import type { MouthShape, MouthTrack } from "./mouth-types";

export function mouthText(state: ProjectState, blockId: string, language: string): string {
  return language === "nb" ? state.blocks[blockId]?.text ?? "" : translationOf(state,blockId,language)?.text ?? "";
}
export function mouthAudioSignature(state: ProjectState, clipId: string): string {
  const clip=state.audioClips[clipId];
  if(!clip) return "";
  const version=audioVersion(state,clip);
  return JSON.stringify([clip.activeVersionId ?? null,version?.id ?? null,version?.mediaPath ?? null,version?.alignment ?? null,clipEditOf(state,clip),clip.offsetMs]);
}
export function mouthTrackStale(state: ProjectState, track: MouthTrack): boolean {
  const set=state.mouthSets[track.setId],block=state.blocks[track.blockId];
  return !set || set.removed || set.system!==track.source.setSystem || !block || block.removed || block.revision!==track.source.blockRevision || mouthText(state,track.blockId,track.language)!==track.source.text || mouthAudioSignature(state,track.clipId)!==track.source.audioSignature;
}
export interface ExportMouthTrack { readonly id:string; readonly characterId:string; readonly character:string; readonly system:string; readonly stale:boolean; readonly cues:readonly { readonly frame:number; readonly endFrame:number; readonly shape:MouthShape }[] }
/** Frame conversion and exposure grid are shared with PTG2, including handles. */
export function shotMouthTracks(state: ProjectState, doc: InterchangeDoc, shot: Shot): ExportMouthTrack[] {
  return Object.values(state.mouthTracks ?? {}).filter(t=>!t.removed && t.occurrenceId===shot.id && t.language===doc.language.dialogue).map(t=>({
    id:t.id,characterId:t.characterId,character:state.assets[t.characterId]?.name ?? t.characterId,system:t.source.setSystem,stale:mouthTrackStale(state,t),
    cues:t.spans.flatMap(s=>{
      const at=(f:number)=>exposureOf(secondsToFrames(framesToSeconds(shot.sourceStartFrame+f,doc.sourceFps),doc.fps),shot,doc.exposureStep);
      const a=Math.max(shot.frameIn,at(s.startFrame)), b=Math.min(shot.frameOut,at(s.endFrame));
      return b>a?[{frame:a-shot.frameIn,endFrame:b-shot.frameIn,shape:s.shape}]:[];
    }),
  }));
}
export function mouthLabelAt(tracks: readonly ExportMouthTrack[], relativeFrame: number): string {
  return tracks.flatMap(t=>{ const cue=t.cues.find(c=>relativeFrame>=c.frame && relativeFrame<c.endFrame);return cue?[`${t.character}: ${cue.shape}`]:[]; }).join(" / ");
}
const papagayo: Readonly<Record<string,string>> = {A:"MBP",B:"etc",C:"E",D:"AI",E:"O",F:"U",G:"FV",H:"L",X:"rest"};
export function mohoDat(track: ExportMouthTrack, length: number): string {
  const events=new Map<number,string>([[0,"rest"]]);
  for(const c of track.cues) { events.set(c.frame,papagayo[c.shape] ?? c.shape);events.set(c.endFrame,"rest"); }
  events.set(length,"rest");
  return "MohoSwitch1\n"+[...events].sort((a,b)=>a[0]-b[0]).map(([f,s])=>`${f+1} ${s}`).join("\n")+"\n";
}
export function mouthJson(doc: InterchangeDoc, shot: Shot, tracks: readonly ExportMouthTrack[]): string {
  return JSON.stringify({format:"ptg-mouth-1",shot:shot.name,fps:doc.fps,exposureStep:doc.exposureStep,frameCount:shot.frameOut-shot.frameIn,frameOrigin:0,tracks},null,2)+"\n";
}
export interface MouthListRow { readonly character:string; readonly shape:MouthShape; readonly variant:string; readonly count:number; readonly shots:readonly string[] }
export function mouthList(state: ProjectState, doc: InterchangeDoc): MouthListRow[] {
  const rows=new Map<string,{character:string;shape:MouthShape;variant:string;count:number;shots:Set<string>}>();
  for(const shot of doc.shots) for(const track of shotMouthTracks(state,doc,shot)) {
    const stored=state.mouthTracks[track.id],set=stored?state.mouthSets[stored.setId]:undefined;
    for(const c of track.cues) {
      const key=`${track.characterId}/${c.shape}`,variantId=set?.variants[c.shape];
      const row=rows.get(key) ?? {character:track.character,shape:c.shape,variant:variantId?state.assetVariants[variantId]?.name ?? variantId:"",count:0,shots:new Set<string>()};
      row.count+=shotExposures(doc,shot).filter(f=>f-shot.frameIn>=c.frame && f-shot.frameIn<c.endFrame).length;
      row.shots.add(shot.name);rows.set(key,row);
    }
  }
  return [...rows.values()].map(r=>({...r,shots:[...r.shots]}));
}
export function mouthListCsv(rows: readonly MouthListRow[], headers: readonly string[]): Uint8Array {
  const cell=(s:string|number)=>`"${String(s).replace(/"/g,'""')}"`;
  return new TextEncoder().encode("\uFEFF"+[headers,...rows.map(r=>[r.character,r.shape,r.variant,r.count,r.shots.join(" / ")])].map(r=>r.map(cell).join(",")).join("\r\n")+"\r\n");
}