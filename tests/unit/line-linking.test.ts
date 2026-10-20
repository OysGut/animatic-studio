import { describe,it,expect } from "vitest";
import { applyCommand,blocksOfVariant,makeBackup,stateFromRows,diffStates,emptyProjectState,lineLinkError,parseLineAlignment,lineAlignmentPrompt,linksAboveThreshold,uncertainLineScope,translatedState,backupIdMap,restoredState,type LineLinkFields,type ProjectState,type Command,type ProjectRows } from "@/core";
import {seedProject,tid,envelope} from "../helpers/fixtures";
function fixture() {
  let s=seedProject(2).state;
  const variants=Object.values(s.variants), variant=variants[0];
  if (!variant) throw new Error("Missing variant");
  const blocks=blocksOfVariant(s,variant.id).filter(b=>b.kind!=="heading");
  const translations={...s.translations};
  for (const b of blocks) {const id=tid<"translation">();translations[id]={id,revision:1,blockId:b.id,variantId:null,language:"en",text:`Translated ${b.text}`,basedOnRev:b.currentRev,status:"uncertain",removed:false};}
  s={...s,translations};
  const targets=Object.values(translations);
  const fields:LineLinkFields={variantId:variant.id,language:"en",sourceBlockIds:blocks.slice(0,1).map(b=>b.id),targetTranslationIds:targets.slice(0,1).map(t=>t.id),origin:"ai",confidence:0.9,reason:"matching line"};
  return {s,blocks,targets,fields};
}
function apply(s:ProjectState,c:Command) {const r=applyCommand(s,envelope(c));if (!r.ok) throw new Error(r.error.message);return r;}
describe("B-050 line linking",()=>{
  it("validates 1:1, 1:n and n:1, rejects n:m",()=>{const {s,blocks,targets,fields}=fixture();expect(lineLinkError(s,fields)).toBeNull();expect(lineLinkError(s,{...fields,targetTranslationIds:targets.slice(0,2).map(t=>t.id)})).toBeNull();expect(lineLinkError(s,{...fields,sourceBlockIds:blocks.slice(0,2).map(b=>b.id)})).toBeNull();expect(lineLinkError(s,{...fields,sourceBlockIds:blocks.slice(0,2).map(b=>b.id),targetTranslationIds:targets.slice(0,2).map(t=>t.id)})).toBe("cardinality");});
  it("rejects foreign scene, language, invalid IDs, duplicates and confidence outside 0–1",()=>{const {s,fields}=fixture();for(const confidence of [-0.01,1.01,NaN])expect(lineLinkError(s,{...fields,confidence})).not.toBeNull();expect(lineLinkError(s,{...fields,language:"nb"})).not.toBeNull();expect(lineLinkError(s,{...fields,language:"fr"})).toBe("target");expect(lineLinkError(s,{...fields,sourceBlockIds:[tid()]})).toBe("source");expect(lineLinkError(s,{...fields,sourceBlockIds:[...fields.sourceBlockIds,...fields.sourceBlockIds]})).toBe("cardinality");const foreign=Object.values(s.blocks).find(b=>b.variantId!==fields.variantId);if(!foreign)throw new Error("missing");expect(lineLinkError(s,{...fields,sourceBlockIds:[foreign.id]})).toBe("source");});
  it("parses 1:n and n:1; discards and counts foreign and repeated suggestions",()=>{const {s,blocks,targets,fields}=fixture();const one={...fields,targetTranslationIds:targets.slice(0,2).map(t=>t.id)};const r=parseLineAlignment(JSON.stringify({links:[one,{...fields,sourceBlockIds:[tid()]},one]}),s,fields.variantId,"en");expect(r.links).toHaveLength(1);expect(r.links[0]?.targetTranslationIds).toHaveLength(2);expect(r.discarded).toBe(2);const many=parseLineAlignment(JSON.stringify({links:[{...fields,sourceBlockIds:blocks.slice(0,2).map(b=>b.id)}]}),s,fields.variantId,"en");expect(many.links[0]?.sourceBlockIds).toHaveLength(2);});
  it("only sends uncertain scene lines; approved text and other scenes never enter prompt",()=>{const {s,fields,targets}=fixture();const t=targets[1];if(!t)throw new Error("missing");const next={...s,translations:{...s.translations,[t.id]:{...t,status:"approved" as const,text:"SECRET_APPROVED"}}};const p=lineAlignmentPrompt(next,fields.variantId,"en");expect(p.user).not.toContain("SECRET_APPROVED");expect(uncertainLineScope(next,fields.variantId,"en").targets).toHaveLength(2);expect(p.user).not.toContain("Handling 1");});
  it("threshold is inclusive at 0.8, rejects invalid thresholds",()=>{const {fields}=fixture();const links=[{...fields,id:tid(),revision:1,removed:false,confidence:0.8},{...fields,id:tid(),revision:1,removed:false,confidence:0.79}];expect(linksAboveThreshold(links,0.8)).toEqual([links[0]?.id]);expect(linksAboveThreshold(links,-1)).toEqual([]);});
  it("bulk approval is one command and one inverse; undo/redo preserves Norwegian text",()=>{const {s,fields}=fixture();const id=tid();const r=apply(s,{type:"ApproveLineLinks",linkIds:[],additions:[{linkId:id,fields}]});expect(r.state.translationLineLinks[id]?.origin).toBe("approved");expect(r.state.blocks).toEqual(s.blocks);const undo=apply(r.state,r.inverse);expect(undo.state.translationLineLinks[id]?.removed).toBe(true);const redo=apply(undo.state,undo.inverse);expect(redo.state.translationLineLinks[id]?.removed).toBe(false);expect(redo.state.blocks).toEqual(s.blocks);});
  it("manual adjustment, rejection and creation undo are reversible",()=>{const {s,fields}=fixture();const id=tid();const add=apply(s,{type:"SetLineLink",linkId:id,fields});const reject=apply(add.state,{type:"RejectLineLinks",linkIds:[id],removed:true});expect(apply(reject.state,reject.inverse).state.translationLineLinks[id]?.removed).toBe(false);expect(apply(add.state,add.inverse).state.translationLineLinks[id]).toBeUndefined();});
  it("approved 1:n and n:1 are used only by translated projection",()=>{
    const {s,fields,targets,blocks}=fixture();
    const one=apply(s,{type:"SetLineLink",linkId:tid(),fields:{...fields,origin:"approved",targetTranslationIds:targets.slice(0,2).map(t=>t.id)}}).state;
    const source=blocks[0];if(!source)throw new Error("missing");
    expect(translatedState(one,"en").blocks[source.id]?.text).toBe(targets.slice(0,2).map(t=>t.text).join("\n"));
    expect(one.blocks[source.id]?.text).toBe(s.blocks[source.id]?.text);
    expect(translatedState(one,"nb")).toBe(one);
    const many=apply(s,{type:"SetLineLink",linkId:tid(),fields:{...fields,origin:"approved",sourceBlockIds:blocks.slice(0,2).map(b=>b.id)}}).state;
    const second=blocks[1];if(!second)throw new Error("missing");
    expect(translatedState(many,"en").blocks[second.id]?.text).toBe("");
  });
  it("backup includes approved links and remaps their arrays on restore",async()=>{
    const {s,fields}=fixture();const id=tid();const linked=apply(s,{type:"SetLineLink",linkId:id,fields:{...fields,origin:"approved"}}).state;
    const empty=emptyProjectState(s.project); const inserts=diffStates(empty,linked).inserts;
    const rows={project:{id:s.project.id,name:s.project.name,revision:1,fps_num:25,fps_den:1,frame_width:1920,frame_height:1080},...inserts,script_block_revisions:s.blockRevisions.map(r=>({project_id:s.project.id,block_id:r.blockId,rev:r.rev,text:r.text,author:r.author,created_at:"2026-10-20T00:00:00Z"}))} as unknown as ProjectRows;
    const b=makeBackup({rows,scriptVersions:[],importedDocuments:[],changeLog:[],generationJobs:[],schemaVersion:64,createdAt:"2026-10-20T00:00:00Z",include:new Set()});
    expect(b.tables["translation_line_links"]).toHaveLength(1);
    const pid=tid<"project">(),main=tid<"production">();const map=await backupIdMap(b,pid,main);
    const originalMain=Object.values(s.productions).find(p=>p.kind === "main");if(!originalMain)throw new Error("missing main");
    const base={...emptyProjectState({...s.project,id:pid}),productions:{[main]:{...originalMain,id:main}}};
    const restored=restoredState(b,map,base,tid());
    const l=Object.values(restored.translationLineLinks)[0];expect(l?.sourceBlockIds).toEqual(fields.sourceBlockIds.map(x=>map.get(x)));expect(l?.targetTranslationIds).toEqual(fields.targetTranslationIds.map(x=>map.get(x)));
  });
  it("storage roundtrip includes array references",()=>{const {s,fields}=fixture();const id=tid();const r=apply(s,{type:"SetLineLink",linkId:id,fields});const patch=diffStates(s,r.state);const row=patch.inserts["translation_line_links"]?.[0];expect(row?.["source_block_ids"]).toEqual(fields.sourceBlockIds);expect(row?.["target_translation_ids"]).toEqual(fields.targetTranslationIds);});
});
