/** MTS MT4, ikke-destruktiv gjenbruk: AI–AJ (AK–AL og M1–M5 kommer i senere runder). MOTION_TYPOGRAPHY_SPEC.md.
 * Fixture: bun tests/visual/make-mts-fixture.ts /tmp/claude-0/mts-fixture.json (malen har versjon 1 i bruk og en nyere versjon 2)
 * ENV_FILE=… node tests/visual/mts-nondestructive.mjs <baseUrl> /tmp/claude-0/mts-fixture.json [out]
 */
import { harness } from "./mts-harness.mjs";

const h = harness("/tmp/claude-0/mts-nondestructive");
const { M, state, check, scenario, selectLayer, eventually } = h;

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

await h.finish();
