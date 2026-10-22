/**
 * B-117: globusen på innloggingssiden. Kjør: node tests/visual/b117-globe.mjs <base> <ut-mappe>
 * (UI_LANG=en for engelsk). Sjekker at innloggingsboksen er uendret, at canvas finnes, at dra endrer bildet,
 * at punktene kommer fra globe_points og at redusert bevegelse gir et stillestående bilde. Ingen betalte kall.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { uiLang } from './ui-lang.mjs';
const base = process.argv[2] ?? 'http://localhost:8080';
const out = process.argv[3] ?? '/tmp/browser/b117-globe';
mkdirSync(out, { recursive: true });
const lang = uiLang('nb');
const env = readFileSync(process.env.ENV_FILE ?? '.env', 'utf8');
const backend = /VITE_SUPABASE_URL="?([^"\n]+)/.exec(env)?.[1];
if (!backend) throw Error('Test configuration missing');
const POINTS = [
  { lat: 59.95, lon: 10.8, active: true }, { lat: 59.9, lon: 10.7, active: false }, { lat: 60.4, lon: 5.3, active: true },
  { lat: 51.5, lon: -0.1, active: false }, { lat: 48.85, lon: 2.35, active: true }, { lat: 52.5, lon: 13.4, active: false },
];
const browser = await chromium.launch({ headless: true });
let passed = 0;
const check = (value, label) => { if (!value) throw Error(`${lang}: ${label}`); passed++; console.log(` ok ${lang}: ${label}`); };
const box = (page) => page.locator('main > div').first().evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const pixels = (page) => page.getByTestId('login-globe').evaluate((c) => c.toDataURL());
async function open(reduced) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  let calls = 0;
  await context.route(`${backend}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (r) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(r) });
    if (path.endsWith('/rpc/globe_points')) { calls++; return json(POINTS); }
    if (path.endsWith('/rpc/registration_status')) return json({ open: true, message: null });
    if (path.startsWith('/auth/v1/')) return json({});
    if (path.includes('/realtime/')) return route.abort();
    if (path.includes('/rpc/')) return json(null);
    return json([]);
  });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.evaluate((l) => localStorage.setItem('animatic:lang', l), lang);
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('#password').waitFor();
  await page.waitForTimeout(1500);
  return { context, page, errors, calls: () => calls };
}
try {
  const { context, page, errors, calls } = await open(false);
  check(await page.locator('html').getAttribute('lang') === lang, 'språket er valgt');
  const canvas = page.getByTestId('login-globe');
  check(await canvas.count() === 1, 'canvas finnes');
  const cb = await canvas.boundingBox();
  check(cb && cb.width === 1280 && cb.height === 900, 'canvas dekker hele skjermen');
  check(await canvas.evaluate((c) => getComputedStyle(c).touchAction === 'none' && getComputedStyle(c).cursor === 'grab'), 'touch-action none og grab-peker');
  check(calls() >= 1, 'punktene hentes fra globe_points');
  // Innloggingsboksen: samme posisjon og størrelse med og uten globusen
  const withGlobe = await box(page);
  check(withGlobe.w === 360 && Math.abs(withGlobe.x - (1280 - 360) / 2) < 0.5, 'boksen er sentrert og 360 px bred');
  check(await page.evaluate(() => { const i = document.querySelector('#email'); const r = i.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === i; }), 'e-postfeltet ligger over globusen');
  await page.screenshot({ path: `${out}/${lang}-1-login.png` });
  const a = await pixels(page);
  await page.mouse.move(700, 500); await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(700 + i * 25, 500 + i * 8);
  await page.mouse.up();
  await page.waitForTimeout(700);
  const b = await pixels(page);
  check(a !== b, 'dra endrer bildet');
  await page.screenshot({ path: `${out}/${lang}-2-dragged.png` });
  await canvas.evaluate((c) => c.remove());
  const without = await box(page);
  check(JSON.stringify(without) === JSON.stringify(withGlobe), 'boksen er uendret uten globusen');
  check(errors.length === 0, `ingen feil i siden ${errors.join(' | ')}`);
  await context.close();

  const r = await open(true);
  const p1 = await pixels(r.page);
  await r.page.waitForTimeout(1200);
  const p2 = await pixels(r.page);
  check(p1 === p2, 'redusert bevegelse: stillestående bilde');
  check(JSON.stringify(await box(r.page)) === JSON.stringify(withGlobe), 'redusert bevegelse: boksen uendret');
  await r.context.close();
  console.log(`\n${passed}/${passed} bestått (${lang})`);
} finally {
  await browser.close();
}
