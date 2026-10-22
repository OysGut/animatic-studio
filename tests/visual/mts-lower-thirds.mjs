/** MTS MT5, lower thirds: X–AB (AC kommer med MT9). MOTION_TYPOGRAPHY_SPEC.md, del M.
 * Fixture: bun tests/visual/make-mts-fixture.ts /tmp/claude-0/mts-fixture.json
 * ENV_FILE=… node tests/visual/mts-lower-thirds.mjs <baseUrl> /tmp/claude-0/mts-fixture.json [out]
 */
import { harness } from "./mts-harness.mjs";
import { byLang } from "./ui-lang.mjs";
import { revealInToolbar } from "./toolbar.mjs";

const h = harness("/tmp/claude-0/mts-lower-thirds");
const { M, state, check, scenario, selectLayer, waitHidden, menu, eventually } = h;

await scenario("X-lag-lower-third-mal", M.sceneA, "nb", async (page) => {
  await menu(page, "mts-add-lower-third");
  const add = state.commands.find((c) => c?.type === "AddLayers");
  const kinds = (add?.layers ?? []).map((l) => l.fields.kind);
  check(kinds[0] === "group" && kinds.filter((k) => k === "text").length === 2, "X: ny lower third er en gruppe med navn og rolle");
  const name = add.layers.find((l) => l.fields.kind === "text");
  await selectLayer(page, name.layerId);
  await page.getByTestId("mts-save-template").click();
  const dialog = page.getByTestId("mts-save-template-dialog");
  await dialog.waitFor({ timeout: 5000 });
  check(await page.getByTestId("mts-save-template-category").inputValue() === "lower_third", "X: typen er lower third");
  await page.getByTestId("mts-save-template-name").fill("Min lower third");
  await page.getByTestId("mts-save-template-confirm").click();
  await waitHidden(dialog);
  await eventually(() => state.commands.some((c) => c?.type === "AddAssetVersion"));
  const ver = state.commands.find((c) => c?.type === "AddAssetVersion");
  check(ver?.template?.category === "lower_third" && ver.template.slots.map((s) => s.key).join(",") === byLang("nb", "navn,rolle", "name,role"), "X: malen har feltene navn og rolle");
});

await scenario("Y-bruk-i-scene", M.sceneA, "nb", async (page) => {
  await page.locator(`[data-layer-row="${M.instanceGroup}"]`).first().waitFor({ timeout: 15000 }).catch(() => {});
  check((await page.locator(`[data-layer-row="${M.instanceGroup}"]`).count()) > 0, "Y: malen er brukt i scene A (forekomsten vises som lag)");
  await selectLayer(page, M.instanceName);
  check(await page.getByTestId("mts-template-instance").isVisible(), "Y: egenskapspanelet viser malen og innholdet");
});

await scenario("Z-AA-AB-samme-design", M.sceneB, "nb", async (page) => {
  await menu(page, `mts-same-design-${M.instance}`);
  await eventually(() => state.commands.some((x) => x?.type === "ApplyTemplate"));
  const c = state.commands.find((x) => x?.type === "ApplyTemplate");
  const inst = c?.steps?.find((s) => s.type === "AddTemplateInstance");
  check(inst && inst.instanceId !== M.instance, "Z: «Bruk samme design» lager en ny forekomst (ny rad)");
  check(inst?.fields?.templateVersionId === M.v1 && inst.fields.compositionId === M.compB, "Z: samme malversjon som i scene A, i scene B");
  const layers = c.steps.find((s) => s.type === "AddLayers").layers;
  const nameLayer = layers.find((l) => l.fields.template?.slot === "navn");
  // Velg det nye navnelaget og endre innholdet
  await selectLayer(page, nameLayer.layerId);
  const n = state.commands.length;
  const field = page.getByTestId("mts-template-field-navn");
  await field.fill("Øystein Gutu");
  await field.blur();
  const role = page.getByTestId("mts-template-field-rolle");
  await role.fill("Produsent");
  await role.blur();
  await eventually(() => state.commands.slice(n).filter((x) => x?.type === "ApplyTemplate").length === 2);
  const later = state.commands.slice(n).filter((x) => x?.type === "ApplyTemplate");
  check(later.length === 2, "AA: navn og rolle endres i egenskapspanelet");
  const touched = later.flatMap((x) => x.steps.flatMap((s) => (s.type === "UpdateTemplateInstance" ? [s.instanceId] : s.layers?.map((l) => l.layerId) ?? [])));
  check(touched.every((id) => id !== M.instance && id !== M.instanceName && id !== M.instanceRole), "AB: endringen i scene B rører ikke scene A");
  check(!state.commands.some((x) => x?.type === "AddAssetVersion"), "AB: malen endres ikke");
});

await scenario("engelsk", M.sceneB, "en", async (page) => {
  await revealInToolbar(page, page.getByTestId("mts-text-menu"));
  await page.getByTestId("mts-text-menu").click();
  const text = await page.getByTestId(`mts-same-design-${M.instance}`).locator("xpath=..").innerText();
  check(/Use the same design as in/.test(text) && /New lower third/.test(text), "engelsk: menyvalgene er på engelsk");
  check(!/Bruk samme design/.test(text), "engelsk: ingen norsk tekst i menyen");
  await page.keyboard.press("Escape");
});

await h.finish();
