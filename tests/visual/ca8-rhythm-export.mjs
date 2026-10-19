/** CA8: rytmeverktøyet (oransje) med forhåndsvisning og én RetimeScene, og eksportvalg per lag. Ingen betalte kall. */
import { harness } from "./mts-harness.mjs";
if (!process.argv[3]) process.argv[3] = "/tmp/claude-0/visual-fixture.json";
const h = harness("/tmp/claude-0/ca8-rhythm-export");
const ID = n => `01900000-0000-7000-8000-0058${String(n).padStart(8, "0")}`;
const layer = h.rows.composition_layers.find(l => !l.removed && l.asset_id && h.rows.asset_versions.some(v => h.rows.asset_variants.some(a => a.id === v.variant_id && a.asset_id === l.asset_id) && v.mime_type.startsWith("image/")));
const comp = h.rows.compositions.find(c => c.id === layer?.composition_id), occ = h.rows.scene_occurrences.find(o => o.variant_id === comp?.variant_id && o.active);
const source = h.rows.asset_versions.find(v => v.id === layer?.version_id) ?? h.rows.asset_versions.find(v => h.rows.asset_variants.some(a => a.id === v.variant_id && a.asset_id === layer?.asset_id));
if (!layer || !comp || !occ || !source) throw new Error("Missing fixture");
const pid = h.fx.project.id;
const part = { versionId: source.id, drawing: [], mask: [], x: 0, y: 0, width: .2, height: .1, rotation: 0, adjustments: { brightness: 1, contrast: 1, saturation: 1, hue: 0, opacity: 1 } };
h.rows.animation_rigs = [{ id: ID(1), project_id: pid, revision: 1, variant_id: source.variant_id, current_version_id: ID(2), removed: false }];
h.rows.animation_rig_versions = [{ id: ID(2), project_id: pid, revision: 1, rig_id: ID(1), source_version_id: source.id, number: 1, spec: { format: 1, anchors: { mouth: { x: .5, y: .6 } }, parts: { "mouth:X": part } }, algorithm_version: 1, removed: false }];
h.rows.animation_uses = [{ id: ID(3), project_id: pid, revision: 1, layer_id: layer.id, occurrence_id: occ.id, rig_version_id: ID(2), enabled: true, removed: false, behavior: null }];
const dialogue = h.rows.audio_clips.filter(c => c.occurrence_id === occ.id && !c.removed && c.kind === "dialogue");

await h.scenario("ca8-rhythm", occ.id, "nb", async page => {
  await page.getByTestId("scene-tab-animation").click();
  await page.getByTestId("ca8-rhythm-open").click();
  await page.getByTestId("ca8-rhythm-panel").waitFor();
  h.check((await page.getByTestId("ca8-rhythm-open").getAttribute("class"))?.includes("accent-warm"), "rytmeverktøyet er oransje markert");
  const before = await page.getByTestId("ca8-rhythm-new-duration").textContent();
  h.check(await page.getByTestId("ca8-rhythm-apply").isDisabled(), "uten endring kan ingenting brukes");
  await page.getByTestId("ca8-rhythm-tempo").fill("0.5");
  h.check(await h.eventually(async () => (await page.getByTestId("ca8-rhythm-new-duration").textContent()) !== before), "forhåndsvisningen viser ny scenetid");
  h.check(await page.getByTestId("ca8-rhythm-gap-0").isVisible(), "mellomrommene før og etter vises");
  if (dialogue[0]) {
    h.check(await page.getByTestId(`ca8-rhythm-weight-${dialogue[0].id}`).isVisible(), "vekt per replikk");
    await page.getByTestId(`ca8-rhythm-pause-${dialogue[0].id}`).fill("3");
  } else h.check(true, "scenen uten replikker bruker bare takt");
  h.check(!h.state.commands.some(c => c.type === "RetimeScene"), "ingenting lagres før «Bruk»");
  await page.screenshot({ path: `${h.out}/rhythm.png` });
  await page.getByTestId("ca8-rhythm-apply").click();
  h.check(await h.eventually(() => h.state.commands.filter(c => c.type === "RetimeScene").length === 1), "«Bruk» kjører én RetimeScene (én angring)");
  const cmd = h.state.commands.find(c => c.type === "RetimeScene");
  h.check(cmd?.steps?.every(s => ["UpdateComposition", "UpdateLayers", "UpdateAudioClips", "SetAudioClipsRemoved", "UpdateTimeLinks", "SetTransition", "SetPlannedDuration"].includes(s.type)), "bare vanlige tidstrinn");
});
await h.scenario("ca8-rhythm-discard", occ.id, "nb", async page => {
  await page.getByTestId("scene-tab-animation").click();
  await page.getByTestId("ca8-rhythm-open").click();
  await page.getByTestId("ca8-rhythm-tempo").fill("2");
  await page.getByTestId("ca8-rhythm-discard").click();
  await page.waitForTimeout(300);
  h.check(!h.state.commands.length, "«Forkast» lagrer ingenting");
});
await h.scenario("ca8-export", occ.id, "nb", async page => {
  await page.getByTestId("scene-tab-animation").click();
  await page.locator(`[data-anim-track="${layer.id}"]`).getByTestId("anim-segment").first().click();
  await page.getByTestId("ca7-character-open").click();
  await page.getByTestId("ca8-export-mouth").waitFor();
  h.check(await page.getByTestId("ca8-export-mouth").isChecked(), "munnformer er med som standard");
  await page.getByTestId("ca8-export-mouth").uncheck();
  h.check(await h.eventually(() => h.state.commands.some(c => c.type === "SetAnimationBehavior" && c.behavior?.export?.mouth === false && c.behavior.export.blink === true)), "munnformer kan utelates per lag");
  await page.getByTestId("ca8-export-mode").selectOption("separate");
  h.check(await h.eventually(() => h.state.commands.some(c => c.type === "SetAnimationBehavior" && c.behavior?.export?.mode === "separate")), "eget lag kan velges");
  for (const k of ["blink", "overlay", "masks", "adjust"]) h.check(await page.getByTestId(`ca8-export-${k}`).isVisible(), `valg for ${k}`);
  await page.screenshot({ path: `${h.out}/export.png` });
});
await h.scenario("ca8-en", occ.id, "en", async page => {
  await page.getByTestId("scene-tab-animation").click();
  h.check((await page.getByTestId("ca8-rhythm-open").textContent())?.includes("Rhythm"), "engelsk rytmeknapp");
  await page.getByTestId("ca8-rhythm-open").click();
  h.check((await page.getByTestId("ca8-rhythm-new-duration").textContent())?.includes("New scene time"), "engelsk «New scene time»");
});
await h.finish();
