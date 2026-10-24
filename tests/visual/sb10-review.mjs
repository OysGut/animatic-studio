/** SB10: deterministic guest and team review, mocked services, no production writes. */
import { harness } from './mts-harness.mjs';
import { VISUAL_SCHEMA_VERSION } from './schema-version.mjs';
const h=harness('/tmp/browser/sb10');
const media=await import('node:fs').then(fs=>fs.readFileSync('/tmp/browser/sb10/clip.mp4')); 
const token='sr_'+'a'.repeat(43),feedback=[];
const review={title:'The Paper Kite',comments:true,approval:true,fps:24,expiresAt:'2030-01-01',videoUrl:'https://review.fixture/clip.mp4',panels:[{key:'p1',label:'1 · A',revision:3,durationFrames:48,startFrame:0,imageUrl:'https://review.fixture/p1.svg'},{key:'p2',label:'1 · B',revision:1,durationFrames:72,startFrame:48,imageUrl:'https://review.fixture/p2.svg'}],feedback};
h.hooks.context=async context=>{await context.route('https://review.fixture/clip.mp4',route=>route.fulfill({status:200,contentType:'video/mp4',body:media}));await context.route('https://review.fixture/**',route=>route.request().url().endsWith('clip.mp4')?route.fulfill({status:200,contentType:'video/mp4',body:media}):route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#25765e"/><rect x="330" y="200" width="180" height="370" fill="#e7a954"/><path d="M750 90L930 230L750 370L570 230Z" fill="#d9514a"/><path d="M750 370Q700 600 550 690" fill="none" stroke="#ffffff" stroke-width="8"/></svg>'}));};
h.hooks.navigate=async(page,path)=>{await page.getByTestId('ui-id').first().waitFor({timeout:30000});await page.evaluate(path=>{history.pushState({},'',path);window.dispatchEvent(new PopStateEvent('popstate'));},path);};
h.hooks.rest=table=>table==='schema_version'?[{version:Math.max(108,VISUAL_SCHEMA_VERSION)}]:table==='rpc/project_snapshot'?{project:h.fx.project,log_seq:0,history:'current',tables:[h.fx.rows]}:undefined;
h.hooks.serverFn=(name,d)=>{
 if(/^readReview/.test(name))return{...review,feedback:[...feedback]};
 if(/^postReview/.test(name)){feedback.push({id:'feedback-'+feedback.length,panel_key:d.key,guest_name:d.name,text:d.text,decision:d.decision,pin_x:d.x,pin_y:d.y,replies:[],resolved:false,created_at:'2026-10-24'});return true;}
 if(/^teamReviews/.test(name))return{shares:[],feedback:[]};
};
for(const lang of ['nb','en'])await h.scenario(`sb10-${lang}`,h.fx.occurrenceId,lang,async page=>{
 await page.context().addCookies([{name:'ptg-ui-language',value:lang,url:h.base}]);
 await h.hooks.navigate(page,`${h.P}/storyboard`);
 const open=page.getByTestId('sb10-open').first();await open.waitFor({timeout:30000});await open.click();
 const dialog=page.getByRole('dialog').first();await dialog.waitFor();
 h.check(await dialog.getByRole('button',{name:lang==='nb'?'Opprett delingslenke':'Create review link',exact:true}).count()===1,`${lang}: existing gallery opens share settings`);
 await dialog.screenshot({path:`${h.out}/team-${lang}.png`});await page.keyboard.press('Escape');
 await h.hooks.navigate(page,`/review/${token}`);const guest=page.getByTestId('sb10-guest');await guest.waitFor({timeout:30000});
 await guest.getByRole('heading',{name:'The Paper Kite'}).waitFor();
 await guest.getByRole('textbox',{name:lang==='nb'?'Navn':'Name',exact:true}).fill('Review Guest');
 await guest.getByRole('textbox',{name:lang==='nb'?'Kommentar':'Comment',exact:true}).fill('Please shift the kite left.');
 await guest.getByRole('combobox').selectOption('changes');
 const image=guest.getByRole('button',{name:lang==='nb'?'Plasser kommentarnål':'Place comment pin'});await image.focus();await page.keyboard.press('Enter');await page.keyboard.press('ArrowRight');
 await guest.getByRole('button',{name:lang==='nb'?'Send':'Send',exact:true}).click();
 await guest.getByText('Please shift the kite left.',{exact:true}).last().waitFor();
 h.check(feedback.at(-1)?.decision==='changes'&&feedback.at(-1)?.pin_x===.52,`${lang}: anonymous pinned change request reads back`);
 await guest.locator('video').evaluate(async v=>{v.muted=true;await v.play();});await page.waitForTimeout(200);h.check(await guest.locator('video').evaluate(v=>v.currentTime>0),`${lang}: review video actually plays`);await guest.locator('video').evaluate(v=>v.pause());
 h.check(await guest.locator('video').count()===1,`${lang}: review playback and audio controls present`);
 await page.screenshot({path:`${h.out}/desktop-${lang}.png`});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${h.out}/mobile-${lang}.png`});
 h.check(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`${lang}: mobile fits screen`);
});
h.finish();
