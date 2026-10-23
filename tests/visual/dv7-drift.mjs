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
  h.check(page.url().includes("/bibliotek?asset=" + character.id), "REQ-0813: red-line action opens from the character library");
  const lines = page.getByTestId("dialogue-batch-dialog").getByTestId("dialogue-batch-line");
  h.check(await lines.count() > 0, "red lines listed");
  h.check((await lines.evaluateAll(ls => ls.every(l => l.getAttribute("data-drift") === "true"))), "only red lines");
  h.check(!h.state.rpcs.some(r => r.name === "createDialogueBatch"), "nothing generated before approval");
  // N11 REQ-0815/0816: valget og pris/språk kontrolleres i avvikslisten, ikke bare vanlig batch.
  const before = await lines.evaluateAll(ls => ls.map(l => l.checked));
  await lines.first().uncheck();
  const after = await lines.evaluateAll(ls => ls.map(l => l.checked));
  h.check(before[0] === true && after[0] === false && after.slice(1).every((v, i) => v === before[i + 1]), "REQ-0815: individual red line can be deselected without changing others");
  await lines.first().check();
  await page.getByTestId("dialogue-batch-together").check();
  const estimate = page.getByTestId("dialogue-batch-estimate");
  h.check(await estimate.isVisible() && /\$\d+\.\d{2}/.test(await estimate.innerText()), "REQ-0816: cost is shown before generating red lines");
  h.check((await estimate.innerText()).includes("(nb)"), "REQ-0816: language is shown with the cost before generating red lines");
  h.check(!h.state.rpcs.some(r => r.name === "createDialogueBatch"), "REQ-0816: inspecting cost and language never starts generation");
  await page.getByTestId("dialogue-batch-dialog").screenshot({ path: `${h.out}/${lang}-batch.png` });
});
await h.finish();
