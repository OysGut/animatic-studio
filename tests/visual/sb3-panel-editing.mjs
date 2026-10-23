/** SB-3: bokmål/engelsk, panelverktøy og scenedrag med mockede tjenester, ingen betalte kall. */
import {VISUAL_SCHEMA_VERSION} from './schema-version.mjs';
import { harness } from './mts-harness.mjs';
import {readFileSync} from 'node:fs';
const fx=JSON.parse(readFileSync(process.argv[3],'utf8'));
const h=harness('/tmp/browser/sb3');
h.hooks.rest=(table)=>table==='schema_version'?[{version:VISUAL_SCHEMA_VERSION}]:table==='rpc/project_snapshot'?{project:fx.project,log_seq:0,history:'current',tables:[fx.rows]}:undefined;
for(const lang of ['nb','en'])await h.scenario(`sb3-${lang}`,fx.occurrenceId,lang,async page=>{
 await page.goto(`${h.base}${h.P}/scene?scene=${fx.occurrenceId}&panel=${fx.panelId}`,{waitUntil:'networkidle'});
 await page.getByTestId('sb3-editor').waitFor({timeout:15000});
 await page.getByTestId('sb3-tool-note').click();
 h.check(await h.eventually(()=>h.state.commands.some(c=>c.type==='AddLayers')),`${lang}: lapp lagres med vanlig lagkommando`);
 const text=page.getByRole('textbox',{name:lang==='nb'?'Lapp':'Note',exact:true});await text.fill('Camera must wait');await text.blur();
 h.check(await h.eventually(()=>h.state.commands.some(c=>c.type==='UpdateLayers')),`${lang}: lapptekst lagres`);
 await page.getByTestId('sb3-tool-arrow').click();
 h.check(!h.state.commands.some(c=>c.type==='UpdateSceneDraft'),`${lang}: pil blir ikke automatisk bevegelsesbane`);
 await page.screenshot({path:`${h.out}/panel-${lang}.png`});
 await page.goto(`${h.base}${h.P}/storyboard`,{waitUntil:'networkidle'});await page.getByTestId('sb-grid').waitFor();
 const rows=page.getByTestId('sb-scene');await rows.first().dragTo(rows.nth(1));
 h.check(await h.eventually(()=>h.state.commands.some(c=>c.type==='MoveOccurrence')),`${lang}: scenedrag bruker MoveOccurrence`);
 await page.screenshot({path:`${h.out}/gallery-${lang}.png`});
});
await h.finish();
