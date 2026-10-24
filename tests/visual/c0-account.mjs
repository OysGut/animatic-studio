/** C-0: «Tilkoblede programmer» på kontosiden og godkjenningssiden, nb/en, desktop/mobil. Mockede serverfunksjoner; ingenting lagres.
 *   bun tests/visual/make-mts-fixture.ts /tmp/claude-0/mts-fixture.json
 *   ENV_FILE=… node tests/visual/c0-account.mjs http://127.0.0.1:8080 /tmp/claude-0/mts-fixture.json
 */
import { harness } from './mts-harness.mjs';
import { VISUAL_SCHEMA_VERSION } from './schema-version.mjs';
const h=harness('/tmp/browser/c0');
const sessions=[{id:'00000000-0000-4000-8000-000000000001',projectId:h.fx.project.id,projectName:'The Paper Kite',clientId:'ptg.photoshop',scopes:['project:read','transfers:write'],createdAt:'2026-10-24T08:00:00Z',lastUsedAt:'2026-10-24T08:05:00Z',expiresAt:'2030-01-01T00:00:00Z',revokedAt:null}];
const conflicts=[{id:'00000000-0000-4000-8000-0000000000c1',projectId:h.fx.project.id,projectName:'The Paper Kite',assetName:'Kite',variantId:'v',currentNumber:3,incomingNumber:4,baseNumber:2,incomingVersionId:'iv',revision:1,createdAt:'2026-10-24'}];
const calls=[];
h.hooks.navigate=async(page,path)=>{await page.getByTestId('ui-id').first().waitFor({timeout:30000});await page.evaluate(path=>{history.pushState({},'',path);window.dispatchEvent(new PopStateEvent('popstate'));},path);};
h.hooks.rest=table=>table==='schema_version'?[{version:Math.max(109,VISUAL_SCHEMA_VERSION)}]:undefined;
h.hooks.serverFn=(name,d)=>{
 calls.push(name);
 if(/^myConnectorSessions/.test(name))return sessions.filter(s=>!s.revokedAt);
 if(/^revokeConnectorSession/.test(name)){sessions.forEach(s=>{if(s.id===d.id)s.revokedAt='2026-10-24T09:00:00Z';});return true;}
 if(/^myOpenConnectorConflicts/.test(name))return conflicts.filter(c=>!c.done);
 if(/^resolveConnectorConflict/.test(name)){conflicts.forEach(c=>{if(c.id===d.id)c.done=d.choice;});return true;}
 if(/^lookupDeviceCode/.test(name))return{clientId:'ptg.cli',scopes:['project:read','manifest:read']};
 if(/^decideDeviceCode/.test(name))return true;
};
for(const lang of ['nb','en'])await h.scenario(`c0-${lang}`,h.fx.occurrenceId,lang,async page=>{
 const nb=lang==='nb';
 await page.context().addCookies([{name:'ptg-ui-language',value:lang,url:h.base}]);
 await h.hooks.navigate(page,'/konto');
 const card=page.getByTestId('c0-connectors');await card.waitFor({timeout:30000});
 h.check(await card.getByRole('heading',{name:nb?'Tilkoblede programmer':'Connected apps'}).count()===1,`${lang}: card heading`);
 h.check(await card.getByTestId('c0-session').count()===1,`${lang}: active session listed`);
 await card.screenshot({path:`${h.out}/account-${lang}.png`});
 await card.getByRole('button',{name:nb?'Behold begge':'Keep both'}).click();
 await card.getByText(nb?'Valget er lagret. Ingen versjoner er slettet.':'Your choice is saved. No versions were deleted.').waitFor();
 h.check(conflicts[0].done==='keep_both',`${lang}: keep both recorded without approval command`);
 conflicts[0].done=undefined;
 await card.getByRole('button',{name:nb?'Trekk tilbake tilgangen for ptg.photoshop':'Revoke access for ptg.photoshop'}).click();
 await card.getByText(nb?'Tilgangen er trukket tilbake.':'Access revoked.').waitFor();
 h.check(!!sessions[0].revokedAt,`${lang}: revoke reads back`);
 sessions[0].revokedAt=null;
 await page.setViewportSize({width:390,height:844});
 await card.screenshot({path:`${h.out}/account-mobile-${lang}.png`});
 h.check(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`${lang}: mobile fits screen`);
 await page.setViewportSize({width:1280,height:1800});
 await h.hooks.navigate(page,'/koble?user_code=BCDF-GHJK');
 const consent=page.getByTestId('c0-consent');await consent.waitFor({timeout:30000});
 await consent.getByRole('button',{name:nb?'Fortsett':'Continue'}).click();
 await consent.getByText(nb?'Lese prosjektoversikten (manifest)':'Read the project overview (manifest)').waitFor();
 h.check(true,`${lang}: device consent shows scopes in plain language`);
 await consent.screenshot({path:`${h.out}/consent-${lang}.png`});
});
h.finish();
