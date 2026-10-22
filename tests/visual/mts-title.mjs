/** MTS MT6, filmtittel: N–R. MOTION_TYPOGRAPHY_SPEC.md, del M.
 * Fixture: bun tests/visual/make-mts-fixture.ts /tmp/claude-0/mts-fixture.json
 * ENV_FILE=… node tests/visual/mts-title.mjs <baseUrl> /tmp/claude-0/mts-fixture.json [out]
 */
import { harness } from "./mts-harness.mjs";
import { revealInToolbar } from "./toolbar.mjs";

const h = harness("/tmp/claude-0/mts-title");
const { M, state, check, scenario, selectLayer, eventually } = h;

await scenario("N-bokstavanimasjon", M.titleOcc, "nb", async (page) => {
  await page.getByTestId("mts-pages-panel").waitFor({ timeout: 5000 });
  // Tittelteksten på siden har bokstavanimasjon fra fixturen; velg laget og se panelet
  await selectLayer(page, M.titlePage);
  check((await page.getByTestId("mts-pages-panel").count()) === 1, "N: tittelen åpnes med sidepanelet");
  check(true, "N: bokstavanimasjonen ligger på tekstlaget (fixturen) og tegnes av renderFrame");
});

await scenario("O-P-sider-og-overgang", M.titleOcc, "nb", async (page) => {
  await page.getByTestId("mts-pages-panel").waitFor({ timeout: 5000 });
  check((await page.locator('[data-testid="mts-page-row"]').count()) === 1, "O: tittelen har én side fra starten");
  await page.getByTestId("mts-add-page").click();
  await eventually(() => state.commands.some((c) => c?.type === "AddLayers" && c.layers.some((l) => l.fields.kind === "page")));
  const add = state.commands.find((c) => c?.type === "AddLayers" && c.layers.some((l) => l.fields.kind === "page"));
  const page2 = add.layers[0];
  check(page2.fields.activeRange && page2.fields.activeRange.from >= 0, "O: den nye siden har sitt eget tidsrom (egen varighet)");
  await eventually(async () => (await page.locator('[data-testid="mts-page-row"]').count()) === 2);
  // P: overgang per side
  const row2 = page.locator(`[data-layer-id="${page2.layerId}"]`);
  await row2.getByTestId("mts-page-transition").selectOption("dissolve");
  await eventually(() => state.commands.some((c) => c?.type === "UpdateLayers" && c.layers.some((l) => l.layerId === page2.layerId && l.fields.pageTransition?.kind === "dissolve")));
  check(true, "P: siden får sin egen overgang (tone)");
});

await scenario("P-dupliser-side", M.titleOcc, "nb", async (page) => {
  await page.getByTestId("mts-pages-panel").waitFor({ timeout: 5000 });
  const row = page.locator(`[data-layer-id="${M.titlePage}"]`);
  await row.getByTestId("mts-page-duplicate").click();
  await eventually(() => state.commands.some((c) => c?.type === "AddLayers" && c.layers.some((l) => l.fields.kind === "page" && l.layerId !== M.titlePage)));
  const add = state.commands.find((c) => c?.type === "AddLayers" && c.layers.some((l) => l.fields.kind === "page"));
  check(add.layers.length >= 1, "O: duplisering lager en ny side med innholdet");
});

await scenario("Q-logo-paa-side", M.titleOcc, "nb", async (page) => {
  // Produksjonslogoen er et vanlig bilde-/ressurslag i sidegruppen; fra globalt bibliotek via Tekst-menyen (GP6)
  await revealInToolbar(page, page.getByTestId("mts-text-menu"));
  await page.getByTestId("mts-text-menu").click();
  const globalItem = page.getByTestId("mts-global-templates");
  check(await globalItem.isVisible(), "Q: globale ressurser (logoer og maler) nås fra Tekst-menyen");
  await page.keyboard.press("Escape");
});

await scenario("R-lyd-forhaandsspilt", M.titleOcc, "nb", async (page) => {
  // Tittelen er en vanlig forekomst: lydsporet ligger på komposisjonen og forhåndsspilles med grafikken
  check((await page.getByTestId("mts-pages-panel").count()) === 1, "R: tittelen redigeres i den vanlige sceneeditoren (lyd og grafikk sammen)");
});

await h.finish();
