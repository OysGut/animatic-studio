/** B-050 review and cost confirmation. Fixed replies only, no real AI calls. */
import { harness } from "./mts-harness.mjs";
const h=harness("/tmp/browser/c/p5");
const occ=h.rows.scene_occurrences.find(o=>o.active&&h.rows.script_blocks.filter(b=>b.variant_id===o.variant_id&&b.kind!=="heading"&&!b.removed).length>=3);
if(!occ)throw new Error("Missing scene");
const blocks=h.rows.script_blocks.filter(b=>b.variant_id===occ.variant_id&&b.kind!=="heading"&&!b.removed).slice(0,3);
const targets=blocks.map((b,i)=>({id:`00000000-0000-7000-8000-0000000064${String(i).padStart(2,"0")}`,project_id:h.fx.project.id,revision:1,block_id:b.id,variant_id:null,language:"en",text:`English line ${i}`,based_on_rev:b.current_rev,status:"uncertain",removed:false}));
h.rows.translations=targets;
// B-050: one imported English line without a rule pair, and one manual link whose Norwegian line no longer exists (stale).
h.rows.translation_lines=[{id:"00000000-0000-7000-8000-000000006480",project_id:h.fx.project.id,variant_id:occ.variant_id,language:"en",ord:9,kind:"action",text:"Unpaired English line",removed:false,revision:1}];
h.rows.translation_line_links=[{id:"00000000-0000-7000-8000-000000006490",project_id:h.fx.project.id,variant_id:occ.variant_id,language:"en",source_block_ids:["00000000-0000-7000-8000-0000000064ff"],target_translation_ids:["00000000-0000-7000-8000-000000006480"],origin:"manual",confidence:1,reason:"",removed:false,revision:1}];
for(const lang of ["nb","en"])await h.scenario(`p5-${lang}`,occ.id,lang,async page=>{
  await page.goto(h.base+h.P+"/manus");
  let paidCalls=0;
  await page.route("**/_serverFn/**",async route=>{
    let name="";try{name=JSON.parse(Buffer.from(decodeURIComponent(new URL(route.request().url()).pathname.split("/_serverFn/")[1]),"base64url").toString()).export;}catch{}
    if(!/^alignTranslationLines/.test(name))return route.fallback();
    const body=route.request().postData()??"";
    if(body.includes("confirmed")&&body.includes("fingerprint")&&body.includes("mock-fingerprint")) {
      paidCalls++;
      return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({result:{ok:true,estimate:false,links:[{variantId:occ.variant_id,language:"en",sourceBlockIds:[blocks[0].id],targetTranslationIds:targets.slice(0,2).map(t=>t.id),origin:"ai",confidence:0.92,reason:"Mock 1:n evidence"}],discarded:1},context:{}})});
    }
    return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({result:{ok:true,estimate:true,costUsd:0,servicePaid:true,fingerprint:"mock-fingerprint",lines:3,profileName:null},context:{}})});
  });
  await page.getByRole("combobox",{name:lang==="nb"?"Manusspråk":"Script language",exact:true}).selectOption("en");
  await page.locator(`[data-block="${blocks[0].id}"]`).first().click();
  await page.getByTestId("line-links-open").click();
  const dialog=page.getByTestId("line-links-dialog");
  h.check(await dialog.getByTestId("line-link-row").count()===4,"rules appear before AI, with the saved link");
  h.check(await dialog.getByTestId("line-link-stale").count()===1,"stale link is flagged, not hidden");
  h.check(await dialog.getByTestId("line-links-unpaired").count()===1,"unpaired imported line is counted");
  h.check(await dialog.getByTestId("line-links-targets").locator("option",{hasText:"Unpaired English line"}).count()===1,"unpaired line can be linked manually");
  await page.getByTestId("line-links-estimate").click();
  await page.getByTestId("line-links-cost").waitFor();
  h.check(paidCalls===0,"no AI call before confirmation");
  await dialog.screenshot({path:`${h.out}/cost-${lang}.png`});
  await page.getByTestId("line-links-confirm").click();
  await page.getByTestId("line-link-proposal").waitFor();
  h.check(paidCalls===1,"one confirmed scene analysis");
  h.check(await page.getByTestId("line-links-discarded").count()===1,"discard count visible");
  h.check(!h.state.commands.some(c=>c.type==="ApproveLineLinks"),"suggestions not applied automatically");
  await dialog.screenshot({path:`${h.out}/review-${lang}.png`});
  await page.getByTestId("line-links-filter").selectOption("ai");
  h.check(await dialog.getByTestId("line-link-row").count()===0,"source filter");
  await page.getByTestId("line-links-approve-threshold").click();
  await h.eventually(()=>h.state.commands.some(c=>c.type==="ApproveLineLinks"),5000);
  const cmd=h.state.commands.find(c=>c.type==="ApproveLineLinks");
  h.check(cmd?.additions?.length===1&&cmd.additions[0].fields.targetTranslationIds.length===2,"1:n approval in one command");
  await page.getByTestId("line-links-filter").selectOption("approved");
  h.check(await dialog.getByTestId("line-link-row").count()===1,"approved provenance reads back");
  await dialog.screenshot({path:`${h.out}/approved-${lang}.png`});
});
await h.finish();
