/**
 * Plassholder → bilde (feil fra Øystein 23.10): et liggende bilde lastet opp til en strukket plassholder får
 * egne proporsjoner og samme senter, på nb og en. Mockede tjenester; ingen betalte kall.
 *   python3 (se PLASSHOLDER_FIX_REPORT.md) lager /tmp/claude-0/placeholder-fixture.json og landscape.png
 *   ENV_FILE=.env node tests/visual/placeholder-refit.mjs http://localhost:8080 /tmp/claude-0/placeholder-fixture.json
 */
import { harness } from "./mts-harness.mjs";
import { byLang } from "./ui-lang.mjs";
if (!process.argv[3]) process.argv[3] = "/tmp/claude-0/placeholder-fixture.json";
const h = harness("/tmp/claude-0/placeholder-refit");
const LAYER = "00000000-0000-7000-8000-00000000fa03";
const layer = h.rows.composition_layers.find((l) => l.id === LAYER);
if (!layer) throw new Error("Fixture mangler plassholderlaget");
const comp = h.rows.compositions.find((c) => c.id === layer.composition_id);
const occ = h.rows.scene_occurrences.find((o) => o.variant_id === comp?.variant_id);

for (const lang of ["nb", "en"]) {
  await h.scenario(`plassholder-${lang}`, occ.id, lang, async (page) => {
    const before = h.state.commands.length;
    await h.selectLayer(page, LAYER);
    const keepW = page.getByRole("button", { name: byLang(lang, "Nullstill format – behold bredden", "Reset aspect – keep the width") });
    h.check(await keepW.isEnabled(), `${lang}: plassholderen er strukket før opplasting`);
    await page.getByRole("button", { name: byLang(lang, "Velg eller last opp bilde", "Choose or upload image") }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.locator('input[type="file"]').first().setInputFiles("/tmp/claude-0/landscape.png");
    const ok = await h.eventually(() => {
      const cmds = h.state.commands.slice(before);
      return cmds.some((c) => c?.type === "AddAssetVersion") && cmds.some((c) => c?.type === "UpdateLayers");
    }, 15000);
    h.check(ok, `${lang}: bildet lagres som ny versjon og tas i bruk på laget`);
    const f = h.lastFields(LAYER);
    h.check(!!f && f.transform.scaleX === f.transform.scaleY, `${lang}: samme skala i bredde og høyde (${f?.transform.scaleX} / ${f?.transform.scaleY})`);
    h.check(!!f && f.transform.scaleX === 0.6, `${lang}: vanlig innsettingsstørrelse (0,6 for 1600 × 900 i 1920 × 1080)`);
    h.check(!!f && f.transform.x === 700 && f.transform.y === 400, `${lang}: senteret er det samme som plassholderens`);
    h.check(!!f && f.width === 1600 && f.height === 900, `${lang}: laget har bildets egne mål`);
    await page.keyboard.press("Escape");
    await h.waitHidden(dialog).catch(() => {});
    h.check(await h.eventually(() => keepW.isDisabled(), 5000), `${lang}: inspektøren viser at laget har bildets proporsjoner`);
    await page.screenshot({ path: `${h.out}/${lang}.png` });
  });
}
await h.finish();
