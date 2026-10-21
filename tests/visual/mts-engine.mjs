/** MTS MT1–MT4, felles motor og frittstående tekst: A–E og AD–AH (MOTION_TYPOGRAPHY_SPEC.md, del M).
 * Fixture: bun tests/visual/make-mts-fixture.ts /tmp/claude-0/mts-fixture.json
 * ENV_FILE=… node tests/visual/mts-engine.mjs <baseUrl> /tmp/claude-0/mts-fixture.json [out]
 */
import { harness } from "./mts-harness.mjs";

const h = harness("/tmp/claude-0/mts-engine");
const { M, state, check, scenario, selectLayer, waitHidden, menu, lastFields, eventually } = h;
const added = () => state.commands.filter((c) => c?.type === "AddLayers").flatMap((c) => c.layers);
const updates = (id) => state.commands.filter((c) => c?.type === "UpdateLayers" && c.layers.some((l) => l.layerId === id));

await scenario("A-AD-legg-til-tekst", M.sceneA, "nb", async (page) => {
  await menu(page, "mts-add-text");
  await eventually(() => added().some((x) => x.fields.kind === "text"));
  const l = added().find((x) => x.fields.kind === "text");
  check(!!l, "A/AD: «Legg til tekst» lager et tekstlag på lerretet");
  check(l && l.fields.text.content.length > 0 && l.fields.assetId === null, "A: tekstlaget har tekst og ingen bilde");
  check(l && (await page.locator(`[data-layer-row="${l.layerId}"]`).count()) > 0, "AD: laget står i lagpanelet");
  check(await page.getByTestId("mts-text-content").isVisible(), "AD: tekstlaget er valgt og egenskapene vises");
});

await scenario("B-typografi-og-effekter", M.sceneA, "nb", async (page) => {
  await selectLayer(page, M.textLayer);
  await page.getByTestId("mts-font").selectOption("playfair-display");
  check(await eventually(() => lastFields(M.textLayer)?.text?.fontId === "playfair-display"), "B: font lagres på tekstlaget");
  const content = page.getByTestId("mts-text-content");
  await content.fill("Jula på Dovre – ÆØÅ æøå");
  await content.blur();
  check(await eventually(() => lastFields(M.textLayer)?.text?.content === "Jula på Dovre – ÆØÅ æøå"), "B: teksten med æ, ø og å lagres uendret");
  await page.getByTestId("mts-text-color").evaluate((el) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(el, "#ff8800");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  check(await eventually(() => lastFields(M.textLayer)?.text?.color === "#ff8800"), "B: farge lagres");
  await page.getByTestId("mts-effect-shadow").check();
  check(await eventually(() => !!lastFields(M.textLayer)?.effects?.shadow), "B: skygge lagres som effekt");
  await page.getByTestId("mts-effect-glow").check();
  check(await eventually(() => !!lastFields(M.textLayer)?.effects?.glow), "B: glød lagres som effekt");
  // Over grensen: melding, ingenting lagres
  const n = updates(M.textLayer).length;
  await content.fill("a".repeat(2001));
  await content.blur();
  await page.waitForTimeout(700);
  check(await page.getByTestId("mts-text-count").getAttribute("role") === "alert", "grense: over 2000 tegn gir tydelig melding");
  check(updates(M.textLayer).length === n, "grense: ingenting kuttes eller lagres");
});

await scenario("font-mangler", M.sceneA, "nb", async (page) => {
  await page.evaluate(() => window.__mtsForceMissingFont?.("cinzel"));
  await selectLayer(page, M.textLayer);
  await page.getByTestId("mts-font").selectOption("cinzel");
  await page.getByTestId("mts-font-missing").waitFor({ timeout: 5000 });
  check(await page.getByTestId("mts-font-missing").isVisible(), "§61: manglende font gir advarsel i egenskapspanelet");
});

await scenario("C-gruppe-animeres", M.sceneA, "nb", async (page) => {
  await selectLayer(page, M.instanceGroup);
  await page.getByTestId("mts-preset").selectOption("fade");
  await page.getByTestId("mts-preset-in").click();
  await eventually(() => lastFields(M.instanceGroup)?.keyframes?.length > 0);
  const f = lastFields(M.instanceGroup);
  check(f?.kind === "group" && f.keyframes.some((k) => k.property === "opacity"), "C: gruppen animeres med vanlige nøkkelbilder");
});

await scenario("D-AE-noekkelbilder", M.sceneA, "nb", async (page) => {
  await selectLayer(page, M.textLayer);
  await page.getByTestId("mts-preset").selectOption("slide");
  await page.getByTestId("mts-preset-in").click();
  await eventually(() => lastFields(M.textLayer)?.keyframes?.some((k) => k.property === "x"));
  const f = lastFields(M.textLayer);
  check(f?.keyframes.some((k) => k.property === "x") && f.keyframes.some((k) => k.property === "opacity"), "AE/D: skli inn gir nøkkelbilder for x og opasitet");
  await page.getByTestId("mts-preset-out").click();
  await eventually(() => (lastFields(M.textLayer)?.keyframes?.length ?? 0) > f.keyframes.length);
  const g = lastFields(M.textLayer);
  check(g && g.keyframes.length > f.keyframes.length, "D: ut-animasjonen legges til, inn-animasjonen beholdes");
  check(await page.getByTestId("scene-stage").isVisible(), "D: scenen kan forhåndsspilles med tekstlaget");
});

await scenario("AF-egne-effekter-og-bokstaver", M.sceneA, "nb", async (page) => {
  await selectLayer(page, M.textLayer);
  await page.getByTestId("mts-effect-outline").check();
  await page.getByTestId("mts-letter-effect").selectOption("appear");
  await eventually(() => lastFields(M.textLayer)?.text?.letterAnim?.effect === "appear" && !!lastFields(M.textLayer)?.effects?.outline);
  const f = lastFields(M.textLayer);
  check(f?.text?.letterAnim?.effect === "appear", "AF: bokstavanimasjon lagres som data på tekstlaget");
  check(!!f?.effects?.outline, "AF: konturen beholdes");
  check(f?.text?.content === "Jula på Dovre", "AF: teksten er fortsatt tekst");
});

await scenario("E-lagre-som-mal", M.sceneA, "nb", async (page) => {
  await selectLayer(page, M.textLayer);
  await page.getByTestId("mts-save-template").click();
  const dialog = page.getByTestId("mts-save-template-dialog");
  await dialog.waitFor({ timeout: 5000 });
  await page.getByTestId("mts-save-template-name").fill("Tittelmal");
  await page.getByTestId("mts-save-template-category").selectOption("title");
  await page.getByTestId("mts-save-template-confirm").click();
  await waitHidden(dialog);
  await eventually(() => state.commands.some((c) => c?.type === "AddAssetVersion"));
  const created = state.commands.find((c) => c?.type === "CreateAssets");
  check(created?.assets?.[0]?.fields?.kind === "template", "E: malen blir en ressurs av typen «template»");
  const ver = state.commands.find((c) => c?.type === "AddAssetVersion");
  check(ver?.template?.category === "title" && ver.template.slots.length === 1, "E: versjonen bærer maldefinisjonen med tekstfeltet");
  check(await eventually(() => state.uploads.some((u) => u.endsWith(".png"))), "E: miniatyren lastes opp som PNG");
});

await scenario("AG-gjenbruk-i-annen-scene", M.sceneB, "nb", async (page) => {
  await menu(page, `mts-apply-template-${M.templateAsset}`);
  await eventually(() => state.commands.some((x) => x?.type === "ApplyTemplate"));
  const c = state.commands.find((x) => x?.type === "ApplyTemplate");
  const inst = c?.steps?.find((s) => s.type === "AddTemplateInstance");
  check(inst?.fields?.compositionId === M.compB, "AG: malen brukes i en annen scene");
  check(inst?.fields?.templateVersionId === M.v2, "AG: nyeste malversjon brukes ved ny bruk");
  check(c?.steps?.some((s) => s.type === "AddLayers" && s.layers.length === 4), "AG: design og animasjon blir vanlige lag");
});

await scenario("MT4-bilde-i-malminiatyr", M.sceneA, "nb", async (page) => {
  const comp = h.rows.compositions.find(c => c.id === M.compA);
  const imageLayer = h.rows.composition_layers.find(l => l.composition_id === comp?.id && l.asset_id && !l.removed);
  if (!imageLayer) throw new Error("fixturen mangler bildelag");
  await selectLayer(page, imageLayer.id);
  await page.getByTestId("mts-save-template").click();
  await page.getByTestId("mts-save-template-name").fill("Bildemal");
  await page.getByTestId("mts-save-template-confirm").click();
  await waitHidden(page.getByTestId("mts-save-template-dialog"));
  check(await eventually(() => state.uploadBodies.length > 0), "MT4: bildemalens miniatyr er lastet opp");
  const raw = state.uploadBodies[0];
  const start = raw?.indexOf(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ?? -1;
  const pixels = start < 0 ? 0 : await page.evaluate(async b64 => {
    const image = new Image();
    image.src = `data:image/png;base64,${b64}`;
    await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, image.width, image.height).data;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] > 210 && data[i + 1] > 140 && data[i + 1] < 205 && data[i + 2] < 100 && data[i + 3] > 200) n++;
    return n;
  }, raw.subarray(start).toString("base64"));
  check(pixels > 100, `MT4: lagret PNG inneholder testbildets gule felt (${pixels} bildepunkter), ikke en tom reserve`);
});

await scenario("AH-lokal-tekst", M.sceneA, "nb", async (page) => {
  await selectLayer(page, M.instanceName);
  const field = page.getByTestId("mts-template-field-navn");
  await field.fill("Øystein Gutu");
  await field.blur();
  await eventually(() => state.commands.some((x) => x?.type === "ApplyTemplate"));
  const c = state.commands.find((x) => x?.type === "ApplyTemplate");
  check(c?.steps?.[0]?.type === "UpdateTemplateInstance" && c.steps[0].fields.values.navn.text === "Øystein Gutu", "AH: innholdet lagres på forekomsten");
  check(!state.commands.some((x) => x?.type === "AddAssetVersion" || x?.type === "UpdateAsset"), "AH: den lagrede malen endres ikke");
});

await scenario("engelsk", M.sceneA, "en", async (page) => {
  await page.getByTestId("mts-text-menu").click();
  const text = await page.getByTestId("mts-add-text").innerText();
  check(/Add text/.test(text), "engelsk: menyen er på engelsk");
  await page.keyboard.press("Escape");
  await waitHidden(page.getByTestId("mts-add-text"));
  await selectLayer(page, M.textLayer);
  const panel = await page.getByTestId("mts-text-content").locator("xpath=ancestor::section").innerText();
  check(/Content/.test(panel) && !/Innhold/.test(panel), "engelsk: tekstdelen i egenskapspanelet er på engelsk");
});

await h.finish();
