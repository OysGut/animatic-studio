import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setLanguage, orderedOccurrences, type ProjectState } from "@/core";
import { seedProject, mustApply, tid } from "../helpers/fixtures";
import type { Commands } from "@/app/project/use-commands";
const { estimate, generate }=vi.hoisted(()=>({estimate:vi.fn(),generate:vi.fn()}));
vi.mock("@tanstack/react-start",()=>({useServerFn:(fn:unknown)=>fn}));
vi.mock("@/adapters/ai/storyboard.functions",()=>({estimateStoryboardAi:estimate,generateStoryboardAi:generate}));
vi.mock("@/app/ai/use-project-providers",()=>({useProjectProviders:()=>({data:{providers:["openai"]}})}));
vi.mock("@/app/library/asset-images",()=>({useImageUrls:()=>({data:{}})}));
import { PanelAi } from "@/app/storyboard/PanelAi";
function setup(){const seed=seedProject(1);const o=orderedOccurrences(seed.state,seed.mainId)[0];if(!o)throw Error("fixture");const id=tid<"composition">();const s=mustApply(seed.state,{type:"AddStoryboardPanel",panelId:id,occurrenceId:o.id,variantId:o.variantId,orderKey:"a1"});const run=vi.fn();const cmds={run,whenIdle:async()=>{},current:()=>s} as unknown as Commands;const p=s.compositions[id];if(!p)throw Error("panel");render(<PanelAi state={s} panel={p} editable cmds={cmds} mask="project"/>);return {run};}
describe("SB-7 fake provider cost gate",()=>{
 beforeEach(()=>{estimate.mockReset();generate.mockReset();estimate.mockResolvedValue({ok:true,cost:0.25,studyCost:0.05,quoteHash:"quote"});generate.mockResolvedValue({ok:true,text:"A figure waits by the door."});});
 for(const language of ["nb","en"] as const)it(`${language}: estimation does not generate; confirmation does not auto-apply description`,async()=>{setLanguage(language);const {run}=setup();fireEvent.change(screen.getByRole("combobox",{name:language==="nb"?"Oppgave":"Task"}),{target:{value:"describe"}});fireEvent.click(screen.getByRole("button",{name:language==="nb"?"Vis kostnadsanslag":"Show cost estimate"}));await screen.findByTestId("sb7-cost");expect(generate).not.toHaveBeenCalled();expect(screen.getByTestId("sb7-cost").textContent).toContain("0.2500");expect(screen.getByTestId("sb7-cost").textContent).toContain("0.0500");fireEvent.click(screen.getByRole("button",{name:language==="nb"?"Bekreft kostnad og generer":"Confirm cost and generate"}));await waitFor(()=>expect(generate).toHaveBeenCalledTimes(1));expect(generate.mock.calls[0]?.[0].data).toMatchObject({approved:true,maxCost:0.25,quoteHash:"quote",action:"describe"});await screen.findByDisplayValue("A figure waits by the door.");expect(run).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:language==="nb"?"Bekreft og bruk":"Confirm and use"}));expect(run.mock.calls[0]?.[0]).toMatchObject({type:"SetStoryboardDetails",details:{fields:{description:"A figure waits by the door."}}});});
});