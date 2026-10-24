// @vitest-environment node
import { describe, it, expect } from "vitest";
import { orderedOccurrences, defaultLayerFields, layersOf, applyCommand, type ProjectState, type ProviderModel } from "@/core";
import { automaticPanelBasis, panelAiCapabilities, panelInstructions, buildPanelAiInput, panelCandidateLayer, panelAspect } from "@/core/storyboard/ai";
import { seedProject, mustApply, tid, envelope } from "../helpers/fixtures";
function setup() { const seed = seedProject(1); const o = orderedOccurrences(seed.state, seed.mainId)[0]; if (!o) throw Error("fixture"); const id = tid<"composition">(); const s = mustApply(seed.state, { type: "AddStoryboardPanel", panelId: id, occurrenceId: o.id, variantId: o.variantId, orderKey: "a1" }); return { s, id }; }
function image(s: ProjectState, panelId: string, kind: "character" | "other") {
 const assetId = tid<"asset">(), variantId = tid<"asset_variant">(), versionId = tid<"asset_version">();
 s = mustApply(s,{ type:"CreateAssets",assets:[{assetId,fields:{kind,name:"Hero",names:[],description:"",category:"",tags:[]}}] });
 s = mustApply(s,{ type:"CreateAssetVariant",assetId,variantId,fields:{name:"Base",style:"other",appearance:""} });
 s = mustApply(s,{ type:"AddAssetVersion",variantId,versionId,media:{path:`${s.project.id}/${assetId}/${versionId}/image.png`,mimeType:"image/png",byteSize:100,sha256:"b".repeat(64),width:100,height:100,durationMs:null},note:"" });
 const p=s.compositions[panelId];if(!p)throw Error("panel");
 s=mustApply(s,{type:"AddLayers",layers:[{layerId:tid<"composition_layer">(),compositionId:p.id,fields:{...defaultLayerFields(s,p,{assetId,assetVariantId:variantId}),versionId}}]});
 return {s,assetId,variantId,versionId};
}
describe("SB-7 panel AI rules",()=>{
 it("empty panel uses script",()=>{const {s,id}=setup();expect(automaticPanelBasis(s,s.compositions[id] as never)).toBe("script");});
 it("single sketch uses image input",()=>{const {s,id}=setup();const a=image(s,id,"other");expect(automaticPanelBasis(a.s,a.s.compositions[id] as never)).toBe("sketch");});
 it("character composition uses resource staging",()=>{const {s,id}=setup();const a=image(s,id,"character");expect(automaticPanelBasis(a.s,a.s.compositions[id] as never)).toBe("composition");});
 it("directions are text and visual notes require opt-in",()=>{let {s,id}=setup();const p=s.compositions[id];if(!p)throw Error("panel");for(const [text,noteType] of [["walk to door","direction"],["red banner","visual"]] as const)s=mustApply(s,{type:"AddLayers",layers:[{layerId:tid<"composition_layer">(),compositionId:id,fields:{...defaultLayerFields(s,p,{fill:p.background}),kind:"note",fill:null,note:{text,noteType,color:p.background,handled:false,anchor:null}}}]});expect(panelInstructions(s,p,false).join(" ")).toContain("walk to door");expect(panelInstructions(s,p,false).join(" ")).not.toContain("red banner");expect(panelInstructions(s,p,true).join(" ")).toContain("red banner");const built=buildPanelAiInput(s,p,{basis:"script",style:"line",visualNotes:false,sketchVersionId:null,references:[],mask:"project"});expect(built.references).toHaveLength(0);expect(built.text).toContain("Do not draw arrows");});
 it("candidate is hidden; original stays and undo removes only candidate",()=>{const {s,id}=setup();const a=image(s,id,"character");const p=a.s.compositions[id];if(!p)throw Error("panel");const command=panelCandidateLayer(a.s,p,a.assetId,a.variantId,a.versionId);const r=applyCommand(a.s,envelope(command));expect(r.ok).toBe(true);if(!r.ok)return;expect(layersOf(r.state,id)).toHaveLength(2);expect(layersOf(r.state,id).filter(l=>l.visible)).toHaveLength(1);const undo=mustApply(r.state,r.inverse);expect(layersOf(undo,id)).toHaveLength(1);});
 it("model without image support hides image controls and caps references concretely",()=>{const m={acceptsImage:false,maxInputImages:8} as ProviderModel;expect(panelAiCapabilities(m)).toEqual({imageToImage:false,references:0,sketch:false,mask:false});expect(panelAiCapabilities({...m,acceptsImage:true,maxInputImages:3}).references).toBe(3);});
 it("mask aspect matches selected panel ratio",()=>{const {s,id}=setup();const p=s.compositions[id];if(!p)throw Error("panel");expect(panelAspect(p,"9:16")).toBe(9/16);expect(panelAspect(p,"2.39")).toBe(2.39);});
});