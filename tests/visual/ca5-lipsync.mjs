/** CA5: leppesynksporet – visning, av/på, manuelle overstyringer og forslag. Ingen betalte kall. */
import { harness } from "./mts-harness.mjs";
if (!process.argv[3]) process.argv[3] = "/tmp/claude-0/visual-fixture.json";
const h = harness("/tmp/claude-0/ca5-lipsync");
const OCC = "00000000-0000-7000-8000-000000000006";
const CLIP = "00000000-0000-7000-8000-0000000000d0";
const ID = n => `01900000-0000-7000-8000-0056${String(n).padStart(8, "0")}`;
// Opptak på forekomsten og et lagret leppesynk for det første dialogklippet.
const take = { ...h.rows.takes[0], id: ID(9), occurrence_id: OCC };
h.rows.takes = [...h.rows.takes, take];
h.rows.scene_occurrences = h.rows.scene_occurrences.map(o => o.id === OCC ? { ...o, active_take_id: ID(9) } : o);
const lipsync = { id: ID(12), project_id: h.fx.project.id, revision: 1, clip_id: CLIP, take_id: ID(9), block_id: "00000000-0000-7000-8000-000000000009", source: "rule", algorithm_version: 1, audio_hash: "abc123", text_hash: "def456", spans: [{ frame: 0, endFrame: 12, viseme: "A" }, { frame: 12, endFrame: 24, viseme: "B" }], overrides: [], enabled: true, removed: false };
h.rows.lipsync_results = [lipsync];

await h.scenario("ca5-track", OCC, "nb", async page => {
  await page.getByTestId("scene-tab-animation").click();
  await page.getByTestId("anim-mouth-track").waitFor();
  h.check(await page.getByTestId("anim-mouth-track").isVisible(), "munnformsporet vises under dialogsporet");
  h.check(await page.getByTestId(`mouth-row-${CLIP}`).isVisible(), "én rad per replikk");
  h.check(await page.getByTestId(`viseme-${CLIP}-0`).isVisible() && await page.getByTestId(`viseme-${CLIP}-12`).isVisible(), "munnformene tegnes i tidslinjen");
  h.check(await page.getByTestId(`lipsync-toggle-${CLIP}`).getAttribute("aria-pressed") === "true", "leppesynk er på");
  await page.getByTestId(`lipsync-toggle-${CLIP}`).click();
  h.check(await h.eventually(() => h.state.commands.some(c => c.type === "SetLipsyncEnabled" && c.enabled === false)), "av/på per replikk via kommando");
  h.check(await page.getByTestId(`lipsync-toggle-${CLIP}`).getAttribute("aria-pressed") === "false", "sporet vises som avslått uten å slettes");
  await page.getByTestId(`viseme-${CLIP}-0`).click();
  h.check(await h.eventually(() => h.state.commands.some(c => c.type === "SetLipsyncOverrides" && c.overrides?.some(o => o.frame === 0 && o.viseme === "B"))), "klikk på en frame sykler munnformen som overstyring");
  await page.getByTestId(`lipsync-generate-${CLIP}`).click();
  h.check(await h.eventually(() => page.getByRole("alert").count() > 0, 5000), "generering uten lastet lyd gir en forklaring, ingen stilltiende feil");
  h.check(!h.state.commands.some(c => c.type === "SaveLipsyncResult"), "ingenting lagres uten «Bruk»");
  await page.screenshot({ path: `${h.out}/mouth-track.png` });
});
await h.scenario("ca5-en", OCC, "en", async page => {
  await page.getByTestId("scene-tab-animation").click();
  await page.getByTestId("anim-mouth-track").waitFor();
  h.check(await page.getByTestId("anim-mouth-track").isVisible(), "engelsk visning av sporet");
  h.check(await page.getByTestId("anim-mouth-track").getByRole("button").first().isVisible(), "engelske etiketter");
});
await h.finish();
