/** Fixed synthetic inputs; server and storage mocked by existing harness. */
import { harness } from './mts-harness.mjs';
const h=harness('/tmp/browser/sb4/screenshots');
h.hooks.navigate=async page=>{
 await page.getByTestId('ui-id').first().waitFor({timeout:30000});
 await page.evaluate(path=>{history.pushState({},'',path);window.dispatchEvent(new PopStateEvent('popstate'));},`${h.P}/storyboard`);
 await page.getByTestId('sb4-gallery-playback').waitFor({timeout:60000});
};
for(const lang of ['nb','en']){
 await h.scenario(`sb4-${lang}`,h.fx.occurrenceId,lang,async page=>{
  await page.context().addCookies([{name:'ptg-ui-language',value:lang,url:h.base}]);
  await page.getByTestId('sb4-gallery-playback').waitFor();
  const scrub=page.getByTestId('sb4-scrub').first();await scrub.focus();
  await scrub.press('End');h.check(Number(await scrub.getAttribute('aria-valuenow'))>0,`${lang}: tastatur scrubbing flytter tiden`);
  h.check((await page.getByTestId('sb4-gallery-play').getAttribute('aria-label'))===(lang==='nb'?'Spill av':'Play'),`${lang}: scrubbing starter ikke lyd`);
  await page.getByTestId('sb4-gallery-play').click();
  h.check(await h.eventually(async()=>await page.getByTestId('sb4-gallery-play').getAttribute('aria-label')===(lang==='nb'?'Sett på pause':'Pause'),3000),`${lang}: avspilling startet`);
  await scrub.press('Home');await page.waitForTimeout(100);
  h.check((await page.getByTestId('sb4-gallery-play').getAttribute('aria-label'))===(lang==='nb'?'Spill av':'Play'),`${lang}: scrubbing stopper avspilling`);
  await page.screenshot({path:`${h.out}/${lang}.png`});
  await page.evaluate(path=>{history.pushState({},'',path);window.dispatchEvent(new PopStateEvent('popstate'));},`${h.P}/scene?scene=${h.fx.occurrenceId}&panel=${h.fx.panelId}`);
  await page.getByTestId('sb4-panel-audio').waitFor({timeout:20000});
  await page.getByTestId('sb4-audio-timing').click();
  h.check(await h.eventually(()=>h.state.commands.some(c=>c.type==='UpdateStoryboardPanel')),`${lang}: lydvarighet kan sette paneltiming`);
  await page.getByTestId('sb4-use-scene').click();
  h.check(!h.state.commands.some(c=>c.type==='AddAudioClips'),`${lang}: ingen innblanding før bekreftelse`);
  await page.getByTestId('sb4-mix-confirm').click();
  h.check(await h.eventually(()=>h.state.commands.some(c=>c.type==='AddAudioClips')),`${lang}: bekreftelse bruker lyden i scenen`);
  await page.screenshot({path:`${h.out}/audio-${lang}.png`});
 });
}
await h.finish();
