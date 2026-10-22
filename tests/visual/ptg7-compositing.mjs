/** PTG7 real ZIP downloads against fixed data; services are mocked, no AI. */
import { harness } from './mts-harness.mjs';
import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
const h = harness('/tmp/browser/ptg7-compositing');
const lang = process.env.UI_LANG ?? 'nb';
const occ = h.rows.scene_occurrences.find(o => o.active);
if (!occ) throw new Error('fixture');
h.fx.project.code = 'PTG7-TEST';
let settings, version = 0;
h.hooks.rest = (table, req) => {
  if (table === 'rpc/reserve_interchange_export') {
    const body = JSON.parse(req.postData()); settings = body.p_settings; version++;
    return { batchId: '00000000-0000-7000-8000-000000008207', versions: Object.fromEntries(body.p_occurrence_ids.map(id => [id, version])) };
  }
  if (table === 'rpc/complete_interchange_export') return '00000000-0000-7000-8000-000000008208';
};
await h.scenario(`ptg7-${lang}`, occ.id, lang, async page => {
  await page.setViewportSize({ width: 1280, height: 1800 });
  await page.goto(h.base + h.P + '/montering', { waitUntil: 'networkidle' });
  await page.evaluate(() => { delete window.showSaveFilePicker; });
  await page.getByRole('button', { name: lang === 'en' ? 'Export animatic' : 'Eksporter animatic', exact: true }).click();
  const section = page.getByTestId('ptg-export-section'); await section.waitFor();
  const button = page.getByTestId('ptg-export-compositing');
  h.check((await button.innerText()).includes(lang === 'en' ? 'Nuke and Fusion' : 'Nuke og Fusion'), `${lang}: eksportknappen er oversatt`);
  for (let run = 1; run <= 2; run++) {
    const download = page.waitForEvent('download', { timeout: 60000 }); await button.click();
    const path = `${h.out}/${lang}-${run}.zip`; await (await download).saveAs(path);
    await page.waitForFunction(() => !document.querySelector('[data-testid="ptg-export-compositing"]').disabled);
    const zip = unzipSync(readFileSync(path)), names = Object.keys(zip);
    const nkNames = names.filter(n => n.endsWith('.nk'));
    h.check(settings?.format === 'compositing' && version === run, `${lang}: eksporten reserverer nytt versjonsnummer`);
    h.check(nkNames.length > 0 && nkNames.every(n => /_v\d{3}\.nk$/.test(n)), `${lang}: .nk per skudd med PTG-navn`);
    h.check(nkNames.every(n => zip[n.replace(/\.nk$/, '.comp')]), `${lang}: tilsvarende .comp per skudd`);
    const readme = new TextDecoder().decode(zip['LESMEG.txt']);
    h.check(readme.includes('Ingen KI brukes') && readme.includes('No AI is used') && readme.includes('2D-oppsett') && readme.includes('2D setup'), `${lang}: nb/en LESMEG og 2D-forklaring`);
    const scripts = nkNames.map(n => new TextDecoder().decode(zip[n]));
    const paths = scripts.flatMap(s => [...s.matchAll(/file "\.\.\/([^"\n]+)"/g)].map(m => m[1]));
    h.check(paths.length > 0 && paths.every(p => zip[p]), `${lang}: relative mediestier peker til filer i ZIP`);
    h.check(scripts.some(s => s.includes('Transform {')), `${lang}: skudd uten rigg bruker Transform`);
    h.check(nkNames.every(n => n.includes(`_v${String(run).padStart(3, '0')}/`)), `${lang}: skuddmappene får nytt versjonsnummer`);
  }
  h.check(!h.state.commands.some(c => ['SetActiveTake', 'SetSceneEdit'].includes(c.type)) && !h.state.rpcs.some(r => /generate|Ai/.test(r.name)), `${lang}: ingen aktivering eller AI`);
  await section.screenshot({ path: `${h.out}/${lang}-section.png` });
});
await h.finish();