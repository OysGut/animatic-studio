/** B-100: animasjon i Scene og spacing-drag. Fast fixture og mockede tjenester; ingen betalte kall. */
import { harness } from "./mts-harness.mjs";
import { byLang } from "./ui-lang.mjs";
if (!process.argv[3]) process.argv[3] = "/tmp/claude-0/visual-fixture.json";
const h = harness("/tmp/claude-0/b100-spacing");
const layer = h.rows.composition_layers.find((l) => !l.removed && (l.keyframes?.length ?? 0) > 1);
const comp = h.rows.compositions.find((c) => c.id === layer?.composition_id);
const occ = h.rows.scene_occurrences.find((o) => o.variant_id === comp?.variant_id);
if (!layer || !occ) throw new Error("Fixture missing animated layer");
const lang = process.env.UI_LANG === "en" ? "en" : "nb";
const updates = () => h.state.commands.filter((c) => c.type === "UpdateLayers");

async function blob(page) {
  const row = page.getByTestId(`spacing-row-${layer.id}`);
  await row.waitFor();
  const ruler = await page.getByTestId("timeline-ruler").boundingBox();
  const box = await row.boundingBox();
  const ppf = Number(await page.getByTestId("timeline-ruler").evaluate((el) => el.scrollWidth)) / Math.max(1, comp.duration_frames);
  return { row, y: box.y + box.height / 2, xAt: (f) => ruler.x + f * ppf + 1, ppf };
}

await h.scenario("b100-hover-og-drag", occ.id, lang, async (page) => {
  h.check((await page.getByTestId("scene-tab-animation").count()) === 0, "Animasjon-fanen er borte");
  h.check((await page.getByTestId("scene-track-groups").count()) === 1, "animasjonssporene ligger i Scene");
  const hint = await page.getByTestId("scene-track-groups-hint").textContent();
  h.check(hint.includes(byLang(lang, "rytme", "rhythm")) && hint.includes("spacing"), "hjelpeteksten viser begge Cmd/Ctrl-modusene");
  const b = await blob(page);
  await page.mouse.move(b.xAt(20), b.y);
  await page.getByTestId("spacing-highlight").waitFor();
  h.check((await page.getByTestId("spacing-highlight").getAttribute("data-whole")) === "false", "hover: fra punktet og ut uthevet (oransje)");
  h.check((await b.row.getAttribute("data-spacing-mode")) === "hover", "pekeren viser spacing-modus over laget");
  h.check((await page.getByTestId("scene-stage").first().getAttribute("data-spacing-overlay")) === "points", "lag uten bevegelsesbane: nøkkelbildenes posisjoner vises som punkter");
  await page.keyboard.down("Shift");
  await page.mouse.move(b.xAt(21), b.y);
  h.check(await h.eventually(async () => (await page.getByTestId("spacing-highlight").getAttribute("data-whole")) === "true"), "hover med Shift: hele animasjonen uthevet");
  await page.keyboard.up("Shift");

  // Cmd/Ctrl + dra fra klikkpunktet: bare tiden etter punktet strekkes
  await page.mouse.move(b.xAt(20), b.y);
  await page.keyboard.down("Control");
  await page.mouse.down();
  await page.mouse.move(b.xAt(20) + 12 * b.ppf, b.y, { steps: 6 });
  h.check(await h.eventually(async () => (await page.getByTestId("spacing-label").textContent()).includes("+")), "levende merkelapp med +f og ny lengde");
  await page.mouse.up();
  await page.keyboard.up("Control");
  const first = updates().at(-1);
  const f1 = first?.layers?.[0]?.fields?.keyframes;
  h.check(!!f1 && f1[0].frame === 0 && f1[1].frame > 50, `drag forlenger animasjonen etter punktet (${f1?.map((k) => k.frame).join(",")})`);
  h.check(!!f1 && f1.map((k) => k.value).join(",") === layer.keyframes.map((k) => k.value).join(","), "nodenes verdier er uendret");
  h.check(updates().length === 1, "én kommando ved slipp (én angring)");

  // Escape avbryter
  await page.mouse.move(b.xAt(10), b.y);
  await page.keyboard.down("Control");
  await page.mouse.down();
  await page.mouse.move(b.xAt(10) + 8 * b.ppf, b.y, { steps: 4 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.keyboard.up("Control");
  h.check(updates().length === 1, "Escape avbryter uten å skrive");

  // Cmd/Ctrl + Shift + dra: hele animasjonen rundt ankeret
  await page.mouse.move(b.xAt(25), b.y);
  await page.keyboard.down("Control");
  await page.keyboard.down("Shift");
  await page.mouse.down();
  await page.mouse.move(b.xAt(25) - 6 * b.ppf, b.y, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await page.keyboard.up("Control");
  h.check(updates().length === 2, "Shift-drag gir én ny kommando");
  await page.screenshot({ path: `${h.out}/b100-${lang}.png` });
});

await h.scenario("b100-forbi-slutten", occ.id, lang, async (page) => {
  const b = await blob(page);
  await page.mouse.move(b.xAt(20), b.y);
  await page.getByTestId("spacing-highlight").waitFor();
  await page.keyboard.down("Control");
  await page.mouse.down();
  await page.mouse.move(b.xAt(20) + 70 * b.ppf, b.y, { steps: 8 });
  const okMsg = await h.eventually(async () => /f/.test(await page.getByTestId("spacing-message").first().textContent()));
  h.check(okMsg, "draget viser at animasjonen går forbi slutten");
  await page.mouse.up();
  await page.keyboard.up("Control");
  h.check(await h.eventually(async () => page.getByTestId("beyond-end-notice").first().isVisible(), 4000), "varselet om tid etter scenens slutt vises");
  h.check(!h.state.commands.some((c) => c.type === "UpdateComposition" || c.type === "RetimeScene"), "ingenting forlenges automatisk");
  await page.getByTestId("beyond-end-extend").click();
  h.check(await h.eventually(async () => page.getByTestId("retime-dialog").isVisible()), "«Forleng scenen …» åpner endring av scenevarighet (B-041)");
  const secs = Number((await page.getByTestId("retime-seconds").inputValue()).replace(",", "."));
  h.check(secs * h.fx.project.fps_num / (h.fx.project.fps_den || 1) > comp.duration_frames, `foreslått lengde dekker animasjonen (${secs} s)`);
  h.check(!h.state.commands.some((c) => c.type === "UpdateComposition" || c.type === "RetimeScene"), "dialogen skriver ingenting før brukeren bekrefter");
  await page.screenshot({ path: `${h.out}/b100-forbi-${lang}.png` });
});

await h.scenario("b100-lenke-og-lengde", occ.id, lang, async (page) => {
  await page.goto(`${h.base}${h.P}/scene?scene=${occ.id}&fane=animation`, { waitUntil: "networkidle" });
  await page.getByTestId("animation-workspace").waitFor();
  h.check((await page.getByTestId("scene-track-groups").getAttribute("data-open")) === "true", "gammel lenke til Animasjon åpner sporene i Scene");
  const max = Number(await page.getByTestId("anim-navigator-to").getAttribute("aria-valuemax"));
  h.check(max === comp.duration_frames, `sporene bruker scenens lengde (${max} = ${comp.duration_frames})`);
  await page.getByTestId("scene-track-groups-auto").uncheck();
  h.check(h.state.commands.length === 0, "visningsvalg skriver ikke prosjektdata");
});
await h.finish();
