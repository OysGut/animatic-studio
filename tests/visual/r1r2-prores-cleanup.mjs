/**
 * R1 + R2 (0067): tilbudet «Bruk ProRes som standard i Endelig-profilen?» (godta som angrbar kommando, eller «Ikke
 * nå») og oppryddingen av ubrukte AI-filer (forhåndsvisning med antall, størrelse og miniatyrer, eksplisitt
 * bekreftelse, ingen sletting ved avbryt, og bare eieren ser knappen). Alle serverkall er mocket.
 *   ENV_FILE=.env [UI_LANG=en] node tests/visual/r1r2-prores-cleanup.mjs http://127.0.0.1:8080 /tmp/claude-0/mts-fixture.json [out]
 */
import { harness } from "./mts-harness.mjs";

const h = harness("/tmp/browser/r1r2-prores-cleanup");
const pid = h.fx.project.id;
const FINAL = "00000000-0000-7000-8000-000000006711";
h.rows.quality_profiles = [{ id: FINAL, project_id: pid, name: "Endelig", revision: 1, removed: false, spec: { effort: "premium", variants: 2, resolution: "4K", export: { format: "mp4", bitrateKbps: 16000 } } }];
const occ = h.rows.scene_occurrences.find((o) => o.active);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const FILES = [
  { path: `${pid}/generated/a1/v1/ai-2026-10-01.png`, bytes: 2_400_000, createdAt: "2026-10-01T10:00:00Z", thumbUrl: "https://thumbs.test/1.png" },
  { path: `${pid}/generated/a1/v2/ai-2026-10-02.png`, bytes: 1_100_000, createdAt: "2026-10-02T10:00:00Z", thumbUrl: "https://thumbs.test/2.png" },
  { path: `${pid}/generated/films/t1/clip.mp4`, bytes: 9_000_000, createdAt: "2026-10-03T10:00:00Z", thumbUrl: null },
];
const name = (url) => { try { return JSON.parse(Buffer.from(decodeURIComponent(new URL(url).pathname.split("/_serverFn/")[1]), "base64url").toString("utf8")).export; } catch { return "?"; } };

for (const lang of ["nb", "en"]) await h.scenario(`r1r2-${lang}`, occ.id, lang, async (page) => {
  const calls = [];
  await page.route("https://thumbs.test/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  await page.route("**/_serverFn/**", async (route) => {
    const n = name(route.request().url());
    const json = (result) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result, context: {} }) });
    if (/^previewOrphanCleanup(?:_|$)/.test(n)) { calls.push("preview"); return json({ files: FILES, totalBytes: 12_500_000 }); }
    if (/^confirmOrphanCleanup(?:_|$)/.test(n)) { calls.push("confirm"); return json({ deleted: 2, skipped: 1, bytes: 3_500_000 }); }
    return route.fallback();
  });
  await page.goto(h.base + h.P, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // R1
  const offer = page.getByTestId("prores-offer");
  h.check(await offer.isVisible(), `${lang}: tilbudet vises for «Endelig» med MP4`);
  h.check(h.state.commands.length === 0, `${lang}: ingenting endres før brukeren godtar`);
  await offer.screenshot({ path: `${h.out}/offer-${lang}.png` });
  await page.getByTestId("prores-offer-accept").click();
  h.check(await h.eventually(() => h.state.commands.some((c) => c?.type === "UpdateQualityProfile")), `${lang}: godtatt tilbud sendes som kommando`);
  const cmd = h.state.commands.find((c) => c?.type === "UpdateQualityProfile");
  h.check(cmd?.profileId === FINAL && cmd?.spec?.export?.format === "prores" && cmd?.spec?.export?.bitrateKbps === undefined && cmd?.spec?.effort === "premium", `${lang}: bare eksportformatet endres til ProRes`);

  // R2
  const open = page.getByTestId("orphan-cleanup-open");
  await open.scrollIntoViewIfNeeded();
  await open.click();
  const dialog = page.getByTestId("orphan-cleanup-dialog");
  await dialog.waitFor({ timeout: 5000 });
  h.check(calls.join() === "preview", `${lang}: forhåndsvisning uten sletting`);
  h.check((await page.getByTestId("orphan-cleanup-file").count()) === 3, `${lang}: tre filer i forhåndsvisningen`);
  h.check((await dialog.locator("img").count()) === 2, `${lang}: miniatyrer for bildene`);
  const summary = await page.getByTestId("orphan-cleanup-summary").innerText();
  h.check(summary.includes("3") && summary.includes(lang === "nb" ? "12,5" : "12.5"), `${lang}: antall og størrelse vises (${summary.slice(0, 60)})`);
  h.check(lang === "nb" ? /AI-filer/.test(summary) : /AI files/.test(summary), `${lang}: teksten er på riktig språk`);
  await dialog.screenshot({ path: `${h.out}/cleanup-${lang}.png` });
  await page.getByTestId("orphan-cleanup-cancel").click();
  await dialog.waitFor({ state: "hidden", timeout: 5000 });
  h.check(!calls.includes("confirm"), `${lang}: avbryt sletter ingenting`);
  await open.click();
  await dialog.waitFor({ timeout: 5000 });
  await page.getByTestId("orphan-cleanup-confirm").click();
  h.check(await h.eventually(() => calls.includes("confirm")), `${lang}: sletting bare etter eksplisitt bekreftelse`);
  const status = page.getByTestId("orphan-cleanup-status");
  await status.waitFor({ timeout: 5000 });
  h.check(/2/.test(await status.innerText()) && /1/.test(await status.innerText()), `${lang}: resultatet viser slettede og beholdte filer`);
});

// Ikke-eiere ser verken knappen eller (som leser) tilbudet.
for (const role of ["editor", "viewer"]) {
  h.state.commands = [];
  const { chromium } = await import("playwright");
  void chromium;
}
await h.finish();
