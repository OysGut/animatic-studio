/** CA6: blinking per øye, manuelle blink og navngitte mønstre med seed. Ingen betalte kall. */
import { harness } from "./mts-harness.mjs";
if (!process.argv[3]) process.argv[3] = "/tmp/claude-0/visual-fixture.json";
const h = harness("/tmp/claude-0/ca6-blink-patterns");
const ID = n => `01900000-0000-7000-8000-0056${String(n).padStart(8, "0")}`;
const layer = h.rows.composition_layers.find(l => !l.removed && l.asset_id && h.rows.asset_versions.some(v => h.rows.asset_variants.some(a => a.id === v.variant_id && a.asset_id === l.asset_id) && v.mime_type.startsWith("image/")));
const comp = h.rows.compositions.find(c => c.id === layer?.composition_id), occ = h.rows.scene_occurrences.find(o => o.variant_id === comp?.variant_id && o.active);
const source = h.rows.asset_versions.find(v => v.id === layer?.version_id) ?? h.rows.asset_versions.find(v => h.rows.asset_variants.some(a => a.id === v.variant_id && a.asset_id === layer?.asset_id));
if (!layer || !comp || !occ || !source) throw new Error("Missing fixture");
h.rows.animation_rigs = [{ id: ID(1), project_id: h.fx.project.id, revision: 1, variant_id: source.variant_id, current_version_id: ID(2), removed: false }];
h.rows.animation_rig_versions = [{ id: ID(2), project_id: h.fx.project.id, revision: 1, rig_id: ID(1), source_version_id: source.id, number: 1, spec: { format: 1, anchors: { leftEye: { x: .4, y: .3 }, rightEye: { x: .6, y: .3 } } }, algorithm_version: 1, removed: false }];
h.rows.animation_uses = [{ id: ID(3), project_id: h.fx.project.id, revision: 1, layer_id: layer.id, occurrence_id: occ.id, rig_version_id: ID(2), enabled: true, removed: false, behavior: null }];
h.rows.animation_patterns = [{ id: ID(13), project_id: h.fx.project.id, revision: 1, rig_id: null, name: "Nervøs blinking", color: "#a1b2c3", spec: { format: 1, target: "eyes", intervalMinMs: 2000, intervalMaxMs: 5000, durationMinFrames: 2, durationMaxFrames: 4, intensity: 1, seed: 18427, vary: { interval: true, duration: false, intensity: false }, algorithmVersion: 1 }, removed: false }];

async function openAnim(page) {
  await (async () => { const g = page.getByTestId("scene-track-groups"); await g.waitFor(); if ((await g.getAttribute("data-open")) !== "true") await page.getByTestId("scene-track-groups-toggle").click(); await page.getByTestId("animation-workspace").waitFor(); })();
  await page.locator(`[data-anim-track="${layer.id}"]`).getByTestId("anim-segment").first().click();
}
await h.scenario("ca6-blink", occ.id, "nb", async page => {
  await openAnim(page);
  await page.getByTestId("blink-panel-open").click();
  await page.getByTestId("blink-enabled").waitFor();
  h.check(await page.getByTestId("blink-enabled").getAttribute("aria-pressed") === "true", "automatisk blinking er på som standard");
  await page.getByTestId("blink-enabled").click();
  h.check(await h.eventually(() => h.state.commands.some(c => c.type === "SetAnimationBehavior" && c.behavior?.blinkEnabled === false)), "av/på uten å slette oppsettet");
  await page.getByTestId("blink-pattern-left").selectOption(ID(13));
  h.check(await h.eventually(() => h.state.commands.some(c => c.type === "SetAnimationBehavior" && c.behavior?.leftEyePatternId === ID(13))), "venstre øye får eget mønster");
  await page.getByTestId("blink-add").click();
  h.check(await h.eventually(() => h.state.commands.some(c => c.type === "SetAnimationBehavior" && c.behavior?.manualBlinks?.length === 1)), "manuelt blink på gjeldende frame");
  await page.getByTestId("blink-half-0").click();
  h.check(await h.eventually(() => h.state.commands.some(c => c.type === "SetAnimationBehavior" && c.behavior?.manualBlinks?.[0]?.intensity === 0.5)), "halvlukket blink");
  await page.getByTestId("blink-remove-0").click();
  h.check(await h.eventually(() => h.state.commands.some(c => c.type === "SetAnimationBehavior" && c.behavior?.manualBlinks?.length === 0)), "blinket fjernes");
  await page.keyboard.press("Escape");
});
await h.scenario("ca6-patterns", occ.id, "nb", async page => {
  await openAnim(page);
  await page.getByTestId("pattern-studio").waitFor();
  h.check(await page.getByTestId(`pattern-select-${ID(13)}`).isVisible(), "lagret mønster i listen");
  await page.getByTestId("pattern-add").click();
  h.check(await h.eventually(() => h.state.commands.some(c => c.type === "SaveAnimationPattern" && c.pattern?.spec?.seed === 18427)), "nytt mønster med deterministisk standard-seed");
  await page.getByTestId(`pattern-select-${ID(13)}`).click();
  await page.getByTestId("pattern-name").fill("Rolig blinking");
  h.check(await h.eventually(() => h.state.commands.some(c => c.type === "SaveAnimationPattern" && c.pattern?.name === "Rolig blinking" && c.pattern?.revision === 2)), "omdøping øker revisjonen");
  const first = h.state.commands.find(c => c.type === "SaveAnimationPattern");
  h.check(first?.pattern?.spec?.algorithmVersion === 1, "versjonert mønsterspesifikasjon");
  await page.screenshot({ path: `${h.out}/patterns.png` });
});
await h.scenario("ca6-en", occ.id, "en", async page => {
  await openAnim(page);
  await page.getByTestId("blink-panel-open").click();
  h.check(await page.getByLabel("Blinking and eyes").last().isVisible(), "engelsk blinkepanel");
  await page.keyboard.press("Escape");
  h.check(await page.getByTestId("pattern-studio").isVisible(), "engelsk mønsterstudio");
});
await h.finish();
