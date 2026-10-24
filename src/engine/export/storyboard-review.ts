import type { ProjectState } from '@/core/model';
import { filmClips,filmAudio,filmTakeAudio,fpsToNumber,layerVersions } from '@/core';
import { selectReview } from '@/core/storyboard/review';
import { storyboardFilm } from '@/core/storyboard/playback';
import { panelPrintRows } from '@/core/storyboard/print';
import { printImageRenderer } from './storyboard-print';
import { exportAnimatic,loadImages } from './animatic';
import { AudioBank } from '../audio/mixer';
import { createSignedUrls,uploadFile } from '@/adapters/browser/storage-files';
import { t } from '@/core/i18n/keyed';
export async function uploadReviewMedia(state:ProjectState,productionId:string,occurrenceIds:string[],snapshots:Record<string,string>,reservation:{manifest:{key:string;panelId:string;image_key:string}[];videoKey:string},signal:AbortSignal,progress:(done:number,total:number)=>void){
 const selection=selectReview(state,productionId,occurrenceIds,snapshots);
 const original=filmClips(state,productionId).filter(c=>occurrenceIds.includes(c.occurrenceId));
 const sourceAudio=[...filmAudio(state,original,state.project.fps),...filmTakeAudio(original,state.project.fps)];
 const adapted=storyboardFilm(selection.state,original,sourceAudio);
 const rows=panelPrintRows(selection.state,original);
 const renderer=await printImageRenderer({state:selection.state,clips:original,source:'storyboard',rows,options:{paper:'A4',landscape:false,perPage:3,fields:[],layers:{sketch:true,note:true,arrow:true,camera_mark:true}},labels:{},language:'en',version:'',date:'',signal,urls:signed});
 try {for(let i=0;i<reservation.manifest.length;i++){if(signal.aborted)throw new DOMException(t('sb10.cancel'),'AbortError');const panel=reservation.manifest[i];if(!panel)continue;const row=rows.find(r=>r.panelId===panel.panelId);if(!row)throw new Error(t('sb10.error'));const image=await fetch(await renderer.render(row)).then(r=>r.blob());await upload(panel.image_key,image);progress(i+1,reservation.manifest.length+1);await new Promise<void>(r=>setTimeout(r,0));}}finally{await renderer.close();}
 const paths=[...new Set(Object.values(adapted.state.layers).filter(l=>!l.removed&&adapted.clips.some(c=>c.compositionId===l.compositionId)).flatMap(l=>layerVersions(adapted.state,l).map(v=>v.mediaPath)))];
 const audioPaths=[...new Set(adapted.audio.flatMap(a=>a.version?[a.version.mediaPath]:[]))];const urls=await signed([...paths,...audioPaths]),loaded=await loadImages(Object.fromEntries(paths.map(p=>[p,urls[p]??'']))),bank=new AudioBank();await bank.loadAll(Object.fromEntries(audioPaths.map(p=>[p,urls[p]??''])));if(loaded.failed.length||audioPaths.some(p=>!bank.get(p)))throw new Error(t('sb10.error'));
 const last=adapted.clips.at(-1);if(!last)throw new Error(t('sb10.error'));const file=await exportAnimatic({state:adapted.state,clips:adapted.clips,startFrame:0,endFrame:last.startFrame+last.durationFrames,width:1280,height:Math.round(1280*state.project.frameHeight/state.project.frameWidth),fps:state.project.fps,images:loaded.images,signal,mp4:true,audio:{items:adapted.audio,bank},onProgress:(done,total)=>progress(reservation.manifest.length+done/total,reservation.manifest.length+1)});await upload(reservation.videoKey,new Blob([file.bytes as BlobPart],{type:file.mimeType}));progress(reservation.manifest.length+1,reservation.manifest.length+1);
}

async function signed(paths:readonly string[]){const rows=await createSignedUrls('assets',[...paths],3600);return Object.fromEntries(rows.map(r=>[r.path,r.signedUrl]));}
async function upload(path:string,body:Blob){const error=await uploadFile('assets',path,body,{upsert:false,contentType:body.type});if(error)throw new Error(t('sb10.error'));}
