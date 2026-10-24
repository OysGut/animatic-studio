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
  const pdfChecks = await page.evaluate(async fx => {
    const core = await import('/src/core/index.ts');
    const print = await import('/src/core/storyboard/print.ts');
    const ex = await import('/src/engine/export/storyboard-print.ts');
    const pdfjs = await import('/node_modules/pdfjs-dist/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.mjs';
    const state = core.stateFromRows({ ...fx.rows, script_block_revisions: fx.rows.script_block_revisions ?? [], production_segments: fx.rows.production_segments ?? [], takes: fx.rows.takes ?? [], project: fx.project });
    const clips = core.filmClips(state, fx.rows.productions[0].id);
    const rows = print.panelPrintRows(state, clips), row = rows[0];
    if (!row) throw new Error('No storyboard fixture');
    const base = { state, clips, source: 'storyboard', options: { paper: 'A4', landscape: false, perPage: 1, fields: ['dialogue'], layers: { sketch: true, note: true, arrow: true, camera_mark: true } }, labels: { dialogue: '', panel: '' }, version: '1', date: '2026-10-24', urls: async () => ({}) };
    const checks = [];
    for (const [language, text] of [['ja', '日本語の絵コンテ'], ['ar', 'مرحبا بالعالم'], ['he', 'שלום עולם'], ['hi', 'नमस्ते दुनिया'], ['th', 'สวัสดีโลก']]) {
      const blob = await ex.storyboardPdf({ ...base, rows: [{ ...row, dialogue: text }], language, signal: new AbortController().signal });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const embedded = new TextDecoder('latin1').decode(bytes).includes('FontFile2');
      const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
      const pg = await doc.getPage(1), viewport = pg.getViewport({ scale: 1 });
      const canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height;
      const ctx = canvas.getContext('2d'); await pg.render({ canvasContext: ctx, viewport }).promise;
      const content = (await pg.getTextContent()).items.map(i => i.str).join(' ');
      const image = ctx.getImageData(20, 350, canvas.width - 40, 50).data;
      const ink = image.some((v, i) => i % 4 !== 3 && v < 150);
      checks.push([embedded && doc.numPages === 1 && ink && (language !== 'ja' || content.includes(text)), `${language}: embedded Noto and rendered text`]);
      await doc.destroy();
    }
    const ctrl = new AbortController(); let count = 0, yielded = false;
    setTimeout(() => { yielded = true; }, 0);
    try {
      await ex.storyboardPdf({ ...base, options: { ...base.options, perPage: 9, fields: [] }, rows: Array.from({ length: 500 }, () => row), language: 'en', signal: ctrl.signal, progress: done => { count = done; if (done === 20) ctrl.abort(); } });
      checks.push([false, '500 panels cancel']);
    } catch (error) { checks.push([error.name === 'AbortError' && count === 20 && yielded, '500 panels cancel and yield to input']); }
    return checks;
  }, h.fx);
  for (const [ok, label] of pdfChecks) h.check(ok, `${lang}: ${label}`);
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