/** Originalt syntetisk prosjekt for SB-3; ingen manus eller medier fra private prosjekter. */
import {seedProject,mustApply,tid} from '../helpers/fixtures';
import {orderedOccurrences,diffStates,emptyProjectState,DEFAULT_COMPOSITION} from '../../src/core';
import {writeFileSync} from 'node:fs';
const seed=seedProject(3);const occurrence=orderedOccurrences(seed.state,seed.mainId)[0];
if(!occurrence)throw Error('Fixture occurrence missing');
const panelId=tid<'composition'>();
let state=mustApply(seed.state,{type:'AddStoryboardPanel',panelId,occurrenceId:occurrence.id,variantId:occurrence.variantId,orderKey:'a1'});
state=mustApply(state,{type:'CreateComposition',compositionId:tid(),variantId:occurrence.variantId,fields:DEFAULT_COMPOSITION});
const patch=diffStates(emptyProjectState(state.project),state);
const project={id:state.project.id,name:'Storyboard test',revision:1,fps_num:25,fps_den:1,frame_width:1920,frame_height:1080,source_language:'en'};
writeFileSync(process.argv[2]??'/tmp/browser/sb3/fixture.json',JSON.stringify({project,rows:{...patch.inserts,script_block_revisions:patch.blockRevisions},panelId,occurrenceId:occurrence.id}));
