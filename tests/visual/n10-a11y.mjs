/**
 * N10: tilgjengelighet i sceneeditoren og manuset. axe-core (WCAG 2.1 A/AA, inkl. kontrast) på nb og en, og
 * målrettede tastaturkontroller: synlig fokus, ingen fokusfelle, dialoger returnerer fokus, mellomrom spiller
 * av/stopper når fokus ikke er i et tekstfelt, og live-regioner som ikke oppdateres per bilde.
 * Mockede serverfunksjoner og lagring (mts-harness.mjs); ingen betalte kall.
 *   bun tests/visual/make-mts-fixture.ts /tmp/claude-0/mts-fixture.json
 *   ENV_FILE=.env node tests/visual/n10-a11y.mjs <baseUrl> /tmp/claude-0/mts-fixture.json [out]
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { harness } from "./mts-harness.mjs";

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const h = harness("/tmp/browser/n10-a11y");
const clip = h.rows.audio_clips.find((c) => c.kind === "dialogue" && c.block_id && !c.removed);
if (!clip) throw new Error("fixture");
const occ = clip.occurrence_id;
const VERBOSE = process.env.A11Y_VERBOSE === "1";

async function axe(page, label) {
  await page.addScriptTag({ content: AXE });
  const res = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, nodes: v.nodes.slice(0, 6).map((x) => `${x.target.join(" ")} :: ${(x.failureSummary || "").split("\n").slice(1, 2).join(" ").slice(0, 160)}`) }));
  });
  if (VERBOSE) for (const v of res) console.log(`    [${label}] ${v.id} (${v.impact}) x${v.n}\n      ${v.nodes.join("\n      ")}`);
  h.check(res.length === 0, `${label}: ingen axe-avvik (WCAG 2.1 AA)${res.length ? ": " + res.map((v) => `${v.id}×${v.n}`).join(", ") : ""}`);
}

const PAGES = [
  { name: "sceneeditor", path: `${h.P}/scene?scene=${occ}` },
  { name: "sceneeditor-animasjon", path: `${h.P}/scene?scene=${occ}&fane=animation` },
  { name: "manus", path: `${h.P}/manus` },
];

for (const lang of ["nb", "en"]) {
  await h.scenario(`a11y-${lang}`, occ, lang, async (page) => {
    for (const p of PAGES) {
      await page.goto(`${h.base}${p.path}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(2000);
      await axe(page, `${p.name} ${lang}`);
    }
  });
}

await h.scenario("tastatur", occ, "nb", async (page) => {
  // Synlig fokus og ingen fokusfelle: Tab gjennom 120 steg, alle fokuserte elementer har synlig markering
  await page.locator("body").click({ position: { x: 2, y: 2 } }).catch(() => {});
  const seen = new Set();
  let invisible = [];
  let stuck = 0, last = "";
  for (let i = 0; i < 120; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return { key: "body", visible: true };
      const s = getComputedStyle(el);
      const ring = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== "none");
      const key = el.outerHTML.slice(0, 80);
      return { key, visible: ring, label: el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 30) || el.tagName };
    });
    if (!info.visible) invisible.push(info.label);
    stuck = info.key === last ? stuck + 1 : 0;
    last = info.key;
    seen.add(info.key);
  }
  invisible = [...new Set(invisible)];
  h.check(stuck < 3, "Tab kommer seg videre (ingen fokusfelle)");
  h.check(seen.size > 30, `Tab når mange kontroller (${seen.size})`);
  h.check(invisible.length === 0, `alle fokuserte kontroller har synlig fokus (${invisible.slice(0, 8).join(" | ")})`);

  // Mellomrom spiller av og stopper når fokus ikke er i et tekstfelt
  await page.evaluate(() => (document.activeElement)?.blur?.());
  const playing = () => page.evaluate(() => document.querySelector('[data-testid="scene-editor"]')?.getAttribute("data-playing") ?? document.querySelector("[data-playing]")?.getAttribute("data-playing"));
  const before = await playing();
  await page.keyboard.press("Space");
  await page.waitForTimeout(400);
  const during = await playing();
  await page.keyboard.press("Space");
  await page.waitForTimeout(300);
  const after = await playing();
  h.check(before === "false" && during === "true" && after === "false", `mellomrom spiller av og stopper (${before}→${during}→${after})`);

  // Mellomrom i et tekstfelt skriver mellomrom og starter ikke avspilling
  const input = page.locator('[data-testid="scene-editor"] input[type="text"], [data-testid="scene-editor"] textarea').first();
  if (await input.count()) {
    await input.focus();
    await page.keyboard.press("Space");
    await page.waitForTimeout(300);
    h.check((await playing()) === "false", "mellomrom i et tekstfelt starter ikke avspilling");
    await page.keyboard.press("Backspace");
  }

  // Live-region for avspillingsstatus finnes og endres ikke per bilde
  const live = page.locator('[data-testid="playback-status"][aria-live]');
  h.check((await live.count()) === 1, "avspillingsstatus har en live-region");
  const tc = page.locator('[data-testid="timecode"]');
  h.check((await tc.count()) > 0 && (await tc.first().getAttribute("aria-live")) !== "polite" && (await tc.first().getAttribute("aria-live")) !== "assertive", "tidskoden annonseres ikke per bilde");
  await page.evaluate(() => (document.activeElement)?.blur?.());
  const texts = [];
  await page.keyboard.press("Space");
  for (let i = 0; i < 8; i++) { texts.push(await live.first().textContent()); await page.waitForTimeout(120); }
  await page.keyboard.press("Space");
  await page.waitForTimeout(300);
  const stopped = await live.first().textContent();
  h.check(new Set(texts).size === 1 && texts[0], `live-regionen endres ikke under avspilling (${[...new Set(texts)].join(" | ")})`);
  h.check(stopped && stopped !== texts[0], `live-regionen melder stopp (${stopped})`);
});

await h.scenario("dialog-fokus", occ, "nb", async (page) => {
  const target = page.getByTestId("scene-script").locator(`[data-script-block="${clip.block_id}"] [data-script-text]`);
  await target.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog").first();
  const opened = await dialog.waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
  if (!opened) { await target.dblclick(); await dialog.waitFor({ timeout: 5000 }); }
  h.check(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), "fokus flyttes inn i dialogen");
  for (let i = 0; i < 40; i++) await page.keyboard.press("Tab");
  h.check(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), "fokus holdes i den modale dialogen");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden", timeout: 5000 });
  h.check(await page.evaluate(() => !!document.activeElement?.closest("[data-script-block]")), "Escape lukker og fokus går tilbake til replikken");
});

const { fail } = await h.finish();
process.exit(fail ? 1 : 0);
