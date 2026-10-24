/** SB-6: actual downloads, mocked auth/media, no provider calls. */
import { harness } from './mts-harness.mjs';
import { VISUAL_SCHEMA_VERSION } from './schema-version.mjs';
const h = harness('/tmp/browser/sb6');
h.hooks.navigate = async (page, path) => { await page.getByTestId('ui-id').first().waitFor({ timeout: 30000 }); await page.evaluate(path => { history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); }, path); };
h.hooks.rest = table => table === 'schema_version' ? [{ version: Math.max(106, VISUAL_SCHEMA_VERSION) }] : table === 'rpc/project_snapshot' ? { project: h.fx.project, log_seq: 0, history: 'current', tables: [h.fx.rows] } : undefined;
for (const lang of ['nb', 'en']) await h.scenario(`sb6-${lang}`, h.fx.occurrenceId, lang, async page => {
  await page.context().addCookies([{ name: 'ptg-ui-language', value: lang, url: h.base }]);
  await h.hooks.navigate(page, `${h.P}/montering`);
  await page.getByTestId('assembly-export-open').click();
  const section = page.getByTestId('sb6-export'); await section.waitFor();
  await page.getByTestId('export-image-source').getByRole('radio').last().check();
  await page.getByTestId('sb6-paper').selectOption('A3');
  await page.getByTestId('sb6-per-page').selectOption('3');
  await section.screenshot({ path: `${h.out}/desktop-${lang}.png` });
  for (const format of ['csv', 'xlsx', 'pitch', 'print']) {
    await page.getByTestId(`sb6-export-${format}`).click();
    const link = page.getByTestId('sb6-download'); await link.waitFor({ timeout: 90000 });
    h.check((await link.getAttribute('download')).endsWith(format === 'print' || format === 'pitch' ? '.pdf' : `.${format}`), `${lang}: ${format} ready`);
    const bytes = await link.evaluate(async el => [...new Uint8Array(await (await fetch(el.href)).arrayBuffer())].slice(0, 5));
    h.check(format === 'csv' ? bytes.slice(0, 3).join() === '239,187,191' : format === 'xlsx' ? bytes.slice(0, 2).join() === '80,75' : String.fromCharCode(...bytes) === '%PDF-', `${lang}: ${format} signature`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await section.scrollIntoViewIfNeeded();
  h.check(await section.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${lang}: mobile controls fit`);
  await page.screenshot({ path: `${h.out}/mobile-${lang}.png` });
});
await h.finish();