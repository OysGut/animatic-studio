/** C-1: return page (/r/$token) and signed-in return (/retur), nb/en, desktop, iPad and mobile. Mocked server functions; nothing is saved.
 *   bun tests/visual/make-mts-fixture.ts /tmp/claude-0/mts-fixture.json
 *   ENV_FILE=… node tests/visual/c1-handoff.mjs http://127.0.0.1:8080 /tmp/claude-0/mts-fixture.json
 */
import { writeFileSync } from 'node:fs';
import { harness } from './mts-harness.mjs';
import { VISUAL_SCHEMA_VERSION } from './schema-version.mjs';
const h=harness('/tmp/browser/c1');
const HID='0190a000-0000-7000-8000-00000000c101';
const TOKEN='ptgh_'+'A'.repeat(43);
// PNG with the hand-off marker in a tEXt chunk (enough for the browser-side marker search and the mocked server).
const marked=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.from(`tEXtptg:handoff\0ptg-handoff:v1:${HID}`)]);
const plain=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3,4]);
writeFileSync('/tmp/browser/c1-marked.png',marked);writeFileSync('/tmp/browser/c1-plain.png',plain);
const calls=[];
h.hooks.navigate=async(page,path)=>{await page.getByTestId('ui-id').first().waitFor({timeout:30000});await page.evaluate(path=>{history.pushState({},'',path);window.dispatchEvent(new PopStateEvent('popstate'));},path);};
h.hooks.rest=table=>table==='schema_version'?[{version:Math.max(110,VISUAL_SCHEMA_VERSION)}]:undefined;
h.hooks.serverFn=(name,d)=>{
 calls.push(name);
 if(/^returnInfo/.test(name))return{targetKind:'panel',format:'psd',fileName:'Panel-3.psd',expiresAt:'2030-01-01T00:00:00Z'};
 if(/^returnBegin/.test(name))return{transferId:'00000000-0000-4000-8000-0000000000t1'};
 if(/^returnChunk/.test(name))return true;
 if(/^returnFinish/.test(name))return{versionId:'v',conflict:false,targetKind:'panel'};
 if(/^listHandoffs/.test(name))return[];
};
const sizes={desktop:{width:1280,height:1800},ipad:{width:820,height:1180},mobile:{width:390,height:844}};
for(const lang of ['nb','en'])await h.scenario(`c1-${lang}`,h.fx.occurrenceId,lang,async page=>{
 const nb=lang==='nb';
 await page.context().addCookies([{name:'ptg-ui-language',value:lang,url:h.base}]);
 for(const [dev,vp] of Object.entries(sizes)){
  await page.setViewportSize(vp);
  await h.hooks.navigate(page,`/r/${TOKEN}`);
  await page.getByTestId('return-info').waitFor({timeout:30000});
  h.check((await page.getByTestId('return-info').textContent()).includes('Panel-3.psd'),`${lang}/${dev}: return page names the file`);
  calls.length=0;
  await page.getByTestId('return-file').setInputFiles('/tmp/browser/c1-marked.png');
  await page.getByTestId('return-ok').waitFor({timeout:30000});
  h.check((await page.getByTestId('return-ok').textContent()).includes(nb?'kandidatversjon':'candidate version'),`${lang}/${dev}: upload becomes a candidate`);
  h.check(calls.some(c=>/^returnFinish/.test(c))&&!calls.some(c=>/approve|runCommand/i.test(c)),`${lang}/${dev}: no approval call`);
  h.check(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`${lang}/${dev}: fits screen`);
  await page.screenshot({path:`${h.out}/return-${dev}-${lang}.png`});
 }
 await page.setViewportSize(sizes.desktop);
 await h.hooks.navigate(page,'/retur');
 await page.getByTestId('return-file').waitFor({timeout:30000});
 calls.length=0;
 await page.getByTestId('return-file').setInputFiles('/tmp/browser/c1-plain.png');
 await page.getByTestId('return-error').waitFor({timeout:30000});
 h.check(!calls.some(c=>/^returnBegin/.test(c)),`${lang}: file without marker is refused before upload (never by file name)`);
 await page.screenshot({path:`${h.out}/retur-refused-${lang}.png`});
});
h.finish();
