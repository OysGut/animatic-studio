/** SB9: deterministic project, no paid calls or production writes. */
import { harness } from './mts-harness.mjs';
import { VISUAL_SCHEMA_VERSION } from './schema-version.mjs';
const h=harness('/tmp/browser/sb9');
h.hooks.navigate=async(page,path)=>{await page.getByTestId('ui-id').first().waitFor({timeout:30000});await page.evaluate(path=>{history.pushState({},'',path);window.dispatchEvent(new PopStateEvent('popstate'));},path);};
h.hooks.rest=table=>table==='schema_version'?[{version:Math.max(107,VISUAL_SCHEMA_VERSION)}]:table==='rpc/project_snapshot'?{project:h.fx.project,log_seq:0,history:'current',tables:[h.fx.rows]}:undefined;
for(const lang of ['nb','en'])await h.scenario(`sb9-${lang}`,h.fx.occurrenceId,lang,async page=>{
 await page.context().addCookies([{name:'ptg-ui-language',value:lang,url:h.base}]);
 const panel=h.fx.rows.compositions.find(c=>c.kind==='storyboard');if(!panel)throw Error('No panel fixture');
 await h.hooks.navigate(page,`${h.P}/scene?scene=${h.fx.occurrenceId}&panel=${panel.id}`);
 const section=page.getByTestId('sb9-blocking');await section.waitFor({timeout:30000});
 await section.getByRole('button',{name:lang==='nb'?'Opprett plantegning':'Create floor plan',exact:true}).click();
 await section.getByRole('button',{name:lang==='nb'?'Kamera':'Camera',exact:true}).click();
 await section.getByRole('combobox',{name:lang==='nb'?'Overgang':'Transition',exact:true}).selectOption('wipe');
 await section.getByRole('combobox',{name:lang==='nb'?'Retning':'Direction',exact:true}).selectOption('left');
 await section.screenshot({path:`${h.out}/desktop-${lang}.png`});
 h.check(await section.getByRole('combobox',{name:lang==='nb'?'Overgang':'Transition',exact:true}).inputValue()==='wipe',`${lang}: panel transition selected`);
 h.check(await section.getByRole('combobox',{name:lang==='nb'?'Retning':'Direction',exact:true}).inputValue()==='left',`${lang}: directional wipe persists through command`);
 h.check(await page.getByTestId('sb9-map').locator('path').count()>0,`${lang}: camera cone renders`);
 await page.setViewportSize({width:390,height:844});await section.scrollIntoViewIfNeeded();await section.screenshot({path:`${h.out}/mobile-${lang}.png`});
 h.check(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`${lang}: mobile has no horizontal overflow`);
});
h.finish();