/** DV2: lydversjoner – fixturen har versjoner, lydeditoren og takes-flyten virker som før og sender kommandoer. Ingen betalte kall. */
import { harness } from "./mts-harness.mjs";
if (!process.argv[3]) process.argv[3] = "/tmp/claude-0/visual-fixture.json";
const h = harness("/tmp/claude-0/dv2-versions");
const OCC = "00000000-0000-7000-8000-000000000006";
const CLIP = "00000000-0000-7000-8000-0000000000d0";
const versions = h.rows.dialogue_versions ?? [];
const clip = h.rows.audio_clips.find(c => c.id === CLIP);
h.check(versions.length > 0 && versions.some(v => v.id === clip?.active_version_id), "replikkene har aktiv lydversjon i lastede data");
h.check(!h.rows.audio_clips.filter(c => c.kind !== "dialogue").some(c => c.active_version_id), "musikk og effekter har ingen versjoner");

await h.scenario("dv2-scene", OCC, "nb", async page => {
  await (async () => { const g = page.getByTestId("scene-track-groups"); await g.waitFor(); if ((await g.getAttribute("data-open")) !== "true") await page.getByTestId("scene-track-groups-toggle").click(); await page.getByTestId("animation-workspace").waitFor(); })();
  const seg = page.locator(`[data-testid="anim-dialogue-segment"][data-clip-id="${CLIP}"]`).first();
  h.check(await h.eventually(() => seg.isVisible(), 5000), "replikkens segment vises i dialogsporet");
  const active = versions.find(v => v.id === clip?.active_version_id);
  const take = await seg.getAttribute("data-take-id");
  h.check(active?.asset_version_id ? take === active.asset_version_id : !!take, `segmentet bruker filen i aktiv lydversjon (L6): ${take} / ${active?.asset_version_id}`);
  await page.screenshot({ path: `${h.out}/scene.png` });
});
await h.scenario("dv2-en", OCC, "en", async page => {
  await page.getByTestId("scene-script").waitFor();
  h.check(await page.getByTestId("scene-script").isVisible(), "engelsk visning laster med lydversjoner");
});
await h.finish();
