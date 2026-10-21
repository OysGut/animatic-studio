/** B-105a: browser encoder foundation only, not the uploader integration suite.
 * node tests/visual/b105a-ingest-adapter.mjs [baseUrl] [outputDirectory]
 * No upload, server function, or paid service call.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
const [base = 'http://localhost:8080', out = '/tmp/browser/b105a-adapter'] = process.argv.slice(2);
let chromium;
try { ({ chromium } = await import('playwright')); }
catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  // Sandbox already provides Python Playwright; do not install another npm package.
  execFileSync('python3', [fileURLToPath(new URL('./b105a-ingest-adapter.py', import.meta.url)), base, out], { stdio: 'inherit' });
  process.exit(0);
}
mkdirSync(out, { recursive: true });
let pass = 0, fail = 0;
const check = (ok, description) => {
  console.log(` ${ok ? 'ok' : 'FEIL'} ${description}`);
  if (ok) pass++; else fail++;
};
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1800 } });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    const { ingestImage } = await import('/src/adapters/browser/image-ingest.ts');
    const canvas = document.createElement('canvas');
    canvas.width = 6000; canvas.height = 4000;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, 6000, 4000);
    context.fillStyle = '#164d33'; context.fillRect(500, 500, 5000, 3000);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG encoding failed');
    const file = new File([blob], 'fixture-6000x4000.png', { type: 'image/png' });
    const ingested = await ingestImage(file, { frameWidth: 1920, frameHeight: 1080 });
    const dimensions = async value => {
      const bitmap = await createImageBitmap(value);
      const size = [bitmap.width, bitmap.height]; bitmap.close(); return size;
    };
    const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await value.arrayBuffer()))).join(',');
    const originalUnchanged = ingested.original === file && await hash(ingested.original) === await hash(file);
    const sizes = {};
    for (const name of ['original', 'working', 'proxy', 'thumbnail']) sizes[name] = await dimensions(ingested[name]);
    // Display the actual derivatives for screenshot inspection without altering app source.
    document.body.replaceChildren();
    const heading = document.createElement('h1'); heading.textContent = 'B-105a encoder verification'; document.body.append(heading);
    for (const name of ['proxy', 'thumbnail']) {
      const label = document.createElement('h2'); label.textContent = name; document.body.append(label);
      const image = document.createElement('img'); image.src = URL.createObjectURL(ingested[name]); image.style.maxWidth = '600px'; document.body.append(image);
      await image.decode();
    }
    return { originalUnchanged, sizes, proxyMime: ingested.proxy.type, thumbnailMime: ingested.thumbnail.type };
  });
  check(result.originalUnchanged, 'Originalens fil og SHA-256 er uendret');
  check(JSON.stringify(result.sizes.original) === '[6000,4000]', 'Originalen beholder 6000 × 4000');
  check(JSON.stringify(result.sizes.working) === '[3840,2560]', 'Arbeidskopien har 3840 × 2560');
  check(JSON.stringify(result.sizes.proxy) === '[1920,1280]', 'Avspillingsproxyen har 1920 × 1280');
  check(JSON.stringify(result.sizes.thumbnail) === '[256,171]', 'Miniatyren har 256 × 171');
  check(result.proxyMime === 'image/webp' && result.thumbnailMime === 'image/webp', 'Begge avledede filer er WebP');
  await page.screenshot({ path: `${out}/encoded-images.png` });
} catch (error) {
  console.error(error.message); fail++;
} finally { await browser.close(); }
console.log(`RESULTAT ${pass} bestått, ${fail} feilet`);
process.exitCode = fail ? 1 : 0;