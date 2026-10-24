// @vitest-environment node
import { describe,it,expect } from "vitest";
import { orderedOccurrences, EMPTY_PANEL_DETAILS, remapValue } from "@/core";
import { buildInterchange } from "@/core/interchange";
import { editorialOtio,editorialXml,editorialEdl,editorialClip } from "@/core/interchange/editorial";
import { filmClips } from "@/core/assembly/film";
import { exportImageSource } from "@/core/storyboard/playback";
import { seedProject,tid,mustApply } from "../helpers/fixtures";
describe("SB9 panel exports",()=>{
 it("two panels in one occurrence remain distinct shots with transitions in OTIO XML EDL",()=>{
  const seed=seedProject(2),o=orderedOccurrences(seed.state,seed.mainId)[0];if(!o)throw Error("fixture");
  let s=seed.state;const a=tid<"composition">(),b=tid<"composition">();
  for(const [id,order]of [[a,"a1"],[b,"a2"]] as const)s=mustApply(s,{type:"AddStoryboardPanel",panelId:id,occurrenceId:o.id,variantId:o.variantId,orderKey:order,durationFrames:100});
  s=mustApply(s,{type:"SetStoryboardDetails",panelId:b,details:{...EMPTY_PANEL_DETAILS,transition:{kind:"wipe",frames:12,overlap:true,direction:"left"}}});
  const doc=buildInterchange(s,{productionId:seed.mainId,language:"en",occurrenceIds:[o.id],imageSource:"storyboard"});
  expect(doc.shots.map(sh=>sh.id)).toEqual([a,b]);expect(doc.shots[1]?.transition).toMatchObject({type:"wipe",direction:"left",lengthFrames:12});
  const adapted=exportImageSource(s,filmClips(s,seed.mainId).filter(c=>c.occurrenceId===o.id),"storyboard");
  const second=doc.shots[1];if(!second)throw Error("shot");expect(editorialClip(adapted.clips,second)[0]?.compositionId).toBe(b);
  expect(editorialOtio(doc)).toContain('"direction": "left"');expect(editorialXml(doc)).toContain("<effectid>Wipe</effectid>");expect(editorialEdl(doc)).toContain("W001 012");expect(editorialEdl(doc)).toContain("* PTG TRANSITION: wipe left");
 });
 it("backup remaps asset IDs inside blocking and panel IDs in approval keys",()=>{const old=tid(),fresh=tid(),asset=tid(),newAsset=tid();const mapped=remapValue({blocking:{characters:[{id:asset}],axis:[asset],approvals:{[`${old}|axis|123`]:"Intentional"}}},new Map([[old,fresh],[asset,newAsset]]));expect(mapped.blocking.characters[0]?.id).toBe(newAsset);expect(mapped.blocking.approvals[`${fresh}|axis|123`]).toBe("Intentional");});
});