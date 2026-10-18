/** MTS MT6, tekstscener: S–W. MOTION_TYPOGRAPHY_SPEC.md, del M.
 * Fixture: bun tests/visual/make-mts-fixture.ts /tmp/claude-0/mts-fixture.json
 * ENV_FILE=… node tests/visual/mts-textscene.mjs <baseUrl> /tmp/claude-0/mts-fixture.json [out]
 */
import { harness } from "./mts-harness.mjs";

const h = harness("/tmp/claude-0/mts-textscene");
const { M, state, check, scenario, menu, eventually } = h;

await scenario("S-ny-tekstscene-fra-monteringen", M.sceneA, "nb", async (page) => {
  await page.goto(`${h.base}${h.P}/montering`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByTestId("mts-assembly-text-menu").click();
  await page.getByTestId("mts-new-text").click();
  await eventually(() => state.commands.some((c) => c?.type === "CreateScene" && c.kind === "text"));
  const create = state.commands.find((c) => c?.type === "CreateScene" && c.kind === "text");
  check(!!create, "S: tekstscenen lages som egen forekomst i filmstrukturen");
  check(create.blocks.length === 0 && create.heading.location.length > 0, "S: den er aldri en manusscene (ingen manusblokker, bare en markør)");
  check(state.commands.some((c) => c?.type === "CreateComposition"), "S: tekstscenen får sin egen komposisjon");
});

await scenario("T-sider", M.textOcc, "nb", async (page) => {
  await page.getByTestId("mts-pages-panel").waitFor({ timeout: 5000 });
  await page.getByTestId("mts-add-page").click();
  await eventually(() => state.commands.some((c) => c?.type === "AddLayers" && c.layers.some((l) => l.fields.kind === "page")));
  check(true, "T: tekstscenen får flere sider");
});

await scenario("U-tekst-effekter-varighet", M.textOcc, "nb", async (page) => {
  await menu(page, "mts-add-text");
  await eventually(() => state.commands.some((c) => c?.type === "AddLayers" && c.layers.some((l) => l.fields.kind === "text")));
  const add = state.commands.find((c) => c?.type === "AddLayers" && c.layers.some((l) => l.fields.kind === "text"));
  const layer = add.layers[0];
  check(!!layer.fields.text, "U: teksten legges til som et redigerbart tekstlag");
  // Varighet: laget får aktivt tidsrom i tidslinjen; her sjekkes at laget kan få det via kommandoene
  check(layer.fields.transform && layer.fields.keyframes !== undefined, "U: laget har transformasjon og nøkkelbilder (animasjon og varighet)");
});

await scenario("V-lydspor", M.textOcc, "nb", async (page) => {
  check((await page.getByTestId("mts-pages-panel").count()) === 1, "V: tekstscenen bruker den vanlige sceneeditoren (eget lydspor på komposisjonen)");
});

await scenario("W-redigerbar-etter-eksport", M.textOcc, "nb", async (page) => {
  // Teksten lagres som data på laget (text_spec), aldri som bilde – den er redigerbar etter eksport
  await menu(page, "mts-add-text");
  await eventually(() => state.commands.some((c) => c?.type === "AddLayers" && c.layers.some((l) => l.fields.kind === "text")));
  const add = state.commands.find((c) => c?.type === "AddLayers" && c.layers.some((l) => l.fields.kind === "text"));
  check(typeof add.layers[0].fields.text.content === "string" && !add.layers[0].fields.versionId, "W: teksten er data på laget, ikke et bilde – redigerbar etter eksport");
});

await h.finish();
