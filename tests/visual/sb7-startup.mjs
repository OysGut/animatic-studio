/** Synthetic startup/navigation regression; no paid calls or hosted-auth claim. */
import { harness } from './mts-harness.mjs';
import { VISUAL_SCHEMA_VERSION } from './schema-version.mjs';
const h = harness('/tmp/browser/sb7');
h.hooks.navigate = async (page, path) => {
  await page.getByTestId('ui-id').first().waitFor({ timeout: 30000 });
  await page.evaluate(path => { history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); }, path);
};
h.hooks.rest = table => table === 'schema_version' ? [{ version: VISUAL_SCHEMA_VERSION }] : table === 'rpc/project_snapshot' ? { project: h.fx.project, log_seq: 0, history: 'current', tables: [h.fx.rows] } : undefined;
for (const lang of ['nb', 'en']) await h.scenario(`sb7-${lang}`, h.fx.occurrenceId, lang, async page => {
  await page.context().addCookies([{ name: 'ptg-ui-language', value: lang, url: h.base }]);
  await h.hooks.navigate(page, `${h.P}/scene?scene=${h.fx.occurrenceId}&panel=${h.fx.panelId}`);
  await page.getByTestId('sb7-ai').waitFor({ timeout: 20000 });
  await page.getByTestId('sb7-ai').screenshot({ path: `${h.out}/ai-${lang}.png` });
  await h.hooks.navigate(page, `${h.P}/storyboard`);
  await page.getByTestId('sb-grid').waitFor({ timeout: 20000 });
  h.check(await page.getByTestId('sb-grid').isVisible(), `${lang}: storyboard ready after navigation`);
  await page.screenshot({ path: `${h.out}/gallery-${lang}.png` });
});
await h.finish();