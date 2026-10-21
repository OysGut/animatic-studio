/** CA2 §114: mock services, fixed image variants, one-frame events and preserved layer transforms. */
import { harness } from "./mts-harness.mjs";
if (!process.argv[3]) process.argv[3] = "/tmp/claude-0/visual-fixture.json";
const h = harness("/tmp/claude-0/ca2-variants");
const layer = h.rows.composition_layers.find(l => !l.removed && l.asset_id);
const comp = h.rows.compositions.find(c => c.id === layer?.composition_id);
const occ = h.rows.scene_occurrences.find(o => o.variant_id === comp?.variant_id);
if (!layer || !comp || !occ) throw new Error("Fixture requires an image layer and scene occurrence");
const versions = h.rows.asset_versions.filter(v => !v.removed && v.mime_type.startsWith("image/") && h.rows.asset_variants.some(a => a.id === v.variant_id && a.asset_id === layer.asset_id));
if (!versions.length) throw new Error("Fixture requires image versions");
// All events retain the original asset. Exactly one frame between events 1 and 2.
layer.image_swaps = [
  { frame: 7, assetId: layer.asset_id, assetVariantId: versions[0].variant_id, versionId: versions[0].id },
  { frame: 8, assetId: layer.asset_id, assetVariantId: versions.at(-1).variant_id, versionId: versions.at(-1).id },
];
await h.scenario("ca2-variants", occ.id, "nb", async page => {
  await (async () => { const g = page.getByTestId("scene-track-groups"); await g.waitFor(); if ((await g.getAttribute("data-open")) !== "true") await page.getByTestId("scene-track-groups-toggle").click(); await page.getByTestId("animation-workspace").waitFor(); })();
  const track = page.locator(`[data-anim-track="${layer.id}"]`);
  await track.waitFor();
  const segments = track.getByTestId("anim-segment");
  h.check(await segments.count() === 3, "alle bildevarianter på lagsporet");
  h.check((await track.textContent()).includes(layer.name), "lagnavn");
  h.check(await track.locator("img").count() > 0, "miniatyrbilder");
  const single = segments.nth(1), longer = segments.nth(2);
  const singleBox = await single.boundingBox(), longBox = await longer.boundingBox();
  h.check(Math.abs(singleBox.width - singleBox.height) <= 2, "ett frame er kvadrat");
  h.check(longBox.width > singleBox.width, "lengre segment er bredere");
  await single.hover();
  h.check(await h.eventually(() => single.getByTestId("anim-segment-hover").isVisible()), "større bilde ved peker");
  await longer.click();
  await page.getByTestId("anim-segment-replace").click();
  await page.getByTestId("anim-variant-picker").waitFor();
  await page.getByTestId("asset-studio-version").first().click();
  h.check(await h.eventually(() => h.state.commands.some(c => c.type === "UpdateLayers")), "variantbytte bruker eksisterende kommando");
  const fields = h.state.commands.find(c => c.type === "UpdateLayers")?.layers[0]?.fields;
  h.check(fields?.assetId === layer.asset_id, "samme ressursidentitet");
  h.check(JSON.stringify(fields?.transform) === JSON.stringify(layer.transform), "transformasjonen beholdes");
  h.check(JSON.stringify(fields?.keyframes) === JSON.stringify(layer.keyframes), "keyframes og easing beholdes");
  h.check(fields?.swaps.length === 2, "bytte erstatter uten å opprette flere hendelser");
  const clip = h.rows.audio_clips.find(c => !c.removed && c.occurrence_id === occ.id && c.kind === "dialogue" && (!c.language || c.language === "nb"));
  if (clip) {
    const dialogue = page.getByTestId("anim-dialogue-segment").filter({ has: page.locator("span") }).first();
    await dialogue.waitFor();
    h.check(await dialogue.getAttribute("data-block-id") === clip.block_id, "replikkkobling");
    if (clip.version_id) h.check(await dialogue.getAttribute("data-take-id") === clip.version_id, "scenens valgte take");
    await dialogue.click();
    h.check(await h.eventually(() => page.getByRole("dialog").isVisible()), "eksisterende lydredigering åpnes");
  }
});
await h.scenario("ca2-en", occ.id, "en", async page => {
  await (async () => { const g = page.getByTestId("scene-track-groups"); await g.waitFor(); if ((await g.getAttribute("data-open")) !== "true") await page.getByTestId("scene-track-groups-toggle").click(); await page.getByTestId("animation-workspace").waitFor(); })();
  await page.locator(`[data-anim-track="${layer.id}"]`).getByTestId("anim-segment").first().click();
  h.check((await page.getByTestId("anim-segment-replace").getAttribute("aria-label")).includes("Replace image"), "engelsk variantverktøy");
  await page.getByTestId("anim-segment-replace").click();
  h.check((await page.getByRole("dialog").textContent()).includes("Choose image variant"), "engelsk variantdialog");
});
await h.finish();
