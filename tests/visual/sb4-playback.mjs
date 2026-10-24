/** Fixed synthetic inputs; server and storage mocked by existing harness. */
import { harness } from './mts-harness.mjs';
const h=harness('/tmp/browser/sb4/screenshots');
h.hooks.navigate=async page=>{
 await page.goto(`${h.base}${h.P}/storyboard`,{waitUntil:'domcontentloaded'}).catch(error=>{if(!String(error).includes('ERR_ABORTED'))throw error;});
 await page.getByTestId('sb4-gallery-playback').waitFor({timeout:60000});
};
for(const lang of ['nb','en']){
 await h.scenario(`sb4-${lang}`,h.fx.occurrenceId,lang,async page=>{
  await page.goto(`${h.base}${h.P}/storyboard`,{waitUntil:'networkidle'});
  await page.getByTestId('sb4-gallery-playback').waitFor();
  const scrub=page.getByTestId('sb4-scrub').first();await scrub.focus();
  await scrub.press('End');h.check(Number(await scrub.getAttribute('aria-valuenow'))>0,`${lang}: tastatur scrubbing flytter tiden`);
  h.check((await page.getByTestId('sb4-gallery-play').getAttribute('aria-label'))===(lang==='nb'?'Spill av':'Play'),`${lang}: scrubbing starter ikke lyd`);
  await page.getByTestId('sb4-gallery-play').click();
  await page.waitForTimeout(200);
  h.check((await page.getByTestId('sb4-gallery-play').getAttribute('aria-label'))===(lang==='nb'?'Pause':'Pause'),`${lang}: avspilling startet`);
  await scrub.press('Home');await page.waitForTimeout(100);
  h.check((await page.getByTestId('sb4-gallery-play').getAttribute('aria-label'))===(lang==='nb'?'Spill av':'Play'),`${lang}: scrubbing stopper avspilling`);
  await page.screenshot({path:`${h.out}/${lang}.png`});
 });
}
await h.finish();
