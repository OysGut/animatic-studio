/** DV6: locale, manuscript language and speech language remain independent; mocked services only. */
import { harness } from "./mts-harness.mjs";
import { byLang } from "./ui-lang.mjs";
const h=harness("/tmp/browser/dv6");
const clip=h.rows.audio_clips.find(c=>c.kind==="dialogue"&&c.block_id&&!c.removed);
const character=h.rows.assets.find(a=>a.kind==="character");
if(!clip||!character)throw new Error("fixture");
for(const lang of ["nb","en"])await h.scenario(`dv6-${lang}`,clip.occurrence_id,lang,async page=>{
  await page.getByTestId("scene-script").locator(`[data-script-block="${clip.block_id}"] [data-script-text]`).dblclick();
  await page.getByTestId("project-script-language").fill("zh-Hant-TW");await page.getByTestId("project-script-language").blur();
  h.check(await h.eventually(()=>h.state.commands.some(c=>c.type==="SetDialogueLanguage"&&c.target==="project"&&c.language==="zh-Hant-TW")),"project language uses BCP-47 command");
  await page.getByTestId("line-speech-language").fill("es-MX");await page.getByTestId("line-speech-language").blur();
  h.check(await h.eventually(()=>h.state.commands.some(c=>c.type==="SetDialogueLanguage"&&c.target==="clip"&&c.language==="es-MX")),"spoken language independent from manuscript");
  h.check(!h.state.commands.some(c=>c.type==="UpdateDialogueVersionEdit"),"language settings never edit recordings");
  await page.getByTestId("record-audio-dialog").getByRole("button",{name:byLang(lang,"Avbryt","Cancel"),exact:true}).last().click();
  await page.goto(h.base+h.P+`/bibliotek?asset=${character.id}`);await page.getByTestId("dialogue-batch-open").click();await page.getByTestId("dialogue-batch-all").click();
  const tags=page.getByTestId("dialogue-batch-line-language");await tags.first().fill("no");if(await tags.count()>1)await tags.nth(1).fill("es");
  await page.getByTestId("dialogue-batch-split").check();
  for (const config of await page.getByTestId("dialogue-language-job").all()) await config.getByTestId("voice-select").selectOption("mock_voice");
  h.check(await page.getByTestId("dialogue-language-job").count()>=2,"one visible job configuration per language");
  h.check(!h.state.rpcs.some(r=>r.name==="createDialogueBatch"),"language detection never generates automatically");
  await page.getByTestId("dialogue-batch-start").click();await page.getByTestId("dialogue-batch-approve").click();
  h.check(await h.eventually(()=>h.state.rpcs.filter(r=>r.name==="createDialogueBatch").length>=2,5000),"split creates separate approved jobs");
  const requests=h.state.rpcs.filter(r=>r.name==="createDialogueBatch").map(r=>r.body);
  h.check(requests.every(r=>r.lines.every(l=>l.language===r.voice.language)),"each job preserves its own language");
  await page.getByTestId("dialogue-batch-dialog").screenshot({path:`${h.out}/${lang}.png`});
});
await h.finish();