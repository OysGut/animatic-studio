/** DV7: avvik mellom manus og lyd (A1–A12, R1–R6). Alle tjenestekall er mocket; ingen ElevenLabs-kall. */
import { harness } from "./mts-harness.mjs";
const h = harness("/tmp/browser/dv7");
const { driftOcc, driftBlock, driftClip } = h.M;
const character = h.rows.assets.find(a => a.kind === "character");
if (!driftOcc || !driftBlock || !character) throw new Error("fixture: mangler replikk med avvik");
for (const lang of ["nb", "en"]) await h.scenario(`dv7-${lang}`, driftOcc, lang, async page => {
  const badge = page.locator(`[data-testid="drift-badge"][data-block-id="${driftBlock}"]`).first();
  h.check(await h.eventually(() => badge.count().then(n => n > 0), 6000), "status icon in the scene editor script");
  h.check(await badge.getAttribute("data-drift-status") === "drift", "one shared status: drift");
  h.check(await page.locator(`[data-testid="scene-dialogue-segment"][data-clip-id="${driftClip}"]`).getAttribute("data-drift") === "true", "red segment in the scene timeline");
  await badge.click();
  const pop = page.getByTestId("drift-popover");
  h.check(await pop.isVisible(), "explanation opens");
  h.check(await pop.getByTestId("drift-diff").locator(".text-status-danger").count() > 0, "changed words shown in red");
  h.check(await pop.getByTestId("drift-removed").count() > 0, "removed text shown in the overview");
  await pop.screenshot({ path: `${h.out}/${lang}-popover.png` });
  h.state.commands = [];
  await pop.getByTestId("drift-review").click();
  h.check(await h.eventually(() => h.state.commands.some(c => c.type === "ReviewDialogueDrift" && c.clipId === driftClip), 4000), "explicit review writes a command");
  // Lenke ut: åpner scenen ved replikken, uten autoavspilling
  await page.goto(`${h.base}${h.P}/scene?scene=${driftOcc}&line=${driftBlock}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  h.check(!(await page.getByRole("button", { name: lang === "nb" ? "Pause" : "Pause" }).first().isVisible().catch(() => false)), "playback does not start automatically");
  // Animasjonsfanen: rødt segment i karaktersporet
  await page.goto(`${h.base}${h.P}/scene?scene=${driftOcc}&fane=animation`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  h.check(await page.locator('[data-drift="true"]').count() > 0, "red segment in the animation tab");
  // Manusutforskeren
  await page.goto(`${h.base}/manusutforsker/${h.fx.project.id}?scene=${driftOcc}&modus=search`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  h.check(await page.getByTestId("script-explorer-drift").isVisible().catch(() => false), "drift list in the script explorer");
  // Lyd/Stemme: «Generer alle røde replikker» med samme dialog og kostnadsport
  await page.goto(`${h.base}${h.P}/bibliotek?asset=${character.id}`, { waitUntil: "networkidle" });
  await page.getByTestId("dialogue-drift-open").click();
  const lines = page.getByTestId("dialogue-batch-dialog").getByTestId("dialogue-batch-line");
  h.check(await lines.count() > 0, "red lines listed");
  h.check((await lines.evaluateAll(ls => ls.every(l => l.getAttribute("data-drift") === "true"))), "only red lines");
  h.check(!h.state.rpcs.some(r => r.name === "createDialogueBatch"), "nothing generated before approval");
  await page.getByTestId("dialogue-batch-dialog").screenshot({ path: `${h.out}/${lang}-batch.png` });
});
await h.finish();
