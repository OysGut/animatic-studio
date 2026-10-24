/** Synthetic storyboard/audio only; no private screenplay or paid calls. */
import { seedProject, mustApply, tid } from '../helpers/fixtures';
import { orderedOccurrences, diffStates, emptyProjectState, panelDetails } from '../../src/core';
import { writeFileSync } from 'node:fs';
const seed=seedProject(3); let state=seed.state;
const occurrences=orderedOccurrences(state,seed.mainId);
const assetId=tid<'asset'>(),variantId=tid<'asset_variant'>(),versionId=tid<'asset_version'>();
state=mustApply(state,{type:'CreateAssets',assets:[{assetId,fields:{kind:'sound',name:'Temporary',names:[],description:'',category:'',tags:[]}}]});
state=mustApply(state,{type:'CreateAssetVariant',variantId,assetId,fields:{name:'Temporary',style:'other',appearance:''}});
state=mustApply(state,{type:'AddAssetVersion',versionId,variantId,media:{path:state.project.id+'/temporary.wav',mimeType:'audio/wav',width:null,height:null,byteSize:1000,sha256:'a'.repeat(64),durationMs:2000},note:''});
const panels=[];
for(const occurrence of occurrences){for(let i=0;i<2;i++){const panelId=tid<'composition'>();panels.push(panelId);state=mustApply(state,{type:'AddStoryboardPanel',panelId,occurrenceId:occurrence.id,variantId:occurrence.variantId,orderKey:'a'+i,durationFrames:50});}}
const first=panels[0],occurrence=occurrences[0];if(!first||!occurrence)throw Error('Missing fixture');
const panel=state.compositions[first];if(!panel)throw Error('Missing panel');
state=mustApply(state,{type:'SetStoryboardDetails',panelId:first,details:{...panelDetails(panel),tempAudio:{assetId,versionId,name:'Temporary',durationMs:2000}}});
const patch=diffStates(emptyProjectState(state.project),state);
writeFileSync(process.argv[2]??'/tmp/browser/sb4/fixture.json',JSON.stringify({project:{id:state.project.id,name:'Storyboard test',revision:1,fps_num:25,fps_den:1,frame_width:1920,frame_height:1080,source_language:'en'},rows:{...patch.inserts,script_block_revisions:patch.blockRevisions},panelId:first,occurrenceId:occurrence.id}));
