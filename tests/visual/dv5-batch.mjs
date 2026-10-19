/** DV5: active-project coverage, cost approval and durable receipts; every service call is mocked. */
import { harness } from "./mts-harness.mjs";
const h=harness("/tmp/browser/dv5");
const clip=h.rows.audio_clips.find(c=>c.kind==="dialogue"&&c.block_id&&!c.removed);
const character=h.rows.assets.find(a=>a.kind==="character");
if(!clip||!character)throw new Error("fixture");
for(const lang of ["nb","en"])await h.scenario(`dv5-${lang}`,clip.occurrence_id,lang,async page=>{
  await page.goto(h.base+h.P+`/bibliotek?asset=${character.id}`);
  await page.getByTestId("dialogue-batch-open").click();
  await page.getByTestId("dialogue-batch-all").click();
  h.check(await page.getByTestId("dialogue-batch-line").count()>0,"coverage contains character lines");
  h.check(await page.getByTestId("dialogue-batch-warning").isVisible(),"existing audio warning visible");
  await page.getByTestId("dialogue-batch-together").check();
  await page.getByTestId("dialogue-batch-dialog").getByTestId("voice-select").selectOption("mock_voice");
  h.check(!h.state.rpcs.some(r=>r.name==="createDialogueBatch"),"no batch before approval");
  await page.getByTestId("dialogue-batch-start").click();
  h.check(await page.getByTestId("dialogue-batch-confirm").isVisible(),"explicit approval screen");
  await page.getByTestId("dialogue-batch-approve").click();
  h.check(await h.eventually(()=>h.state.rpcs.some(r=>r.name==="createDialogueBatch"),5000),"approval creates durable job");
  const request=h.state.rpcs.find(r=>r.name==="createDialogueBatch")?.body;
  h.check(request?.projectId===h.fx.project.id&&request?.characterId===character.id,"only active project and chosen character");
  h.check(new Set(request?.lines.map(l=>l.key)).size===request?.lines.length,"one item per line identity");
  h.check(request?.approved===true,"cost explicitly approved");
  h.check(await h.eventually(()=>page.getByTestId("dialogue-batch-progress").count().then(n=>n>0),5000),"per-line progress reads back");
  await page.getByTestId("dialogue-batch-dialog").screenshot({path:`${h.out}/${lang}.png`});
});
await h.finish();