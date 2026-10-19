/**
 * U5: skjerm for skjerm. Skjermbilder ved 1280 og 1600 px, ingen vannrett rulling ved 1280 px, kontrast (AA) for
 * synlig tekst, synlig fokusring ved tastaturnavigasjon og miniatyrbilder i Story Lab-listene (også rutenett).
 * Mockede serverfunksjoner og lagring (mts-harness.mjs); ingen betalte kall.
 *   bun tests/visual/make-fixture.ts /tmp/claude-0/visual-fixture.json
 *   ENV_FILE=… node tests/visual/u5-screens.mjs <baseUrl> /tmp/claude-0/visual-fixture.json [out]
 */
import { harness } from "./mts-harness.mjs";
if (!process.argv[3]) process.argv[3] = "/tmp/claude-0/visual-fixture.json";
const h = harness("/tmp/claude-0/u5-screens");
const occ = h.rows.scene_occurrences.find((o) => o.active && h.rows.compositions.some((c) => c.variant_id === o.variant_id && !c.removed)) ?? h.rows.scene_occurrences[0];

const SCREENS = [
  { name: "prosjekter", path: "/" },
  { name: "oversikt", path: `${h.P}` },
  { name: "manus", path: `${h.P}/manus` },
  { name: "bibliotek", path: `${h.P}/bibliotek` },
  { name: "storylab", path: `${h.P}/storylab` },
  { name: "sceneeditor", path: `${h.P}/scene?scene=${occ.id}` },
  { name: "animasjon", path: `${h.P}/scene?scene=${occ.id}`, after: async (page) => { await page.getByTestId("scene-tab-animation").click(); await page.waitForTimeout(800); } },
  { name: "montering", path: `${h.P}/montering` },
  { name: "utgivelse", path: `${h.P}/utgivelse` },
];

/** Kontrast for synlig tekst: tekstfarge mot nærmeste ugjennomsiktige bakgrunn (farger regnes om via lerret). */
const CONTRAST = () => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const rgba = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgba(getComputedStyle(e).backgroundColor); if (c[3] > 0.9) return c; } return rgba(getComputedStyle(document.body).backgroundColor); };
  const bad = [];
  let n = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t && n < 600; t = walker.nextNode()) {
    const el = t.parentElement;
    if (!el || !t.textContent.trim()) continue;
    if (el.closest("canvas, svg, [aria-hidden='true'], [disabled], .sr-only, [data-testid='anim-preview-pan']")) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
    const st = getComputedStyle(el);
    if (st.visibility === "hidden" || Number(st.opacity) < 0.95) continue;
    let o = 1; for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); if (o < 0.95) continue;
    n++;
    const fg = rgba(st.color), bg = bgOf(el);
    const mix = fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]));
    const [a, b] = [lum(mix), lum(bg)].sort((x, y) => y - x);
    const ratio = (a + 0.05) / (b + 0.05);
    const large = parseFloat(st.fontSize) >= 18.66 || (parseFloat(st.fontSize) >= 14 && Number(st.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) bad.push(`${t.textContent.trim().slice(0, 30)} (${ratio.toFixed(2)})`);
  }
  return { checked: n, bad };
};

/** Første synlige fokus etter Tab har ring/kontur (outline eller box-shadow). */
async function focusRing(page) {
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    const r = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const st = getComputedStyle(el);
      return { tag: el.tagName, visible: (st.outlineStyle !== "none" && parseFloat(st.outlineWidth) > 0) || (st.boxShadow && st.boxShadow !== "none") };
    });
    if (r) return r;
  }
  return null;
}

await h.scenario("u5-skjermer", occ.id, "nb", async (page) => {
  for (const sc of SCREENS) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${h.base}${sc.path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await sc.after?.(page);
    const sw = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
    h.check(sw.s <= sw.c + 1, `${sc.name}: ingen vannrett rulling ved 1280 px (${sw.s} / ${sw.c})`);
    await page.screenshot({ path: `${h.out}/${sc.name}-1280.png` });
    const c = await page.evaluate(CONTRAST);
    h.check(c.bad.length === 0, `${sc.name}: kontrast AA for ${c.checked} tekster${c.bad.length ? " – " + c.bad.slice(0, 4).join(", ") : ""}`);
    await page.mouse.click(2, 2);
    const f = await focusRing(page);
    h.check(!f || f.visible, `${sc.name}: synlig fokusring (${f?.tag ?? "ingen fokus"})`);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${h.out}/${sc.name}-1600.png` });
  }
});

const characters = h.rows.assets.filter((a) => !a.removed && (a.kind === "character" || a.kind === "animal"));
const withImage = characters.filter((a) => h.rows.asset_variants.some((v) => v.asset_id === a.id && h.rows.asset_versions.some((x) => x.variant_id === v.id && x.mime_type?.startsWith("image/"))));
async function checkReserves(page, root, label) {
  const reserves = root.getByTestId("asset-thumb-fallback");
  const n = await reserves.count();
  const valid = await reserves.evaluateAll(elements => elements.every(el => {
    const r = el.getBoundingClientRect();
    const initial = el.querySelector('[data-testid="asset-thumb-initial"]');
    const character = ["character", "animal"].includes(el.dataset.assetKind);
    return r.width > 0 && r.height > 0 && el.querySelector("svg") && (!character || initial?.textContent.trim());
  }));
  h.check(n > 0 && valid, `${label}: synlig reserve med initial og typeikon (${n})`);
}
await h.scenario("u5-storylab-miniatyrer", occ.id, "nb", async (page) => {
  await page.goto(`${h.base}${h.P}/storylab`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const list = page.getByTestId("storylab-characters");
  const rows = await list.getByTestId("storylab-character").count();
  const thumbs = await list.getByTestId("asset-thumb").count();
  h.check(rows > 0 && thumbs === rows, `hver karakter i listen har miniatyr (${thumbs}/${rows})`);
  if (withImage.length) h.check(await h.eventually(async () => (await list.locator('[data-testid="asset-thumb"][data-has-image="true"] img').count()) > 0, 5000), `godkjent bilde vises i listen (${withImage.length} med bilde)`);
  await page.getByTestId("storylab-view-toggle").click();
  h.check((await list.getAttribute("data-view")) === "grid", "bryteren viser rutenett");
  h.check((await list.getByTestId("asset-thumb").count()) === rows, "rutenettet har miniatyr for hver karakter");
  await page.screenshot({ path: `${h.out}/storylab-rutenett.png` });
  await page.getByTestId("storylab-view-toggle").click();
  h.check((await list.getAttribute("data-view")) === "list", "bryteren går tilbake til liste");
});

await h.scenario("u5-bibliotek-rutenett", occ.id, "nb", async (page) => {
  await page.goto(`${h.base}${h.P}/bibliotek`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByTestId("library-view-toggle").click();
  const ul = page.locator('ul[data-view]');
  h.check((await ul.first().getAttribute("data-view")) === "grid", "biblioteket kan vises som rutenett");
  h.check((await ul.first().getByTestId("asset-thumb").count()) > 0, "rutenettet har miniatyrbilder");
  await page.screenshot({ path: `${h.out}/bibliotek-rutenett.png` });
});

await h.scenario("u5-animasjon", occ.id, "nb", async (page) => {
  await page.getByTestId("scene-tab-animation").click();
  await page.waitForTimeout(800);
  const pan = await page.getByTestId("anim-preview-pan").boundingBox();
  const panel = await page.getByTestId("anim-preview").boundingBox();
  h.check(pan && panel && pan.height <= panel.height, `forhåndsvisningen har scenens format (${Math.round(pan?.width ?? 0)}×${Math.round(pan?.height ?? 0)})`);
  h.check(await page.getByTestId("ca8-rhythm-drag-layer").count() === 1, "dra-laget for rytme finnes");
  h.check((await page.getByTestId("ca8-rhythm-drag-layer").getAttribute("data-armed")) === "false", "dra-modusen er av uten Cmd/Ctrl");
  await page.keyboard.down("Control");
  h.check(await h.eventually(async () => (await page.getByTestId("ca8-rhythm-drag-layer").getAttribute("data-armed")) === "true"), "Ctrl holdt slår på dra-modusen");
  await page.keyboard.up("Control");
});

await h.scenario("u5-engelsk", occ.id, "en", async (page) => {
  await page.goto(`${h.base}${h.P}/storylab`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const label = await page.getByTestId("storylab-view-toggle").getAttribute("aria-label");
  h.check(/grid|list/i.test(label ?? ""), `engelsk tekst på bryteren (${label})`);
});

// Fjern bare karakterbildene fra den mockede visningen for å bevise reserven,
// uavhengig av hvilke bilder den vanlige fixturen inneholder.
const originalVersions = h.rows.asset_versions;
const characterVariantIds = new Set(h.rows.asset_variants.filter(v => characters.some(a => a.id === v.asset_id)).map(v => v.id));
h.rows.asset_versions = originalVersions.filter(v => !characterVariantIds.has(v.variant_id));
try {
  await h.scenario("u5-reserver", occ.id, "nb", async page => {
    await page.goto(`${h.base}${h.P}/storylab`, { waitUntil: "networkidle" });
    await checkReserves(page, page.getByTestId("storylab-characters"), "Story Lab liste");
    await page.getByTestId("storylab-view-toggle").click();
    await checkReserves(page, page.getByTestId("storylab-characters"), "Story Lab rutenett");
    await page.screenshot({ path: `${h.out}/storylab-reserver.png` });
    await page.goto(`${h.base}${h.P}/bibliotek`, { waitUntil: "networkidle" });
    await checkReserves(page, page.locator('ul[data-view]').first(), "Bibliotek liste");
    await page.getByTestId("library-view-toggle").click();
    await checkReserves(page, page.locator('ul[data-view]').first(), "Bibliotek rutenett");
  });
  await h.scenario("u5-forhandsvisning-sporhoder", occ.id, "nb", async page => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByTestId("scene-tab-animation").click();
    const heads = page.locator('[data-anim-track] > button, [data-anim-track] > [data-state]');
    const rows = page.locator('[data-anim-track]');
    const count = await rows.count();
    const valid = await rows.evaluateAll(elements => elements.every(row => {
      const head = row.firstElementChild;
      return head?.querySelector("img, svg") !== null;
    }));
    h.check(count > 0 && valid, `alle sporhoder har bilde eller ikon (${count})`);
    await checkReserves(page, page.getByTestId("anim-variant-tracks"), "Karakterspor");
    for (const width of [1280, 1600]) {
      await page.setViewportSize({ width, height: width === 1280 ? 900 : 1000 });
      const measurements = await page.getByTestId("anim-preview-pan").evaluate(el => {
        const preview = el.getBoundingClientRect();
        const panel = el.closest('[data-testid="anim-preview"]')?.getBoundingClientRect();
        const column = el.closest('[data-testid="anim-preview-resize"]')?.getBoundingClientRect();
        return { width: preview.width, height: preview.height, panelGap: panel ? panel.bottom - preview.bottom : Infinity, columnGap: column ? column.bottom - preview.bottom : Infinity };
      });
      h.check(measurements.height > 0 && measurements.panelGap <= 120 && measurements.columnGap <= 120,
        `${width}: ingen svart restflate over 120 px (${Math.round(measurements.columnGap)} px)`);
      const comp = h.rows.compositions.find(c => c.variant_id === occ.variant_id && !c.removed);
      h.check(comp && Math.abs(measurements.width / measurements.height - comp.width / comp.height) < 0.02, `${width}: bildeformat bevart`);
      await page.screenshot({ path: `${h.out}/animasjon-polish-${width}.png` });
    }
  });
} finally {
  h.rows.asset_versions = originalVersions;
}

await h.finish();
