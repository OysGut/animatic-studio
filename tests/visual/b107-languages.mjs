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
const manifest = JSON.parse(readFileSync(new URL('../../src/core/i18n/manifest.json', import.meta.url), 'utf8'));
const regularLanguages = manifest.languages.filter(language => !language.testOnly).map(language => language.tag);
async function checkLanguageSwitches(page, label) {
  const switches = page.getByTestId('language-switch');
  check(await switches.count() > 0, `${label}: language switch exists`);
  for (let index = 0; index < await switches.count(); index++) {
    const group = switches.nth(index);
    const offered = await group.locator('button').evaluateAll(buttons => buttons.map(button => button.dataset.testid?.slice('language-'.length)));
    check(regularLanguages.every(tag => offered.includes(tag)), `${label}: switch ${index + 1} offers all ${regularLanguages.length} ordinary languages`);
    for (const tag of regularLanguages) check(await group.getByTestId(`language-${tag}`).isVisible(), `${label}: ${tag} visible`);
  }
}
const translated = {
  fr: { signIn: 'Se connecter', change: 'Changer de langue', description: 'From Pen to Glass – du scénario au film terminé.' },
  ja: { signIn: 'ログイン', change: '言語を変更', description: 'From Pen to Glass – 脚本から完成作品まで。' },
};
async function checkTranslatedText(page, language, account = false) {
  const expected = translated[language];
  if (!expected) throw Error(`Missing translation expectation: ${language}`);
  await page.getByTestId('language-switch').first().waitFor();
  check(await page.getByTestId('language-switch').first().getAttribute('title') === expected.change, `${language}: translated language control, not English fallback`);
  if (!account) check(await page.getByRole('button', { name: expected.signIn, exact: true }).isVisible(), `${language}: translated sign-in text`);
}
try {
  // Real server requests overlap; each response must use only its own cookie/header language.
  const ssrContext = await browser.newContext();
  await Promise.all(Array.from({ length: 12 }, async (_, index) => {
    const language = index % 2 ? 'ja' : 'fr';
    const response = await ssrContext.request.get(base, { headers: { Cookie: `ptg-ui-language=${language}`, 'Accept-Language': language === 'fr' ? 'ja' : 'fr' } });
    const html = await response.text();
    check(html.includes(`<html lang="${language}"`), `${language}: concurrent SSR stays request-local`);
    check(html.includes(translated[language].description), `${language}: concurrent SSR uses its own catalog`);
    check(response.headers()['cache-control'] === 'private, no-store', `${language}: SSR cannot enter shared cache`);
  }));
  await ssrContext.close();
  for (const language of ['fr', 'ja']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1800 }, locale: 'en-GB' });
    const page = await context.newPage();
    await page.goto(base, { waitUntil: 'networkidle' }); await page.waitForTimeout(3200);
    await page.getByTestId(`language-${language}`).first().click(); await page.waitForTimeout(1500);
    await checkTranslatedText(page, language);
    const response = await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(3200);
    // Auth state is browser-only: SSR renders a busy shell, but its description must be translated.
    check((await response.text()).includes(translated[language].description), `${language}: SSR renders translated description`);
    await checkTranslatedText(page, language);
    await page.screenshot({ path: `${out}/selected-${language}.png` });
    await context.close();
  }
  for (const [locale, expected] of [['nb-NO','nb'],['fr-FR','fr'],['ja-JP','ja'],['zz-ZZ','en']]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1800 }, locale });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(base, { waitUntil: 'networkidle' });
    check(response?.status() === 200, `${locale}: HTTP 200`);
    check((await response.text()).includes(`<html lang="${expected}"`), `${locale}: server language`);
    await page.waitForTimeout(3200);
    check(await page.locator('html').getAttribute('lang') === expected, `${locale}: browser language`);
    await checkLanguageSwitches(page, `${locale}: signed out`);
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
  let profile = 'fr'; let currentUser = user; let displayName = 'Alice'; const saved = []; const errors = [];
  await context.route(`${backend}/**`, async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    const json = result => route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
    if (path.startsWith('/auth/v1/user')) return json(currentUser);
    if (path.startsWith('/auth/v1/')) return json({});
    if (path.includes('/realtime/')) return route.abort();
    if (path.endsWith('/rpc/my_account')) return json({ status: 'active', locale: profile, display_name: displayName, country: 'NO', privacy_version: null, accepted_version: null, ui_prefs: {} });
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
  await checkLanguageSwitches(page, 'mocked signed-in header and account');
  check(await page.locator('html').getAttribute('lang') === 'fr', 'profile beats local nb and browser ja');
  check(await page.evaluate(() => localStorage.getItem('animatic:lang')) === 'nb', 'profile does not rewrite explicit local choice');
  check(saved.length === 0, 'automatic detection never saves profile');
  await checkTranslatedText(page, 'fr', true);
  for (const language of ['fr', 'ja']) {
    await page.getByTestId(`language-${language}`).first().click(); await page.waitForTimeout(1500);
    await checkTranslatedText(page, language, true);
    check(saved.at(-1) === language, `${language}: explicit account choice saved`);
    await page.reload({ waitUntil: 'networkidle' }); await page.getByTestId('account-page').waitFor(); await page.waitForTimeout(3500);
    await checkTranslatedText(page, language, true);
    check(await page.locator('html').getAttribute('lang') === language, `${language}: account language survives reload`);
  }
  await page.getByTestId('language-de').first().click(); await page.waitForTimeout(1500);
  check(saved.at(-1) === 'de', 'explicit choice saves account locale');
  await page.reload({ waitUntil: 'networkidle' }); await page.getByTestId('account-page').waitFor(); await page.waitForTimeout(3500);
  check(await page.locator('html').getAttribute('lang') === 'de', 'saved account choice reads back after reload');
  check(errors.length === 0, 'account flow has no runtime errors');
  // Direct identity change without reloading must discard Alice's account and unsaved name.
  const nameField = page.getByTestId('account-page').locator('input').first();
  await nameField.fill('Alice unfinished draft');
  currentUser = { ...user, id: '00000000-0000-7000-8000-b0b000000002', email: 'bob@example.test' };
  displayName = 'Bob'; profile = 'ja';
  await page.evaluate(async newUser => {
    const { browserClient } = await import('/src/adapters/browser/client.ts');
    const payload = btoa(JSON.stringify({ sub: newUser.id, exp: Math.floor(Date.now()/1000)+86400 })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const result = await browserClient.auth.setSession({ access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.c2lnbmF0dXJl`, refresh_token: 'fixture-b' });
    if (result.error) throw new Error(result.error.message);
  }, currentUser);
  await page.waitForTimeout(2000);
  console.log('Observed fixture name after switch:', await nameField.inputValue());
  check(await nameField.inputValue() === 'Bob', 'B sees Bob, not Alice name or unfinished draft');
  check(!(await page.getByTestId('account-page').innerText()).includes('Alice'), 'B account contains no Alice data');
  await checkTranslatedText(page, 'ja', true);
  await page.reload({ waitUntil: 'networkidle' }); await page.getByTestId('account-page').waitFor(); await page.waitForTimeout(3500);
  check(await nameField.inputValue() === 'Bob', 'B own name survives reload');
  await checkTranslatedText(page, 'ja', true);
  await page.screenshot({ path: `${out}/account-de.png` }); await context.close();
  console.log(`RESULTAT: ${passed} bestått, 0 feilet`);
} finally { await browser.close(); }