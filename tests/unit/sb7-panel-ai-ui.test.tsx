import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setLanguage, orderedOccurrences, applyCommand, layersOf, type Command } from "@/core";
import { seedProject, mustApply, tid } from "../helpers/fixtures";
import type { Commands } from "@/app/project/use-commands";
Object.defineProperty(HTMLElement.prototype,"scrollIntoView",{configurable:true,value:vi.fn()});
const { estimate, generate, adopt, recover }=vi.hoisted(()=>({estimate:vi.fn(),generate:vi.fn(),adopt:vi.fn(),recover:vi.fn()}));
vi.mock("@tanstack/react-start",()=>({useServerFn:(fn:unknown)=>fn}));
vi.mock("@/adapters/ai/storyboard.functions",()=>({estimateStoryboardAi:estimate,generateStoryboardAi:generate,recoverStoryboardCandidate:recover}));
vi.mock("@/app/project/use-commands",()=>({adoptServerHistory:adopt}));
vi.mock("@/app/storyboard/ai-images",()=>({rasterPanelInput:vi.fn(),fitCandidateImage:vi.fn()}));
vi.mock("@/app/ai/use-project-providers",()=>({useProjectProviders:()=>({data:{providers:["openai"]}})}));
vi.mock("@/app/library/asset-images",()=>({useImageUrls:()=>({data:{}})}));
vi.mock("@/app/mobile/MobileImportDialog",()=>({MobileImportDialog:()=>null}));
import { PanelAi } from "@/app/storyboard/PanelAi";
import { panelCandidateLayer } from "@/core/storyboard/ai";
import { envelope } from "../helpers/fixtures";
function setup(){const seed=seedProject(1);const o=orderedOccurrences(seed.state,seed.mainId)[0];if(!o)throw Error("fixture");const id=tid<"composition">();const s=mustApply(seed.state,{type:"AddStoryboardPanel",panelId:id,occurrenceId:o.id,variantId:o.variantId,orderKey:"a1"});const run=vi.fn();const cmds={run,whenIdle:async()=>{},current:()=>s} as unknown as Commands;const p=s.compositions[id];if(!p)throw Error("panel");render(<PanelAi state={s} panel={p} editable cmds={cmds} mask="project"/>);return {run};}
describe("SB-7 fake provider cost gate",()=>{
 beforeEach(()=>{estimate.mockReset();generate.mockReset();estimate.mockResolvedValue({ok:true,cost:0.25,studyCost:0.05,quoteHash:"quote"});generate.mockResolvedValue({ok:true,text:"A figure waits by the door."});});
 for(const language of ["nb","en"] as const)it(`${language}: estimation does not generate; confirmation does not auto-apply description`,async()=>{setLanguage(language);const {run}=setup();fireEvent.change(screen.getByRole("combobox",{name:language==="nb"?"Oppgave":"Task"}),{target:{value:"describe"}});fireEvent.click(screen.getByRole("button",{name:language==="nb"?"Vis kostnadsanslag":"Show cost estimate"}));await screen.findByTestId("sb7-cost");expect(generate).not.toHaveBeenCalled();expect(screen.getByTestId("sb7-cost").textContent).toContain("0.2500");expect(screen.getByTestId("sb7-cost").textContent).toContain("0.0500");fireEvent.click(screen.getByRole("button",{name:language==="nb"?"Bekreft kostnad og generer":"Confirm cost and generate"}));await waitFor(()=>expect(generate).toHaveBeenCalledTimes(1));expect(generate.mock.calls[0]?.[0].data).toMatchObject({approved:true,maxCost:0.25,quoteHash:"quote",action:"describe"});await screen.findByDisplayValue("A figure waits by the door.");expect(run).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:language==="nb"?"Bekreft og bruk":"Confirm and use"}));expect(run.mock.calls[0]?.[0]).toMatchObject({type:"SetStoryboardDetails",details:{fields:{description:"A figure waits by the door."}}});});
});

describe("SB-7 image receipt end-to-end with fake runner", () => {
 for (const lang of ["nb", "en"] as const) it(`${lang}: quote → receipt → hidden candidate → explicit acceptance`, async () => {
  setLanguage(lang); const seed=seedProject(1),o=orderedOccurrences(seed.state,seed.mainId)[0]; if(!o)throw Error("fixture"); const panelId=tid<"composition">();let state=mustApply(seed.state,{type:"AddStoryboardPanel",panelId,occurrenceId:o.id,variantId:o.variantId,orderKey:"a1"});const p=state.compositions[panelId];if(!p)throw Error("panel");
  const sent:Command[]=[];const cmds={whenIdle:async()=>{},current:()=>state,runAndWait:async(c:Command)=>{sent.push(c);state=mustApply(state,c);return{error:null};}} as unknown as Commands;
  const versionId=tid<"asset_version">(),jobId=tid<"generation_job">();const media={path:`${state.project.id}/fake.png`,mimeType:"image/png",width:1024,height:1024,byteSize:100,sha256:"a".repeat(64),durationMs:null};
  estimate.mockResolvedValue({ok:true,cost:.25,studyCost:0,quoteHash:"image-quote"});adopt.mockClear();generate.mockImplementation(async({data})=>{const variant=Object.values(state.assetVariants).find(v=>v.assetId===data.assetId);if(!variant)throw Error("variant");const history=[];for(const c of [{type:"AddAssetVersion",versionId,variantId:variant.id,media,note:JSON.stringify({panelId,jobId})} as Command,panelCandidateLayer(state,p,data.assetId,variant.id,versionId)]){const e=envelope(c),r=applyCommand(state,e);if(!r.ok)throw Error(r.error.message);state=r.state;history.push({commandId:e.id,inverse:r.inverse,affected:r.affected,group:versionId});}return{ok:true,candidates:[{versionId,jobId,media,trace:{panelId,jobId,output:{adaptation:"native",ratio:1}},history}]};});
  render(<PanelAi state={state} panel={p} editable cmds={cmds} mask="1:1"/>);
  fireEvent.click(screen.getByRole("button",{name:lang==="nb"?"Vis kostnadsanslag":"Show cost estimate"}));await screen.findByTestId("sb7-cost");expect(sent).toHaveLength(0);
  fireEvent.click(screen.getByRole("button",{name:lang==="nb"?"Bekreft kostnad og generer":"Confirm cost and generate"}));const accept=await screen.findByRole("button",{name:lang==="nb"?"Bekreft og bruk":"Confirm and use"});expect(layersOf(state,panelId).find(l=>l.versionId===versionId)?.visible).toBe(false);expect(adopt).toHaveBeenCalledWith(state.project.id,expect.arrayContaining([expect.objectContaining({group:versionId})]),expect.any(String));
  fireEvent.click(accept);await waitFor(()=>expect(layersOf(state,panelId).find(l=>l.versionId===versionId)?.visible).toBe(true));expect(generate.mock.calls.at(-1)?.[0].data).toMatchObject({approved:true,maxCost:.25,quoteHash:"image-quote"});
 });
});