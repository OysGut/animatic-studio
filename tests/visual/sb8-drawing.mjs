/** SB-8 nb/en desktop and mobile; all writes mocked, no paid calls. */
import {harness} from './mts-harness.mjs';
import {VISUAL_SCHEMA_VERSION} from './schema-version.mjs';
const h=harness('/tmp/browser/sb8');
h.hooks.navigate=async(page,path)=>{await page.getByTestId('ui-id').first().waitFor({timeout:30000});await page.evaluate(path=>{history.pushState({},'',path);window.dispatchEvent(new PopStateEvent('popstate'));},path);};
h.hooks.rest=table=>table==='schema_version'?[{version:Math.max(106,VISUAL_SCHEMA_VERSION)}]:table==='rpc/project_snapshot'?{project:h.fx.project,log_seq:0,history:'current',tables:[h.fx.rows]}:undefined;
for(const lang of ['nb','en'])await h.scenario(`sb8-${lang}`,h.fx.occurrenceId,lang,async page=>{
 await page.context().addCookies([{name:'ptg-ui-language',value:lang,url:h.base}]);
 await h.hooks.navigate(page,`${h.P}/scene?scene=${h.fx.occurrenceId}&panel=${h.fx.panelId}`);
 await page.getByTestId('sb3-editor').waitFor({timeout:20000});
 await page.getByRole('button',{name:lang==='nb'?'Tegnelag':'Drawing layer',exact:true}).click();
 await page.getByRole('button',{name:lang==='nb'?'Legg til tegnelag':'Add drawing layer',exact:true}).first().click();
 const c=page.getByTestId('sb8-canvas');await c.waitFor();const r=await c.boundingBox();
 await page.mouse.move(r.x+r.width*.2,r.y+r.height*.3);await page.mouse.down();await page.mouse.move(r.x+r.width*.65,r.y+r.height*.6,{steps:12});await page.mouse.up();
 h.check(await h.eventually(()=>h.state.commands.some(x=>x.type==='UpdateLayers'&&x.layers?.some(l=>l.fields?.sketch?.strokes?.length===1))),`${lang}: one pointer-up saves one stroke`);
 h.check(await c.evaluate(el=>{const d=el.getContext('2d').getImageData(0,0,el.width,el.height).data;return d.some((v,i)=>i%4===3&&v>0);}),`${lang}: raster has visible pixels`);
 await page.getByRole('button',{name:lang==='nb'?'Vend lerretet':'Flip canvas',exact:true}).click();
 const count=h.state.commands.length;await page.getByRole('button',{name:lang==='nb'?'Roter visningen':'Rotate view',exact:true}).click();h.check(h.state.commands.length===count,`${lang}: view transforms do not write`);
 await page.getByTestId('sb8-drawing').screenshot({path:`${h.out}/drawing-${lang}.png`});
 await page.setViewportSize({width:390,height:844});
 h.check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${lang}: mobile page has no horizontal overflow`);
 await page.screenshot({path:`${h.out}/mobile-${lang}.png`});
});
await h.finish();