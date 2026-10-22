/**
 * B-118: scenestatus og scenefarge. Mockede tjenester (ingen betalte kall), nb og UI_LANG=en.
 * Setter status og farge i sceneeditorens toppmeny, kontrollerer 2 px-stripen, at firkanten står foran navnet i
 * scenevelgeren, at navn med og uten farge har samme venstre x, og at bryterne skjuler alt.
 *   ENV_FILE=.env [UI_LANG=en] node tests/visual/b118-scene-status.mjs
 */
import { harness } from "./mts-harness.mjs";
const h = harness("/tmp/browser/b118-scene-status");
const lang = process.env.UI_LANG ?? "nb";
const occs = h.rows.scene_occurrences.filter((o) => o.active);
const occ = occs[0];
if (!occ || occs.length < 3) throw new Error("Missing fixture");
// En annen scene har farge og status fra før, en tredje har ingen
occs[1].color = "pink";
occs[1].work_status = "done";

await h.scenario(`b118-${lang}`, occ.id, lang, async (page) => {
  const statusTrigger = page.getByTestId("scene-status-trigger");
  await statusTrigger.waitFor();
  const none = lang === "en" ? "No status" : "Ingen status";
  h.check((await statusTrigger.innerText()).includes(none), `${lang}: statusvelgeren viser «${none}»`);

  // Status
  await statusTrigger.click();
  await page.getByTestId("scene-status-option-review").click();
  h.check(await h.eventually(() => h.state.commands.some((c) => c?.type === "SetOccurrenceWorkStatus" && c.occurrenceId === occ.id && c.workStatus === "review")), `${lang}: SetOccurrenceWorkStatus sendt`);
  h.check(await h.eventually(async () => (await statusTrigger.getAttribute("data-status")) === "review"), `${lang}: velgeren viser ny status`);
  h.check((await statusTrigger.innerText()).includes(lang === "en" ? "For review" : "Til kontroll"), `${lang}: statusnavnet er oversatt`);

  // Farge
  await page.getByTestId("scene-color-trigger").click();
  await page.getByTestId("scene-color-option-teal").click();
  h.check(await h.eventually(() => h.state.commands.some((c) => c?.type === "SetOccurrenceColor" && c.occurrenceId === occ.id && c.color === "teal")), `${lang}: SetOccurrenceColor sendt`);
  const stripe = page.locator('main [data-testid="scene-color-stripe"]').first();
  h.check(await h.eventually(async () => (await stripe.getAttribute("data-color")) === "teal"), `${lang}: stripen har valgt farge`);
  const sb = await stripe.boundingBox();
  const mb = await page.locator("main").first().boundingBox();
  h.check(!!sb && !!mb && Math.abs(sb.height - 2) < 0.5 && Math.abs(sb.y - mb.y) < 0.5 && Math.abs(sb.width - mb.width) < 1, `${lang}: stripen er 2 px helt øverst i scenen (${JSON.stringify(sb)})`);
  await page.screenshot({ path: `${h.out}/${lang}-editor.png` });

  // Nedtrekkslisten: firkant foran navnet, lik venstrejustering
  await page.getByTestId("scene-picker-trigger").click();
  const opts = page.locator('[role="option"]');
  await opts.first().waitFor(); await page.waitForTimeout(600); // åpningsanimasjonen må være ferdig før måling
  const n = await opts.count();
  const xs = [], colors = [];
  let squareFirst = true;
  for (let i = 0; i < n; i++) {
    const mark = opts.nth(i).getByTestId("scene-mark");
    const sq = await mark.getByTestId("scene-mark-square").boundingBox();
    const name = await mark.getByTestId("scene-mark-name").boundingBox();
    if (!sq || !name || sq.x >= name.x) squareFirst = false;
    xs.push(name?.x ?? -1);
    colors.push(await mark.getByTestId("scene-mark-square").getAttribute("data-color"));
  }
  h.check(squareFirst, `${lang}: firkanten står foran navnet i alle ${n} rader`);
  h.check(colors.includes("pink") && colors.includes("teal") && colors.includes(""), `${lang}: rader med og uten farge (${colors.join(",")})`);
  h.check(xs.every((x) => Math.abs(x - xs[0]) < 0.5), `${lang}: navnene har samme venstre x (${xs.map((x) => x.toFixed(1)).join(",")})`);
  h.check((await opts.locator('[data-testid="scene-mark-status"][data-status="done"]').count()) === 1, `${lang}: statusikonet vises i listen`);
  await page.screenshot({ path: `${h.out}/${lang}-picker.png` });
  await page.keyboard.press("Escape");

  // Bryterne skjuler alt, men data beholdes
  await page.getByTestId("scene-show-colors").click();
  await page.getByTestId("scene-show-status").click();
  h.check(await h.eventually(async () => (await page.getByTestId("scene-color-stripe").count()) === 0), `${lang}: «Vis farger» av skjuler stripen`);
  await page.getByTestId("scene-picker-trigger").click();
  await opts.first().waitFor(); await page.waitForTimeout(600); // åpningsanimasjonen må være ferdig før måling
  h.check((await page.locator('[role="option"] [data-testid="scene-mark-square"]').count()) === 0, `${lang}: «Vis farger» av skjuler firkantene`);
  h.check((await page.locator('[role="option"] [data-testid="scene-mark-status"]').count()) === 0, `${lang}: «Vis status» av skjuler statusikonene`);
  const xs2 = [];
  for (let i = 0; i < n; i++) xs2.push((await opts.nth(i).getByTestId("scene-mark-name").boundingBox())?.x ?? -1);
  h.check(xs2.every((x) => Math.abs(x - xs2[0]) < 0.5), `${lang}: navnene står fortsatt likt uten merker`);
  await page.keyboard.press("Escape");
  h.check((await page.getByTestId("scene-status-trigger").getAttribute("data-status")) === "review" && (await page.getByTestId("scene-color-trigger").getAttribute("data-color")) === "teal", `${lang}: status og farge er beholdt`);
  const prefs = await page.evaluate(() => [localStorage.getItem("animatic:ui:scenes.showStatus"), localStorage.getItem("animatic:ui:scenes.showColors")]);
  h.check(prefs[0] === "false" && prefs[1] === "false", `${lang}: bryterne lagres som visningsvalg`);
  await page.screenshot({ path: `${h.out}/${lang}-hidden.png` });
});
await h.finish();
