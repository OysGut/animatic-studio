/** SB-10: frozen review selection and plain-text feedback; never changes production status. */
import type { ProjectState } from '../model';
import type { PanelSnapshotContent } from './index';
import { panelSnapshotContentOf } from './index';
import { panelDetails } from './editing';
import { filmClips } from '../assembly/film';
import { storyboardFilm, storyboardTimeline } from './playback';
export const REVIEW_MAX_PANELS = 500;
export const REVIEW_MAX_TEXT = 4000;
export type GuestDecision = 'none' | 'approved' | 'changes';
export interface ReviewPanel { key:string; panelId:string; revision:number; label:string; durationFrames:number; startFrame:number; snapshot:PanelSnapshotContent; }
export interface ReviewSelection { panels:ReviewPanel[]; state:ProjectState; clips:ReturnType<typeof filmClips>; }
export function reviewText(value:unknown,max=REVIEW_MAX_TEXT):string {
  if(typeof value!=='string')return '';
  return value.normalize('NFC').replace(/<[^>]*>/g,'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,max);
}
export function guestFeedbackValid(d:{name:string;email?:string;text:string;decision:GuestDecision;x:number|null;y:number|null}):boolean {
  return !!d.name.trim()&&d.name.length<=100&&(!d.email||d.email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email))&&d.text.length<=4000&&(['none','approved','changes'] as string[]).includes(d.decision)&&((d.x===null&&d.y===null)||(Number.isFinite(d.x)&&Number.isFinite(d.y)&&Number(d.x)>=0&&Number(d.x)<=1&&Number(d.y)>=0&&Number(d.y)<=1))&&(!!d.text.trim()||d.decision!=='none');
}
export function reviewAllowed(s:{revoked:boolean;ready:boolean;expiresAt:string},now:number):boolean {return !s.revoked&&s.ready&&Date.parse(s.expiresAt)>now;}
export function revisionState(s:ProjectState,snapshot:PanelSnapshotContent):ProjectState {
  const id=snapshot.composition.id;
  return {...s,compositions:{...s.compositions,[id]:{...snapshot.composition,removed:false}},layers:{...Object.fromEntries(Object.entries(s.layers).filter(([,l])=>l.compositionId!==id)),...Object.fromEntries(snapshot.layers.map(l=>[l.id,{...l,removed:false}]))}};
}
export function selectReview(s:ProjectState,productionId:string,occurrenceIds:readonly string[],snapshots:Readonly<Record<string,string>>={}):ReviewSelection {
  const selected=new Set(occurrenceIds);if(!selected.size)throw new Error('review selection');
  const clips=filmClips(s,productionId).filter(c=>selected.has(c.occurrenceId));
  let state=s;
  for(const[panelId,snapshotId]of Object.entries(snapshots)){const sn=s.panelSnapshots?.[snapshotId];if(!sn||sn.removed||sn.panelId!==panelId||!selected.has(sn.snapshot.composition.occurrenceId??''))throw new Error('review revision');state=revisionState(state,sn.snapshot);}
  const timeline=storyboardTimeline(state,clips);if(!timeline.length||timeline.length>REVIEW_MAX_PANELS)throw new Error('review panel limit');
  const adapted=storyboardFilm(state,clips,[]);
  const panels=timeline.map((sh,i)=>{const snapshot=panelSnapshotContentOf(state,sh.panel.id);if(!snapshot)throw new Error('review snapshot');const details=panelDetails(sh.panel);return {key:`p${i+1}`,panelId:sh.panel.id,revision:sh.panel.revision,label:[details.sceneNumber,details.number,sh.panel.name].filter(Boolean).join(' · '),durationFrames:sh.durationFrames,startFrame:adapted.clips[i]?.startFrame??sh.startFrame,snapshot};});
  return {panels,state:adapted.state,clips:adapted.clips};
}
export function compareRevisions(a:readonly PanelSnapshotContent[],b:readonly PanelSnapshotContent[]) {
  const left=new Map(a.map(p=>[p.composition.id,p])),right=new Map(b.map(p=>[p.composition.id,p]));
  const semantic=(p:PanelSnapshotContent)=>JSON.stringify({composition:{...p.composition,revision:0},layers:p.layers.map(l=>({...l,revision:0})),blockIds:p.blockIds});
  return [...new Set([...left.keys(),...right.keys()])].map(id=>({id,before:left.get(id),after:right.get(id),kind:!left.has(id)?'new':!right.has(id)?'removed':semantic(left.get(id) as PanelSnapshotContent)===semantic(right.get(id) as PanelSnapshotContent)?'same':'changed'}));
}
