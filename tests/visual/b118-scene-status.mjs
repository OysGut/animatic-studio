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
  // Slå merkene på igjen før de andre scenevelgerne kontrolleres
  await page.getByTestId("scene-show-colors").click();
  await page.getByTestId("scene-show-status").click();

  // Felles scenevelger (SceneSelect) andre steder: firkant foran navnet, lik venstre x, tastatur og søk
  async function checkSelect(where, trigger) {
    await trigger.waitFor();
    h.check((await trigger.getAttribute("aria-haspopup")) === "listbox", `${where}: scenevelgeren er en tilgjengelig liste`);
    await trigger.click();
    const list = page.locator('[role="listbox"]').last();
    const o = list.locator('[role="option"]');
    await o.first().waitFor(); await page.waitForTimeout(600);
    const k = await o.count();
    const xs = [], cs = []; let first = true;
    for (let i = 0; i < k; i++) {
      const mark = o.nth(i).getByTestId("scene-mark");
      const sq = await mark.getByTestId("scene-mark-square").boundingBox();
      const nm = await mark.getByTestId("scene-mark-name").boundingBox();
      if (!sq || !nm || sq.x >= nm.x) first = false;
      xs.push(nm?.x ?? -1);
      cs.push(await mark.getByTestId("scene-mark-square").getAttribute("data-color"));
    }
    h.check(k > 1 && first, `${where}: firkanten står foran navnet i alle ${k} valg`);
    h.check(cs.includes("pink") && cs.includes(""), `${where}: valg med og uten farge (${cs.join(",")})`);
    h.check(xs.every((x) => Math.abs(x - xs[0]) < 0.5), `${where}: navnene har samme venstre x (${xs.map((x) => x.toFixed(1)).join(",")})`);
    h.check((await o.locator('[data-testid="scene-mark-status"][data-status="done"]').count()) >= 1, `${where}: statusikonet vises`);
    const search = page.locator('[role="combobox"][aria-controls]').last();
    h.check((await search.getAttribute("aria-activedescendant")) !== null, `${where}: aktivt valg meldes til skjermleser`);
    const before = await trigger.getAttribute("data-value");
    await page.keyboard.press("End");
    const lastValue = await o.nth(k - 1).getAttribute("data-value");
    await page.keyboard.press("Enter");
    h.check(await h.eventually(async () => (await trigger.getAttribute("data-value")) === lastValue && lastValue !== before), `${where}: End + Enter velger siste scene med tastaturet`);
    await page.screenshot({ path: `${h.out}/${lang}-${where}.png` });
  }

  await page.goto(`${h.base}${h.P}/rigg`, { waitUntil: "networkidle" });
  await checkSelect("rigg", page.getByTestId("rig-scene"));

  await page.goto(`${h.base}${h.P}/montering`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: lang === "en" ? "Export animatic" : "Eksporter animatic" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await checkSelect("eksport", dialog.getByRole("button", { name: lang === "en" ? /^First scene/ : /^Første scene/ }));
});
await h.finish();
