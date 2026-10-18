/** MTS MT4, ikke-destruktiv gjenbruk: AI–AJ (AK–AL og M1–M5 kommer i senere runder). MOTION_TYPOGRAPHY_SPEC.md.
 * Fixture: bun tests/visual/make-mts-fixture.ts /tmp/claude-0/mts-fixture.json (malen har versjon 1 i bruk og en nyere versjon 2)
 * ENV_FILE=… node tests/visual/mts-nondestructive.mjs <baseUrl> /tmp/claude-0/mts-fixture.json [out]
 */
import { harness } from "./mts-harness.mjs";

const h = harness("/tmp/claude-0/mts-nondestructive");
const { M, state, check, scenario, selectLayer, eventually } = h;
const { base, P } = h;

await scenario("AI-ny-versjon-endrer-ingenting", M.sceneA, "nb", async (page) => {
  check(state.commands.length === 0, "AI: å åpne scenen med en nyere malversjon sender ingen endringer");
  await selectLayer(page, M.instanceRole);
  await page.getByTestId("mts-template-newer").waitFor({ timeout: 5000 });
  check(await page.getByTestId("mts-template-newer").isVisible(), "AI: egenskapspanelet varsler om ny malversjon");
  check(state.commands.length === 0, "AI: forekomsten er uendret til brukeren velger");
});

await scenario("AJ-behold-eller-oppdater", M.sceneA, "nb", async (page) => {
  await selectLayer(page, M.instanceName);
  // Lokal justering: nytt navn i forekomsten
  const field = page.getByTestId("mts-template-field-navn");
  await field.fill("Lokal endring");
  await field.blur();
  await eventually(() => state.commands.length > 0);
  check(!state.commands.some((c) => c?.steps?.some((s) => s.type === "UpdateTemplateInstance" && s.fields.templateVersionId === M.v2)), "AJ: eksisterende malversjon beholdes når innholdet endres");
  await page.getByTestId("mts-template-update").click();
  await eventually(() => state.commands.some((c) => c?.steps?.some((s) => s.type === "UpdateTemplateInstance" && s.fields.templateVersionId === M.v2)));
  const up = state.commands.find((c) => c?.steps?.some((s) => s.type === "UpdateTemplateInstance" && s.fields.templateVersionId === M.v2));
  check(!!up, "AJ: «Oppdater til ny versjon» bytter til versjon 2 i én kommando");
  const role = up?.steps?.find((s) => s.type === "UpdateLayers")?.layers?.find((l) => l.layerId === M.instanceRole);
  check(role?.fields?.text?.color === "#ff3300", "AJ: endringen i den nye malversjonen kommer med");
  const name = up?.steps?.find((s) => s.type === "UpdateLayers")?.layers?.find((l) => l.layerId === M.instanceName);
  check(!name || name.fields.text.content === "Lokal endring", "AJ: det lokale innholdet beholdes");
  await page.getByTestId("mts-template-newer").waitFor({ state: "hidden", timeout: 5000 });
  check(true, "AJ: varselet forsvinner etter oppdateringen");
});

await scenario("AK-originale-bilder-bevares", M.sceneA, "nb", async (page) => {
  // Oppdatering til ny malversjon bytter ikke ut bilde-/logolag i forekomsten (bare felt som malen styrer)
  await selectLayer(page, M.instanceName);
  await page.getByTestId("mts-template-update").click();
  await eventually(() => state.commands.some((c) => c?.steps?.some((s) => s.type === "UpdateTemplateInstance")));
  const up = state.commands.find((c) => c?.steps?.some((s) => s.type === "UpdateTemplateInstance"));
  const touched = up.steps.flatMap((s) => (s.type === "UpdateLayers" ? s.layers.map((l) => l.layerId) : []));
  check(touched.every((id) => id === M.instanceName || id === M.instanceRole), "AK: bare tekstlagene røres; logoer og bilder i forekomsten bevares");
  const fields = up.steps.find((s) => s.type === "UpdateLayers")?.layers ?? [];
  check(fields.every((l) => !l.fields.versionId), "AK: ingen bildeversjoner byttes ut");
});

await scenario("AL-eksport-er-ikke-destruktiv", M.sceneA, "nb", async (page) => {
  // Eksporten tegner med renderFrame og endrer aldri komposisjonen: ingen kommandoer sendes
  await page.goto(`${h.base}${h.P}/montering`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByText("Eksporter", { exact: false }).first().click();
  await page.getByTestId("export-include-credits").waitFor({ timeout: 5000 });
  check(state.commands.length === 0, "AL: eksportdialogen endrer ingenting");
  await page.keyboard.press("Escape");
  await page.goto(`${h.base}${h.P}/scene?scene=${M.sceneA}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  check((await page.locator("[data-layer-row]").count()) > 0, "AL: komposisjonen er fortsatt redigerbar etter eksporten");
});

await h.finish();
