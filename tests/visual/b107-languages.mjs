/** B-107/B-111: public browser preferences, explicit choice and mocked account priority. No paid calls. */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { VISUAL_SCHEMA_VERSION } from './schema-version.mjs';
const base = process.argv[2] ?? 'http://localhost:8080';
const out = process.argv[3] ?? '/tmp/browser/b107-suite';
mkdirSync(out, { recursive: true });
const env = readFileSync(process.env.ENV_FILE ?? '.env', 'utf8');
const backend = /VITE_SUPABASE_URL="?([^"\n]+)/.exec(env)?.[1];
if (!backend) throw Error('Test configuration missing');
const storageKey = `sb-${new URL(backend).hostname.split('.')[0]}-auth-token`;
const user = { id: '00000000-0000-7000-8000-a11ce0000001', email: 'fixture@example.test', role: 'authenticated', aud: 'authenticated' };
const browser = await chromium.launch({ headless: true });
let passed = 0;
const check = (value, label) => { if (!value) throw Error(label); passed++; console.log(` ok ${label}`); };
try {
  for (const [locale, expected] of [['nb-NO','nb'],['fr-FR','fr'],['ja-JP','ja'],['zz-ZZ','en']]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1800 }, locale });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(base, { waitUntil: 'networkidle' });
    check(response?.status() === 200, `${locale}: HTTP 200`);
    check((await response.text()).includes(`<html lang="${expected}"`), `${locale}: server language`);
    await page.waitForTimeout(3200);
    check(await page.locator('html').getAttribute('lang') === expected, `${locale}: browser language`);
    await page.getByTestId('language-nb').first().click();
    await page.waitForTimeout(300);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3200);
    check(await page.locator('html').getAttribute('lang') === 'nb', `${locale}: explicit choice survives reload`);
    check(errors.length === 0, `${locale}: no runtime errors`);
    await page.screenshot({ path: `${out}/${locale}.png` });
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 1280, height: 1800 }, locale: 'ja-JP' });
  let profile = 'fr'; const saved = []; const errors = [];
  await context.route(`${backend}/**`, async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    const json = result => route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
    if (path.startsWith('/auth/v1/user')) return json(user);
    if (path.startsWith('/auth/v1/')) return json({});
    if (path.includes('/realtime/')) return route.abort();
    if (path.endsWith('/rpc/my_account')) return json({ status: 'active', locale: profile, display_name: 'Fixture', country: 'NO', privacy_version: null, accepted_version: null, ui_prefs: {} });
    if (path.endsWith('/rpc/set_my_locale')) { profile = JSON.parse(req.postData() ?? '{}').p_locale; saved.push(profile); return json(null); }
    if (path.includes('/rpc/')) return json(null);
    if (path.endsWith('/schema_version')) return json([{ version: VISUAL_SCHEMA_VERSION }]);
    return json([]);
  });
  await context.route('**/_serverFn/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ result: { ok: true, rows: [], rates: [], workspaces: [], projectNames: {}, userNames: {} }, context: {} }) }));
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.evaluate(([key, session]) => { localStorage.setItem(key, session); localStorage.setItem('animatic:lang','nb'); }, [storageKey, JSON.stringify({ access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmaXh0dXJlIn0.signature', refresh_token: 'fixture', token_type: 'bearer', expires_at: Math.floor(Date.now()/1000)+86400, user })]);
  await page.goto(`${base}/konto`, { waitUntil: 'networkidle' });
  await page.getByTestId('account-page').waitFor(); await page.waitForTimeout(3500);
  check(await page.locator('html').getAttribute('lang') === 'fr', 'profile beats local nb and browser ja');
  check(await page.evaluate(() => localStorage.getItem('animatic:lang')) === 'nb', 'profile does not rewrite explicit local choice');
  check(saved.length === 0, 'automatic detection never saves profile');
  await page.getByTestId('language-de').first().click(); await page.waitForTimeout(1500);
  check(saved.at(-1) === 'de', 'explicit choice saves account locale');
  await page.reload({ waitUntil: 'networkidle' }); await page.getByTestId('account-page').waitFor(); await page.waitForTimeout(3500);
  check(await page.locator('html').getAttribute('lang') === 'de', 'saved account choice reads back after reload');
  check(errors.length === 0, 'account flow has no runtime errors');
  await page.screenshot({ path: `${out}/account-de.png` }); await context.close();
  console.log(`RESULTAT: ${passed} bestått, 0 feilet`);
} finally { await browser.close(); }