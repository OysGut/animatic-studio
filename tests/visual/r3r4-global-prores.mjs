/**
 * R4: ProRes-profil i filmeksporten (422 HQ, 422, LT, Proxy) med estimert filstørrelse før eksport, og estimat for
 * ProRes 4444 i lageksporten. ffprobe kontrollerer FourCC i den nedlastede filen. R1-resten: «Ikke nå» huskes per
 * bruker og prosjekt etter ny innlasting og kan hentes fram igjen. Alle serverkall er mocket.
 *   ENV_FILE=.env [UI_LANG=en] node tests/visual/r3r4-global-prores.mjs http://127.0.0.1:8080 /tmp/claude-0/mts-fixture.json [out]
 */
import { harness } from "./mts-harness.mjs";
import { uiLang } from "./ui-lang.mjs";
import { execFileSync } from "node:child_process";

const h = harness("/tmp/browser/r3r4-global-prores");
const c = h.rows.compositions.find((x) => !x.removed);
const occ = h.rows.scene_occurrences.find((o) => o.variant_id === c?.variant_id && o.active);
if (!c || !occ) throw new Error("Missing fixture");
c.width = 64; c.height = 48; c.duration_frames = 3; c.camera = { shots: [] };
h.fx.project.frame_width = 64; h.fx.project.frame_height = 48;
h.fx.project.fps_num = 24000; h.fx.project.fps_den = 1001;
const FINAL = "00000000-0000-7000-8000-000000006811";
const ffprobe = (() => { try { execFileSync("ffprobe", ["-version"], { stdio: "ignore" }); return true; } catch { return false; } })();

for (const lang of ["nb", "en"]) {
  await h.scenario(`r4-film-${lang}`, occ.id, lang, async (page) => {
    const shown = uiLang(lang);
    h.rows.quality_profiles = [{ id: FINAL, project_id: h.fx.project.id, name: "Endelig", revision: 1, removed: false, spec: { effort: "premium", export: { format: "prores" } } }];
    h.fx.project.active_quality_profile_id = FINAL;
    await page.goto(`${h.base}${h.P}/montering?scene=${occ.id}&lastned=1`, { waitUntil: "networkidle" });
    const fmt = page.getByTestId("export-format"); await fmt.waitFor();
    h.check(await fmt.inputValue() === "mov", `${lang}: «Endelig» foreslår MOV`);
    const prof = page.getByTestId("export-prores-profile");
    h.check(await prof.inputValue() === "hq", `${lang}: 422 HQ er standard`);
    const opts = await prof.locator("option").evaluateAll((o) => o.map((x) => x.value));
    h.check(opts.join() === "hq,422,lt,proxy", `${lang}: profilene HQ, 422, LT og Proxy, ikke 4444 (${opts.join()})`);
    const est = page.getByTestId("export-prores-estimate");
    const hqText = await est.innerText();
    h.check(/kB|MB|GB/.test(hqText) && (shown === "nb" ? /Estimert filstørrelse/.test(hqText) : /Estimated file size/.test(hqText)), `${lang}: estimert størrelse vises på riktig språk (${hqText.slice(0, 60)})`);
    await prof.selectOption("proxy");
    const proxyText = await est.innerText();
    h.check(proxyText !== hqText, `${lang}: estimatet endres med profilen (${hqText} | ${proxyText})`);
    h.check(/Proxy/.test(await page.getByTestId("export-prores-note").innerText()), `${lang}: merknaden viser valgt profil`);
    await prof.selectOption("lt");
    await page.getByRole("dialog").screenshot({ path: `${h.out}/film-${lang}.png` });
    const dl = page.waitForEvent("download", { timeout: 60000 }); await page.getByTestId("export-start").click();
    const d = await dl; const path = `${h.out}/film-${lang}.mov`; await d.saveAs(path);
    if (ffprobe) {
      const probe = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v", "-show_entries", "stream=codec_tag_string,color_primaries", "-of", "default=nw=1", path]).toString();
      h.check(/codec_tag_string=apcs/.test(probe) && /color_primaries=bt709/.test(probe), `${lang}: ffprobe: ProRes 422 LT (apcs), Rec.709`);
    }
    const types = h.state.commands.map((x) => x?.type ?? "?");
    h.check(types.every((t) => t === "SetExportSettings"), `${lang}: eksporten endrer ikke prosjektet (${types.join(",")})`);
  });

  await h.scenario(`r4-layer-${lang}`, occ.id, lang, async (page) => {
    await page.getByTestId("alpha-export-open").click();
    const dialog = page.getByTestId("alpha-export-dialog"); await dialog.waitFor();
    await page.getByTestId("alpha-format").selectOption("mov-prores4444");
    const est = page.getByTestId("alpha-prores-estimate");
    h.check(await est.isVisible() && /kB|MB|GB/.test(await est.innerText()), `${lang}: lageksporten viser estimat for ProRes 4444`);
    await page.getByTestId("alpha-format").selectOption("png-seq");
    h.check(!(await est.isVisible()), `${lang}: estimatet vises bare for ProRes`);
    await page.getByTestId("alpha-cancel").click();
  });

  await h.scenario(`r1-dismiss-${lang}`, occ.id, lang, async (page) => {
    h.rows.quality_profiles = [{ id: FINAL, project_id: h.fx.project.id, name: "Endelig", revision: 1, removed: false, spec: { effort: "premium", export: { format: "mp4" } } }];
    h.fx.project.active_quality_profile_id = null;
    await page.goto(h.base + h.P, { waitUntil: "networkidle" });
    const offer = page.getByTestId("prores-offer");
    await offer.waitFor({ timeout: 8000 });
    h.check(await offer.isVisible(), `${lang}: tilbudet vises`);
    await page.getByTestId("prores-offer-dismiss").click();
    await page.reload({ waitUntil: "networkidle" });
    await page.getByTestId("quality-profiles-section").waitFor();
    await page.waitForTimeout(800);
    h.check(!(await offer.isVisible()), `${lang}: «Ikke nå» huskes etter ny innlasting`);
    const restore = page.getByTestId("prores-offer-restore");
    h.check(await restore.isVisible(), `${lang}: tilbudet kan hentes fram igjen`);
    await restore.click();
    h.check(await offer.isVisible(), `${lang}: tilbudet vises igjen`);
    h.check(h.state.commands.length === 0, `${lang}: ingen kommando sendt ved «Ikke nå» og gjenoppretting`);
  });
}

await h.finish();
