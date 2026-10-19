/** CA3: fixed services, relative marking, immutable rig versions and reversible per-scene disable. */
import { harness } from "./mts-harness.mjs";
if (!process.argv[3]) process.argv[3] = "/tmp/claude-0/visual-fixture.json";
const h = harness("/tmp/claude-0/ca3-rig");
const layer = h.rows.composition_layers.find(l => !l.removed && l.asset_id && h.rows.asset_versions.some(v => v.variant_id === l.asset_variant_id && v.mime_type.startsWith("image/")));
const comp = h.rows.compositions.find(c => c.id === layer?.composition_id);
const occ = h.rows.scene_occurrences.find(o => o.variant_id === comp?.variant_id && o.active);
const source = h.rows.asset_versions.find(v => v.id === layer?.version_id) ?? h.rows.asset_versions.find(v => v.variant_id === layer?.asset_variant_id);
if (!layer || !comp || !occ || !source) throw new Error("Missing composed image fixture");
const ID = n => `01900000-0000-7000-8000-0053${String(n).padStart(8, "0")}`;
const anchors = { head: { x: .5, y: .2 }, mouth: { x: .5, y: .6 }, nose: { x: .5, y: .4 }, leftEye: { x: .4, y: .3 }, rightEye: { x: .6, y: .3 } };
// Existing saved setup makes the test exercise edits and scene pinning, not empty-state creation alone.
h.rows.animation_rigs = [{ id: ID(1), project_id: h.fx.project.id, revision: 1, variant_id: source.variant_id, current_version_id: ID(2), removed: false }];
h.rows.animation_rig_versions = [{ id: ID(2), project_id: h.fx.project.id, revision: 1, rig_id: ID(1), source_version_id: source.id, number: 1, spec: { format: 1, anchors }, algorithm_version: 1, removed: false }];
h.rows.animation_uses = [{ id: ID(3), project_id: h.fx.project.id, revision: 1, layer_id: layer.id, occurrence_id: occ.id, rig_version_id: ID(2), enabled: true, removed: false }];
await h.scenario("ca3-mark", occ.id, "nb", async page => {
  await page.getByTestId("scene-tab-animation").click();
  await page.locator(`[data-anim-track="${layer.id}"]`).getByTestId("anim-segment").first().click();
  await page.getByTestId("ca3-mark-face").click();
  await page.getByTestId("ca3-face-dialog").waitFor();
  h.check(await page.getByTestId("ca3-point-head").isVisible(), "lagrede ankerpunkter åpnes");
  await page.getByTestId("ca3-face-zoom").selectOption("2");
  h.check(await page.getByTestId("ca3-face-zoom").inputValue() === "2", "zoom");
  await page.getByTestId("ca3-face-zoom").selectOption("1");
  for (const [key, point] of Object.entries(anchors)) {
    await page.getByTestId(`ca3-anchor-${key}`).click();
    const box = await page.getByTestId("ca3-face-image").boundingBox();
    await page.mouse.click(box.x + box.width * point.x, box.y + box.height * point.y);
    h.check(Math.abs(Number(await page.getByTestId(`ca3-point-${key}`).getAttribute("data-x")) - point.x) < .01, `relativt ${key}`);
  }
  await page.getByRole("button", { name: "Panorer bildet", exact: true }).click();
  const stage = await page.getByTestId("ca3-face-stage").boundingBox();
  const before = await page.getByTestId("ca3-face-image").boundingBox();
  await page.mouse.move(stage.x + 40, stage.y + 40); await page.mouse.down(); await page.mouse.move(stage.x + 65, stage.y + 55); await page.mouse.up();
  const after = await page.getByTestId("ca3-face-image").boundingBox();
  h.check(Math.abs(after.x - before.x - 25) < 1, "panorering flytter visningen");
  await page.getByTestId("ca3-coordinate-mouth-x").fill("0.45");
  await page.getByTestId("ca3-face-save").click();
  h.check(await h.eventually(() => h.state.commands.some(c => c.type === "UpdateSceneDraft")), "én samlet lagring");
  const command = h.state.commands.find(c => c.type === "UpdateSceneDraft");
  const mark = command?.steps.find(c => c.type === "SetRigAnchors");
  h.check(mark?.anchors.mouth.x === .45 && mark.versionId !== ID(2), "ny versjon og relative koordinater");
  h.check(command?.steps.some(c => c.type === "AttachAnimationUse" && c.occurrenceId === occ.id), "bare valgt scene tar versjonen i bruk");
  h.check(!command?.steps.some(c => c.type === "UpdateLayers" || c.type === "AddAssetVersion"), "originalbilde og transformasjon er urørt");
  h.check(await h.eventually(() => page.getByTestId("ca3-animation-enabled").getAttribute("aria-pressed").then(v => v === "true")), "animasjonen er på");
  await page.getByTestId("ca3-animation-enabled").click();
  h.check(await h.eventually(() => h.state.commands.some(c => c.type === "SetAnimationLayerEnabled" && c.enabled === false)), "av uten sletting");
  await page.getByTestId("ca3-animation-enabled").click();
  h.check(await h.eventually(() => h.state.commands.some(c => c.type === "SetAnimationLayerEnabled" && c.enabled === true)), "på igjen");
  await page.screenshot({ path: `${h.out}/ca3-rig.png` });
});
await h.scenario("ca3-en", occ.id, "en", async page => {
  await page.getByTestId("scene-tab-animation").click();
  await page.locator(`[data-anim-track="${layer.id}"]`).getByTestId("anim-segment").first().click();
  await page.getByTestId("ca3-mark-face").click();
  h.check(await page.getByRole("heading", { name: "Mark face", exact: true }).isVisible(), "engelsk dialog");
  h.check((await page.getByTestId("ca3-anchor-leftEye").textContent()) === "Left eye", "engelske ankerpunkter");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  h.check(h.state.commands.length === 0, "Avbryt skriver ingenting");
});
await h.finish();
