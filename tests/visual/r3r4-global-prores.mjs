/**
 * R3: «Publiser globalt» for en stilharmonisert versjon av en ressurs som allerede er global: ny global versjon
 * (ingen kopi av hele ressursen), «angre» trekker den tilbake globalt og «gjør om» publiserer den igjen. Bruker
 * visual-fixture (karakteren Maja); R4 og R1 bruker mts-fixture.
 * R4: ProRes-profil i filmeksporten (422 HQ, 422, LT, Proxy) med estimert filstørrelse før eksport, og estimat for
 * ProRes 4444 i lageksporten. ffprobe kontrollerer FourCC i den nedlastede filen. R1-resten: «Ikke nå» huskes per
 * bruker og prosjekt etter ny innlasting og kan hentes fram igjen. Alle serverkall er mocket.
 *   ENV_FILE=.env [UI_LANG=en] node tests/visual/r3r4-global-prores.mjs http://127.0.0.1:8080 /tmp/claude-0/mts-fixture.json [out]
 */
import { harness } from "./mts-harness.mjs";
import { uiLang } from "./ui-lang.mjs";
import { execFileSync } from "node:child_process";
const name = (url) => { try { return JSON.parse(Buffer.from(decodeURIComponent(new URL(url).pathname.split("/_serverFn/")[1]), "base64url").toString("utf8")).export; } catch { return "?"; } };

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

const r4 = await h.close();

// ---------- R3 (visual-fixture) ----------
process.argv[3] = process.env.VISUAL_FIXTURE ?? "/tmp/claude-0/visual-fixture.json";
const g = harness("/tmp/browser/r3r4-global-prores");
const MAJA = "00000000-0000-7000-8000-0000000000a2";
const LAYER = "00000000-0000-7000-8000-0000000000bb";
const PROFILE = "00000000-0000-7000-8000-000000085001";
const WS = "00000000-0000-7000-8000-00000000e301";
const GA = "00000000-0000-7000-8000-00000000e302";
const GVER = "00000000-0000-7000-8000-00000000e303";
g.rows.style_profiles = [{ id: PROFILE, project_id: g.fx.project.id, revision: 1, name: "Filmens stil", is_default: true, removed: false, applies_to: [], guide: { version: 1, premise: "", world: "Dovre", audience: "", visualStyle: "Akvarell", technique: "Akvarell", palette: { colors: ["#0d1b2a"], description: "Blått" }, lighting: "", mood: "", characterDesign: "", environmentDesign: "", composition: "", avoid: "", instructions: "", referenceVersionIds: [] } }];
g.fx.project.workspace_id = WS;
g.rows.workspace_members = [{ workspace_id: WS, role: "editor" }];
g.rows.workspaces = [{ id: WS, name: "Trollfilm" }];
const maja = g.rows.assets.find((a) => a.id === MAJA);
maja.source_global_asset_id = GA;
const gocc = g.rows.scene_occurrences.find((o) => o.active && g.rows.compositions.some((c) => c.variant_id === o.variant_id)) ?? g.rows.scene_occurrences[0];

for (const lang of ["nb", "en"]) await g.scenario(`r3-publish-${lang}`, gocc.id, lang, async (page) => {
  const calls = [];
  await page.route("**/_serverFn/**", async (route) => {
    const n = name(route.request().url());
    const json = (result) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result, context: {} }) });
    if (/^publishVersionToGlobal(?:_|$)/.test(n)) { calls.push({ n: "publish", d: route.request().postData() ?? "" }); return json({ globalAssetId: GA, globalVariantId: "00000000-0000-7000-8000-00000000e304", globalVersionId: GVER, number: 3, newVariant: false }); }
    if (/^setGlobalVersionWithdrawn(?:_|$)/.test(n)) { const body = route.request().postData() ?? ""; calls.push({ n: /withdrawn[^,]*?(true|2)/.test(body) || /"t":2,"s":2/.test(body) ? "withdraw?" : "?", d: body }); return json({ changed: true }); }
    if (/^saveAssetToGlobal(?:_|$)/.test(n)) { calls.push({ n: "copy", d: "" }); return json({ globalAssetId: GA, versions: 1 }); }
    return route.fallback();
  });
  await g.selectLayer(page, LAYER);
  await page.getByTestId("layer-harmonize").click();
  const panel = page.getByTestId("harmonize-panel");
  await panel.waitFor({ timeout: 8000 });
  await panel.getByRole("button", { name: /^(Harmoniser|Harmonize) …$/ }).click();
  await panel.getByRole("button", { name: /^(Ja, generer|Yes, generate)$/ }).click();
  await page.getByTestId("harmonize-compare").waitFor({ timeout: 8000 });
  await page.getByTestId("harmonize-use-variant").click();
  await page.getByTestId("harmonize-saved").waitFor({ timeout: 5000 });
  const pub = page.getByTestId("harmonize-publish");
  g.check(await pub.isVisible(), `${lang}: «Publiser globalt» vises for en ressurs som allerede er global`);
  g.check(calls.length === 0, `${lang}: ingenting publiseres før brukeren klikker`);
  await pub.click();
  g.check(await g.eventually(() => calls.some((c) => c.n === "publish"), 5000), `${lang}: ny global versjon på den eksisterende ressursen`);
  g.check(!calls.some((c) => c.n === "copy"), `${lang}: ingen kopi av hele ressursen`);
  g.check(await g.eventually(() => g.state.commands.some((c) => c?.type === "SetStyleHarmonization" && c?.fields?.use === "published"), 5000), `${lang}: markeringen i prosjektet lagres som angrbar kommando`);
  await g.eventually(async () => /(global versjon|global version) 3/.test(await page.locator("body").innerText()), 5000);
  const status = await page.locator("body").innerText();
  g.check(uiLang(lang) === "nb" ? /global versjon 3/.test(status) : /global version 3/.test(status), `${lang}: meldingen viser versjonsnummeret på riktig språk`);
  await panel.screenshot({ path: `${g.out}/r3-published-${lang}.png` });
  const before = calls.length;
  await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press("Control+z");
  g.check(await g.eventually(() => calls.length > before, 5000), `${lang}: «angre» trekker versjonen tilbake globalt`);
  const w = calls[before];
  g.check(!!w && /e303/.test(w.d) && !/false|"s":3/.test(w.d), `${lang}: tilbaketrekkingen gjelder den publiserte versjonen (withdrawn = true)`);
  await page.waitForTimeout(500);
  await page.keyboard.press("Control+y");
  g.check(await g.eventually(() => calls.length > before + 1, 5000), `${lang}: «gjør om» publiserer den igjen`);
  const r = calls[before + 1];
  g.check(!!r && /e303/.test(r.d) && /false|"s":3/.test(r.d), `${lang}: gjør om sender withdrawn = false`);
});
const r3 = await g.close();
const pass = r4.pass + r3.pass, fail = r4.fail + r3.fail;
console.log(`RESULTAT ${pass} bestått, ${fail} feilet`);
process.exitCode = fail ? 1 : 0;
