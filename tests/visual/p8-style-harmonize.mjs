/**
 * P8 AI-stilharmonisering (REQ-0137–0145, REQ-0400–0402): sceneeditor, Asset Studio og plakat, på norsk og
 * engelsk. Alle serverfunksjoner er mocket (ingen AI, ingen betalte kall).
 *   bun tests/visual/make-fixture.ts /tmp/claude-0/visual-fixture.json
 *   ENV_FILE=… node tests/visual/p8-style-harmonize.mjs <baseUrl> /tmp/claude-0/visual-fixture.json [out]
 */
import { harness } from "./mts-harness.mjs";
import { byLang } from "./ui-lang.mjs";
if (!process.argv[3]) process.argv[3] = "/tmp/claude-0/visual-fixture.json";
const h = harness("/tmp/browser/p8");
const MAJA = "00000000-0000-7000-8000-0000000000a2";
const LAYER = "00000000-0000-7000-8000-0000000000bb";
const PROFILE = "00000000-0000-7000-8000-000000085001";
h.rows.style_profiles = [{ id: PROFILE, project_id: h.fx.project.id, revision: 1, name: "Filmens stil", is_default: true, removed: false, applies_to: [], guide: { version: 1, premise: "", world: "Dovre i snø", audience: "", visualStyle: "Akvarell med myke kanter", technique: "Akvarell på papir", palette: { colors: ["#0d1b2a"], description: "Vinterblått" }, lighting: "Lav vintersol", mood: "Varm", characterDesign: "Enkle former", environmentDesign: "", composition: "", avoid: "Fotorealisme", instructions: "", referenceVersionIds: [] } }];
const occ = h.rows.scene_occurrences.find((o) => o.active && h.rows.compositions.some((c) => c.variant_id === o.variant_id)) ?? h.rows.scene_occurrences[0];
const poster = h.rows.posters[0];

async function harmonizeFlow(page, lang, where) {
  const panel = page.getByTestId("harmonize-panel");
  await panel.waitFor({ timeout: 8000 });
  h.check(await page.getByTestId("harmonize-warning").isVisible(), `${where}: identitetsadvarsel vises`);
  h.check((await page.getByTestId("harmonize-profile").inputValue()) === PROFILE, `${where}: standard stilprofil valgt`);
  h.check(await page.getByTestId("harmonize-source-reference").isVisible(), `${where}: referansebilde kan velges`);
  await panel.getByRole("button", { name: byLang(lang, "Harmoniser …", "Harmonize …") }).click();
  h.check(!h.state.rpcs.some((r) => r.name === "generateImage"), `${where}: ingen generering før bekreftelse`);
  h.check(await panel.getByRole("alertdialog").isVisible(), `${where}: eksplisitt kostnadsbekreftelse`);
  await panel.getByRole("button", { name: byLang(lang, "Ja, generer", "Yes, generate") }).click();
  h.check(await h.eventually(() => h.state.rpcs.some((r) => r.name === "generateImage"), 5000), `${where}: genereringen startet etter «Ja»`);
  const call = h.state.rpcs.find((r) => r.name === "generateImage")?.body;
  h.check(call?.approved === true && call?.identityFirst === true, `${where}: bekreftet og identiteten først`);
  // B-105a: malen (stildimensjoner og identitetsinstruks) settes sammen på serveren; klienten sender bare oppgaven
  h.check(call?.promptRequest?.kind === "harmonize" && !/Drawing style/.test(JSON.stringify(call?.system ?? "")), `${where}: serveren setter sammen prompten (oppgaven harmonize sendt)`);
  await page.getByTestId("harmonize-compare").waitFor({ timeout: 5000 });
  h.check(await page.getByTestId("harmonize-compare-range").isVisible(), `${where}: skyver i sammenligningen`);
  await page.getByTestId("harmonize-compare-toggle-mode").click();
  h.check(await page.getByTestId("harmonize-compare-toggle").isVisible(), `${where}: veksling i sammenligningen`);
  h.check(h.state.commands.length === 0, `${where}: ingenting lagret før godkjenning`);
  await panel.screenshot({ path: `${h.out}/${where}-compare-${lang}.png` });
}

for (const lang of ["nb", "en"]) {
  await h.scenario(`p8-scene-${lang}`, occ.id, lang, async (page) => {
    await h.selectLayer(page, LAYER);
    await page.getByTestId("layer-harmonize").click();
    await harmonizeFlow(page, lang, "scene");
    await page.getByTestId("harmonize-use-local").click();
    h.check(await h.eventually(() => h.state.commands.some((c) => c.type === "ApplyHarmonizedImage"), 5000), "scene: «bare her» lagret via kommando");
    const apply = h.state.commands.find((c) => c.type === "ApplyHarmonizedImage");
    h.check(apply?.fields?.use === "local" && apply?.newVariant?.archived === true, "scene: lokal overstyring i arkivert variant");
    h.check(await h.eventually(() => h.state.commands.some((c) => c.type === "UpdateLayers" || c.type === "UpdateLayer"), 5000), "scene: laget peker på det harmoniserte bildet");
    h.check(!h.state.commands.some((c) => c.type === "SetPreferredStyleReference"), "scene: ingen automatisk referanse eller publisering");
  });

  await h.scenario(`p8-variant-${lang}`, occ.id, lang, async (page) => {
    await h.selectLayer(page, LAYER);
    await page.getByTestId("layer-harmonize").click();
    await harmonizeFlow(page, lang, "variant");
    await page.getByTestId("harmonize-use-variant").click();
    await page.getByTestId("harmonize-saved").waitFor({ timeout: 5000 });
    const apply = h.state.commands.find((c) => c.type === "ApplyHarmonizedImage");
    h.check(apply?.fields?.use === "variant" && !apply?.newVariant?.archived, "variant: ny synlig variant");
    h.check(/Filmens stil/.test(await page.getByTestId("harmonize-saved-note").innerText()), "variant: «Laget med profil X»");
    await page.getByTestId("harmonize-mark-preferred").click();
    h.check(await h.eventually(() => h.state.commands.some((c) => c.type === "SetPreferredStyleReference"), 5000), "variant: foretrukket referanse med eget klikk");
    h.check(!h.state.rpcs.some((r) => /saveAssetToGlobal/.test(r.name)), "variant: ikke publisert automatisk");
    await page.getByTestId("harmonize-panel").screenshot({ path: `${h.out}/variant-saved-${lang}.png` });
  });

  await h.scenario(`p8-batch-${lang}`, occ.id, lang, async (page) => {
    await h.selectLayer(page, LAYER);
    await page.getByTestId("layer-harmonize").click();
    await page.getByTestId("harmonize-batch-open").click();
    const choices = page.getByTestId("harmonize-batch-choice");
    h.check((await choices.count()) >= 2, "batch: flere karakterer kan velges");
    for (let i = 0; i < (await choices.count()); i++) await choices.nth(i).check();
    const bp = page.getByTestId("harmonize-batch-panel");
    await bp.getByRole("button", { name: /Harmoniser \d+ …|Harmonize \d+ …/ }).click();
    h.check(!h.state.rpcs.some((r) => r.name === "createHarmonizeBatch"), "batch: ingen jobb før godkjenning");
    const est = await bp.getByTestId("harmonize-batch-estimate").innerText();
    h.check(/\$/.test(est) && /\d+ (genereringer|generations)/.test(est), "batch: samlet kostnadsanslag med antall");
    await bp.screenshot({ path: `${h.out}/batch-confirm-${lang}.png` });
    await bp.getByRole("button", { name: byLang(lang, "Ja, generer", "Yes, generate") }).click();
    h.check(await h.eventually(() => h.state.rpcs.some((r) => r.name === "createHarmonizeBatch"), 5000), "batch: én godkjenning lager én jobb");
    const req = h.state.rpcs.find((r) => r.name === "createHarmonizeBatch")?.body;
    h.check(req?.approved === true && req?.styleProfileId === PROFILE && new Set(req.items.map((i) => i.assetId)).size === req.items.length, "batch: bekreftet, stilprofil og ett element per karakter");
    h.check(await h.eventually(() => page.getByTestId("harmonize-batch-item").count().then((n) => n > 0), 5000), "batch: fremdrift per karakter");
    await bp.screenshot({ path: `${h.out}/batch-progress-${lang}.png` });
  });

  await h.scenario(`p8-studio-${lang}`, occ.id, lang, async (page) => {
    await h.selectLayer(page, LAYER);
    await page.getByTestId("open-asset-studio").click();
    await page.getByTestId("asset-studio-harmonize").click();
    await page.getByTestId("harmonize-panel").waitFor({ timeout: 8000 });
    h.check(true, "studio: «Harmoniser stil …» åpner panelet");
    await page.getByTestId("harmonize-panel").screenshot({ path: `${h.out}/studio-${lang}.png` });
  });

  await h.scenario(`p8-poster-${lang}`, occ.id, lang, async (page) => {
    await page.goto(h.base + h.P + "/utgivelse");
    await page.waitForTimeout(1500);
    const el = poster.document.elements.find((e) => e.kind === "image" && e.assetId === MAJA);
    await page.locator("#release-tab-element").click().catch(() => {});
    await page.getByTestId("poster-element-select").selectOption(el.id);
    await page.getByTestId("poster-harmonize").click();
    await harmonizeFlow(page, lang, "poster");
    await page.getByTestId("harmonize-use-local").click();
    h.check(await h.eventually(() => h.state.commands.some((c) => c.type === "ApplyHarmonizedImage"), 5000), "poster: harmonisert bilde lagret");
    h.check(await h.eventually(() => h.state.commands.some((c) => c.type === "UpdatePoster"), 5000), "poster: bare dette plakatelementet endret");
  });
}
await h.finish();
