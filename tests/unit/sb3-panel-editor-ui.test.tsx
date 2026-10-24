import {render,screen,fireEvent} from '@testing-library/react';
import {beforeEach,describe,it,expect,vi} from 'vitest';
import {applyCommand,orderedOccurrences,type Command,type ProjectState,setLanguage} from '@/core';
import {useState} from 'react';
import {mustApply,seedProject,tid,envelope} from '../helpers/fixtures';
vi.mock('@tanstack/react-router',()=>({useNavigate:()=>vi.fn(),Link:()=>null}));
vi.mock('@/app/library/asset-images',()=>({useImageUrls:()=>({data:{}})}));
vi.mock('@/app/account/ui-prefs',()=>({useUiPref:(_key:string,fallback:unknown)=>[fallback,vi.fn()]}));
vi.mock('@/app/scene-editor/Stage',()=>({Stage:()=>null}));
import {PanelEditor} from '@/app/storyboard/PanelEditor';
import type {Commands} from '@/app/project/use-commands';
const captured:Command[]=[];
function Harness({initial,panelId}:{initial:ProjectState;panelId:string}){const[state,setState]=useState(initial);const panel=state.compositions[panelId];if(!panel)return null;const cmds={run:(command:Command)=>{const r=applyCommand(state,envelope(command));if(!r.ok)return r.error.message;captured.push(command);setState(r.state);return null;},canUndo:false,canRedo:false,undo:vi.fn(),redo:vi.fn()} as unknown as Commands;return <PanelEditor state={state} panel={panel} editable cmds={cmds} projectId={state.project.id}/>;}
function setup(done=false){captured.length=0;const seed=seedProject(2);const o=orderedOccurrences(seed.state,seed.mainId)[0];if(!o)throw Error('fixture');const id=tid<'composition'>();let state=mustApply(seed.state,{type:'AddStoryboardPanel',panelId:id,occurrenceId:o.id,variantId:o.variantId,orderKey:'a1'});if(done)state=mustApply(state,{type:'SetProductionStatus',statusId:tid(),eventId:tid(),area:'storyboard',compositionId:id,status:'done'});render(<Harness initial={state} panelId={id}/>);}
describe('SB-3 editor UI',()=>{
 beforeEach(()=>vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockImplementation(()=>null));
 for(const language of ['nb','en'] as const){it(`${language}: tools create ordinary layers; note editing persists and arrow requires explicit action`,()=>{setLanguage(language);setup();fireEvent.click(screen.getByTestId('sb3-tool-note'));expect(captured.at(-1)?.type).toBe('AddLayers');expect(screen.getAllByTestId('sb3-layer')).toHaveLength(1);const text=screen.getByRole('textbox',{name:language==='nb'?'Lapp':'Note'});fireEvent.change(text,{target:{value:'Camera must wait'}});fireEvent.blur(text);const edit=captured.at(-1);expect(edit?.type).toBe('UpdateLayers');if(edit?.type==='UpdateLayers')expect(edit.layers[0]?.fields.note?.text).toBe('Camera must wait');fireEvent.click(screen.getByTestId('sb3-tool-arrow'));expect(captured.filter(c=>c.type==='UpdateSceneDraft')).toHaveLength(0);expect(screen.getByTestId('sb3-use-path')).toBeDisabled();});}
 it('approved edit preserves snapshot and old approval before opening editing',()=>{setLanguage('en');setup(true);expect(screen.getByTestId('sb3-tool-note')).toBeDisabled();fireEvent.click(screen.getByTestId('sb3-edit-approved'));expect(captured.map(c=>c.type)).toEqual(['SnapshotStoryboardPanel','SetProductionStatus']);});
});
