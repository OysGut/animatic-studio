/** DV1: manuset som navigasjonsflate – klikk flytter avspillingshodet, dobbeltklikk åpner opptak med replikken. Ingen betalte kall. */
import { harness } from "./mts-harness.mjs";
if (!process.argv[3]) process.argv[3] = "/tmp/claude-0/visual-fixture.json";
const h = harness("/tmp/claude-0/dv1-script-nav");
const OCC = "00000000-0000-7000-8000-000000000006";
const LINE = "00000000-0000-7000-8000-000000000009";
const block = page => page.getByTestId("scene-script").locator(`[data-script-block="${LINE}"]`);

await h.scenario("dv1-click", OCC, "nb", async page => {
  await page.getByTestId("scene-script").waitFor();
  await block(page).locator("[data-script-text]").click();
  h.check(await h.eventually(async () => (await block(page).getAttribute("data-selected")) === "true", 2000), "enkeltklikk markerer replikken (M2)");
  const q = await block(page).getAttribute("data-seek-quality");
  h.check(q === "exact" || q === "estimated", `tiden vises som kjent eller estimert, ikke falsk presisjon (M5): ${q}`);
  h.check(await h.eventually(async () => (await page.getByTestId("script-seek-status").getAttribute("data-quality")) === q, 2000), "status for tiden vises under manuset");
  h.check((await page.getByTestId("script-seek-status").getAttribute("role")) === "status" || (await page.getByTestId("script-seek-status").getAttribute("aria-live")) === "polite", "statusen leses opp av skjermleser");
  h.check(!(await page.getByTestId("record-audio-dialog").isVisible().catch(() => false)), "enkeltklikk åpner ingen dialog");
  h.check(!h.state.commands.length, "navigasjon skriver ingenting i prosjektet");
  await page.screenshot({ path: `${h.out}/click.png` });
});

await h.scenario("dv1-dblclick", OCC, "nb", async page => {
  await page.getByTestId("scene-script").waitFor();
  await block(page).locator("[data-script-text]").dblclick();
  await page.getByTestId("record-audio-dialog").waitFor({ timeout: 5000 });
  h.check(await page.getByTestId("record-audio-dialog").isVisible(), "dobbeltklikk åpner den eksisterende opptaksdialogen (M3)");
  h.check((await page.getByTestId("record-line-select").inputValue()) === LINE, "riktig replikk er forhåndsvalgt (M4)");
  await page.waitForTimeout(500);
  h.check((await block(page).getAttribute("data-selected")) !== "true", "dobbeltklikk utfører ikke også enkeltklikket");
  h.check(!h.state.commands.length, "ingenting lagres ved å åpne dialogen");
  await page.screenshot({ path: `${h.out}/dblclick.png` });
});

await h.scenario("dv1-en", OCC, "en", async page => {
  await page.getByTestId("scene-script").waitFor();
  await block(page).locator("[data-script-text]").click();
  h.check(await h.eventually(async () => /Time from the link|The time is estimated/.test((await page.getByTestId("script-seek-status").textContent().catch(() => "")) ?? ""), 2000), "engelsk status for tiden");
  h.check(((await block(page).getAttribute("title")) ?? "").startsWith("Click to go here"), "engelsk verktøytips");
});
await h.finish();
