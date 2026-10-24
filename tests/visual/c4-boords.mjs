/** C-4: Boords-innstillinger på kontosiden, nb/en, desktop/mobil. Mockede serverfunksjoner; ingen ekte Boords-kall.
 *   bun tests/visual/make-mts-fixture.ts /tmp/claude-0/mts-fixture.json
 *   ENV_FILE=… node tests/visual/c4-boords.mjs http://127.0.0.1:8080 /tmp/claude-0/mts-fixture.json
 */
import { harness } from './mts-harness.mjs';
import { VISUAL_SCHEMA_VERSION } from './schema-version.mjs';
const h=harness('/tmp/browser/c4');
const KEY='bk_live_SECRETSECRET1234';
const conns=[];const sent=[];
h.hooks.navigate=async(page,path)=>{await page.getByTestId('ui-id').first().waitFor({timeout:30000});await page.evaluate(path=>{history.pushState({},'',path);window.dispatchEvent(new PopStateEvent('popstate'));},path);};
h.hooks.rest=table=>table==='schema_version'?[{version:Math.max(112,VISUAL_SCHEMA_VERSION)}]:undefined;
h.hooks.serverFn=(name,d)=>{
 if(/^myBoordsConnections/.test(name))return conns;
 if(/^saveBoordsKey/.test(name)){sent.push(d);conns.splice(0,conns.length,{id:'00000000-0000-4000-8000-0000000000b1',ownerKind:'user',workspaceId:null,label:d.label,keyHint:'…'+d.key.slice(-4),status:'ok',statusMessage:null,lastSyncAt:null,webhook:!!d.webhookSecret});return{ok:true,message:'ok'};}
 if(/^removeBoordsKey/.test(name)){conns.splice(0);return true;}
 if(/^myConnectorSessions|^myOpenConnectorConflicts/.test(name))return[];
};
for(const lang of ['nb','en'])await h.scenario(`c4-${lang}`,h.fx.occurrenceId,lang,async page=>{
 const nb=lang==='nb';
 await page.context().addCookies([{name:'ptg-ui-language',value:lang,url:h.base}]);
 await h.hooks.navigate(page,'/konto');
 const card=page.getByTestId('c4-boords');await card.waitFor({timeout:30000});
 h.check((await card.getByTestId('c4-paid').innerText()).includes(nb?'betalt Boords-plan':'paid Boords plan'),`${lang}: paid plan notice`);
 h.check(await card.getByTestId('c4-limits').locator('li').count()===8,`${lang}: limits listed`);
 await card.getByTestId('c4-key').fill(KEY);await card.getByTestId('c4-webhook').fill('whsec_x');
 await card.getByTestId('c4-save').click();
 await card.getByTestId('c4-connection-row').waitFor();
 const text=await page.evaluate(()=>document.body.innerText+document.documentElement.outerHTML.replace(/value="[^"]*"/g,''));
 h.check(!text.includes(KEY),`${lang}: key never shown after save`);
 h.check((await card.getByTestId('c4-connection-row').innerText()).includes('…1234'),`${lang}: only last four characters`);
 h.check((await card.innerText()).includes('/api/public/boords/webhook/'),`${lang}: webhook address shown`);
 await card.screenshot({path:`${h.out}/boords-${lang}.png`});
 await page.setViewportSize({width:390,height:844});
 await card.screenshot({path:`${h.out}/boords-mobile-${lang}.png`});
 h.check(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`${lang}: mobile fits screen`);
 await page.setViewportSize({width:1280,height:1800});
 await card.getByRole('button',{name:nb?'Fjern':'Remove'}).click();
 await card.getByTestId('c4-connection-row').waitFor({state:'detached'});
 h.check(true,`${lang}: remove reads back`);
});
h.finish();
