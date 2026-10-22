import { describe,expect,it } from "vitest";
import { applyCommand } from "@/core";
import { diffStates } from "@/core/patch";
import { fixture } from "../visual/fixture-state";
import { envelope } from "../helpers/fixtures";
import { pronunciation,phonemeMouth,draftMouthSpans,mouthBoundary,splitMouthSpan,mergeMouthSpans,moveMouthBoundary } from "@/core/interchange/mouth-draft";
import { mouthShapes,validMouthSpans,type MouthSet,type MouthTrack } from "@/core/interchange/mouth-types";
import { mouthAudioSignature,mouthTrackStale,mouthText,mohoDat,shotMouthTracks,mouthJson,mouthList } from "@/core/interchange/mouth-export";
import type { Command,ProjectState } from "@/core";
import { buildInterchange } from "@/core/interchange";
import { buildXsheets } from "@/core/interchange/dragonframe";

const id=(n:number)=>`01900000-0000-7000-8000-0084000000${String(n).padStart(2,"0")}`;
function base(){
  const original=fixture.state,clip=Object.values(original.audioClips).find(c=>c.kind==="dialogue"&&c.blockId),character=Object.values(original.assets).find(c=>c.kind==="character");
  if(!clip?.blockId||!character)throw new Error("fixture clip");
  const s={...original,audioClips:{...original.audioClips,[clip.id]:{...clip,characterAssetId:character.id}}};
  const set:MouthSet={id:id(1),revision:0,characterId:character.id,system:"rhubarb",variants:{},removed:false};
  const track:MouthTrack={id:id(2),revision:0,clipId:clip.id,blockId:clip.blockId,characterId:set.characterId,setId:set.id,occurrenceId:clip.occurrenceId,language:"nb",spans:[{startFrame:0,endFrame:12,shape:"A"},{startFrame:12,endFrame:24,shape:"D"}],source:{text:mouthText(s,clip.blockId,"nb"),blockRevision:s.blocks[clip.blockId]?.revision??1,audioSignature:mouthAudioSignature(s,clip.id),setSystem:"rhubarb",algorithm:"ptg4-text-1"},removed:false};
  return{s,set,track};
}
function apply(s:ProjectState,c:Command){const r=applyCommand(s,envelope(c));if(!r.ok)throw new Error(r.error.message);return r;}
describe("PTG4",()=>{
  it("X-sheet uses the stored mouth at each exposure and preserves stale cues",()=>{
    const {s,set,track}=base(),state=apply(apply(s,{type:"SaveMouthSet",set}).state,{type:"SaveMouthTrack",track}).state;
    const occ=state.occurrences[track.occurrenceId];if(!occ)throw new Error("occurrence");
    const doc=buildInterchange(state,{productionId:occ.productionId,occurrenceIds:[occ.id],language:"nb"});
    const rows=buildXsheets(state,doc,{layerStart:n=>n,layerEnd:n=>n}).get(occ.id)??[];
    expect(rows.some(r=>r.mouth.includes(": A"))).toBe(true);
    const block=state.blocks[track.blockId];if(!block)throw new Error("block");
    const stale={...state,blocks:{...state.blocks,[block.id]:{...block,text:"new line"}}};
    const shot=doc.shots[0];if(!shot)throw new Error("shot");
    expect(shotMouthTracks(stale,doc,shot)[0]?.stale).toBe(true);
    expect(shotMouthTracks(stale,doc,shot)[0]?.cues).toEqual(shotMouthTracks(state,doc,shot)[0]?.cues);
  });
  it("original NB NoFaBet and CMU ARPAbet lookup",()=>{expect(pronunciation("pappa","nb")).toEqual({dictionary:true,phones:["P","AH2","P","AH0"]});expect(pronunciation("hello","en")).toEqual({dictionary:true,phones:["HH","AH0","L","OW1"]});});
  it("unknown words use deterministic local fallback",()=>{expect(pronunciation("sjavø","nb")).toEqual({dictionary:false,phones:["SJ","AH","V","OE"]});expect(pronunciation("thaz","en")).toEqual({dictionary:false,phones:["TH","AE","Z"]});});
  it("phonemes map to both approved systems",()=>{expect(phonemeMouth("M","nb","rhubarb")).toBe("A");expect(phonemeMouth("F","nb","rhubarb")).toBe("G");expect(phonemeMouth("L","nb","rhubarb")).toBe("H");expect(phonemeMouth("M","en","preston-blair")).toBe("MBP");expect(mouthShapes("rhubarb")).toEqual(["A","B","C","D","E","F","G","H","X"]);});
  for(const [fps,step,end]of [[24,1,24],[25,1,25],[24,2,24]]as const)it(`golden ${fps}fps step ${step}`,()=>{
    const result=draftMouthSpans([{text:"pappa",startMs:0,endMs:1000}],"nb","rhubarb",{num:fps,den:1},step);
    expect(result).toEqual([{startFrame:0,endFrame:6,shape:"A"},{startFrame:6,endFrame:step===1&&fps===25?13:12,shape:"D"},{startFrame:step===1&&fps===25?13:12,endFrame:step===1&&fps===25?19:18,shape:"A"},{startFrame:step===1&&fps===25?19:18,endFrame:end,shape:"D"}]);
    expect(validMouthSpans(result,"rhubarb")).toBe(true);
  });
  it("absolute boundaries and gaps preserve known timings",()=>{expect(mouthBoundary(500,{num:25,den:1},1)).toBe(13);expect(draftMouthSpans([{text:"a",startMs:null,endMs:null}],"en","rhubarb",{num:24,den:1})).toEqual([]);expect(draftMouthSpans([{text:"a",startMs:1000,endMs:1004}],"en","rhubarb",{num:24,den:1},2)).toEqual([]);});
  it("boundary, split and merge preserve range and invert",()=>{const s=[{startFrame:0,endFrame:12,shape:"A"as const},{startFrame:12,endFrame:24,shape:"D"as const}];expect(moveMouthBoundary(s,1,10)).toEqual([{startFrame:0,endFrame:10,shape:"A"},{startFrame:10,endFrame:24,shape:"D"}]);expect(mergeMouthSpans(splitMouthSpan(s,0,6),0)).toEqual(s);expect(moveMouthBoundary(s,1,24)).toEqual(s);});
  it("set command, inverse and redo, plus storage row",()=>{const{s,set}=base(),one=apply(s,{type:"SaveMouthSet",set});expect(one.state.mouthSets[set.id]?.revision).toBe(1);const undo=apply(one.state,one.inverse);expect(undo.state.mouthSets[set.id]).toBeUndefined();const redo=apply(undo.state,undo.inverse);expect(redo.state.mouthSets[set.id]).toEqual(one.state.mouthSets[set.id]);expect(diffStates(s,one.state).inserts["mouth_sets"]?.[0]?.["character_id"]).toBe(set.characterId);});
  it("track command and manual edit each undo and redo",()=>{const{s,set,track}=base(),withSet=apply(s,{type:"SaveMouthSet",set}).state,one=apply(withSet,{type:"SaveMouthTrack",track});expect(one.state.mouthTracks[track.id]?.spans).toEqual(track.spans);expect(apply(one.state,one.inverse).state.mouthTracks[track.id]).toBeUndefined();const edit=apply(one.state,{type:"SaveMouthTrack",track:{...track,spans:splitMouthSpan(track.spans,0,6)}});const undo=apply(edit.state,edit.inverse);expect(undo.state.mouthTracks[track.id]?.spans).toEqual(track.spans);expect(apply(undo.state,undo.inverse).state.mouthTracks[track.id]?.spans).toEqual(edit.state.mouthTracks[track.id]?.spans);});
  it("invalid sets, variants and overlapping spans are rejected",()=>{const{s,set,track}=base();expect(()=>apply(s,{type:"SaveMouthSet",set:{...set,variants:{A:id(99)}}})).toThrow();const withSet=apply(s,{type:"SaveMouthSet",set}).state;expect(()=>apply(withSet,{type:"SaveMouthTrack",track:{...track,spans:[{startFrame:0,endFrame:12,shape:"A"},{startFrame:6,endFrame:20,shape:"D"}]}})).toThrow();});
  it("script and audio drift are computed; no automatic regeneration",()=>{const{s,set,track}=base();const state=apply(apply(s,{type:"SaveMouthSet",set}).state,{type:"SaveMouthTrack",track}).state;expect(mouthTrackStale(state,track)).toBe(false);const b=state.blocks[track.blockId];if(!b)throw new Error("block");expect(mouthTrackStale({...state,blocks:{...state.blocks,[b.id]:{...b,revision:b.revision+1,text:"changed"}}},track)).toBe(true);const c=state.audioClips[track.clipId];if(!c)throw new Error("clip");expect(mouthTrackStale({...state,audioClips:{...state.audioClips,[c.id]:{...c,offsetMs:c.offsetMs+100}}},track)).toBe(true);expect(state.mouthTracks[track.id]?.spans).toEqual(track.spans);});
  it("Moho is one-based Papagayo, with rest in gaps",()=>{expect(mohoDat({id:id(2),characterId:id(1),character:"Maja",system:"rhubarb",stale:false,cues:[{frame:0,endFrame:2,shape:"A"},{frame:4,endFrame:6,shape:"G"}]},8)).toBe("MohoSwitch1\n1 MBP\n3 rest\n5 FV\n7 rest\n9 rest\n");});
  it("export uses PTG shot names, handles and exposure counts",()=>{const{s,set,track}=base(),state=apply(apply(s,{type:"SaveMouthSet",set}).state,{type:"SaveMouthTrack",track}).state;const occurrence=state.occurrences[track.occurrenceId];if(!occurrence)throw new Error("occurrence");const exportState={...state,project:{...state.project,fps:{num:24,den:1}},occurrences:{...state.occurrences,[occurrence.id]:{...occurrence,plannedMs:1000,activeTakeId:null,transition:{kind:"cut" as const,frames:0,overlap:false}}},takes:{},clipParts:{}};const doc=buildInterchange(exportState,{productionId:occurrence.productionId,occurrenceIds:[occurrence.id],language:"nb",capture:{mode:"twos",fps:{num:12,den:1}}});const shot=doc.shots.find(x=>x.id===track.occurrenceId);if(!shot)throw new Error("shot");const tracks=shotMouthTracks(state,doc,shot);expect(JSON.parse(mouthJson(doc,shot,tracks)).shot).toBe(shot.name);expect(tracks[0]?.cues[0]?.frame).toBe(0);expect(mouthList(state,doc).reduce((n,r)=>n+r.count,0)).toBe(12);});
});