/**
 * R5: plakateksporten (PDF og PNG) på norsk og engelsk. Erstatter plakatsteget (60–66) i den avviklede
 * tests/visual/screens.mjs. Elementer finnes med data-testid, ikke med tekst. Alle serverkall er mocket.
 *   bun tests/visual/make-fixture.ts /tmp/claude-0/visual-fixture.json
 *   ENV_FILE=.env [UI_LANG=en] node tests/visual/r5-poster-export.mjs http://127.0.0.1:8080 /tmp/claude-0/visual-fixture.json [out]
 */
import { harness } from "./mts-harness.mjs";
import { readFileSync } from "node:fs";
if (!process.argv[3] || process.argv[3].includes("mts-fixture")) process.argv[3] = "/tmp/claude-0/visual-fixture.json";
const h = harness("/tmp/browser/r5-poster-export");
const occ = h.rows.scene_occurrences.find((o) => o.active) ?? h.rows.scene_occurrences[0];
if (!h.rows.posters?.length) throw new Error("Missing poster fixture");

for (const lang of ["nb", "en"]) await h.scenario(`r5-poster-${lang}`, occ.id, lang, async (page) => {
  await page.goto(h.base + h.P + "/utgivelse", { waitUntil: "networkidle" });
  const open = page.getByTestId("poster-export-open");
  await open.waitFor({ timeout: 10000 });
  h.check(await page.getByRole("application").first().isVisible(), `${lang}: plakaten vises`);
  await open.click();
  const start = page.getByTestId("poster-export-start");
  await start.waitFor();
  await page.getByRole("dialog").screenshot({ path: `${h.out}/export-${lang}.png` });
  let dl = page.waitForEvent("download", { timeout: 30000 });
  await start.click();
  let d = await dl, path = `${h.out}/poster-${lang}.pdf`; await d.saveAs(path);
  h.check(readFileSync(path).subarray(0, 5).toString("latin1") === "%PDF-", `${lang}: PDF lastes ned (${d.suggestedFilename()})`);
  await page.getByTestId("poster-export-png").check();
  dl = page.waitForEvent("download", { timeout: 30000 });
  await start.click();
  d = await dl; path = `${h.out}/poster-${lang}.png`; await d.saveAs(path);
  const png = readFileSync(path);
  h.check(png.subarray(1, 4).toString("latin1") === "PNG" && png.readUInt32BE(16) > 0, `${lang}: PNG lastes ned (${d.suggestedFilename()})`);
  const types = h.state.commands.map((c) => c?.type ?? "?");
  h.check(!types.includes("UpdatePoster"), `${lang}: eksporten endrer ikke plakaten (${types.join(",")})`);
});

await h.finish();
