/** PTG3: mocked storage/RPCs, real FBX/AE ZIP downloads, nb and UI_LANG=en. No paid calls. */
import { harness } from "./mts-harness.mjs";
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
const h = harness("/tmp/browser/ptg3-camera");
const lang = process.env.UI_LANG ?? "nb";
const occ = h.rows.scene_occurrences.find(o => o.active);
if (!occ) throw new Error("Missing fixture");
h.fx.project.code = "PTG-TEST";
let version = 0;
h.hooks.rest = (table, req) => {
  if (table === "rpc/reserve_interchange_export") {
    const body = JSON.parse(req.postData()); version++;
    return { batchId: "00000000-0000-7000-8000-000000008103", versions: Object.fromEntries(body.p_occurrence_ids.map(id => [id, version])) };
  }
  if (table === "rpc/complete_interchange_export") return "00000000-0000-7000-8000-000000008104";
};
await h.scenario(`ptg3-${lang}`, occ.id, lang, async page => {
  await page.goto(h.base + h.P + "/montering", { waitUntil: "networkidle" });
  await page.evaluate(() => { delete window.showSaveFilePicker; });
  await page.getByRole("button", { name: lang === "en" ? "Export animatic" : "Eksporter animatic", exact: true }).click();
  const section = page.getByTestId("ptg-export-section"); await section.waitFor();
  h.check(await page.getByTestId("ptg-camera-mode").inputValue() === "ae", `${lang}: AE-kamera er standard kameramodus`);

  // Kamera-FBX (eksperimentell)
  const dlFbx = page.waitForEvent("download", { timeout: 60000 });
  await page.getByTestId("ptg-export-fbx").click();
  const fbxPath = `${h.out}/${lang}-camera.zip`; await (await dlFbx).saveAs(fbxPath);
  await page.waitForFunction(() => !document.querySelector('[data-testid="ptg-export-fbx"]').disabled);
  const fbxZip = unzipSync(readFileSync(fbxPath));
  const fbxNames = Object.keys(fbxZip);
  h.check(fbxNames.includes("LESMEG.txt"), `${lang}/fbx: LESMEG.txt i pakken`);
  const readmeFbx = new TextDecoder().decode(fbxZip["LESMEG.txt"]);
  h.check(readmeFbx.includes("KTime") && readmeFbx.includes("kseperimentell") || readmeFbx.includes("experimental"), `${lang}/fbx: LESMEG beskriver FBX-formatet`);
  const fbxFiles = fbxNames.filter(n => n.startsWith("camera/") && n.endsWith(".fbx"));
  if (fbxFiles.length) {
    const text = new TextDecoder().decode(fbxZip[fbxFiles[0]]);
    h.check(text.includes("FBXVersion: 7400") && text.includes("FilmWidth") && text.includes("FocalLength"), `${lang}/fbx: ASCII 7.4 med sensor og objektiv`);
    h.check(text.includes("46186158000") || text.includes("KTime"), `${lang}/fbx: KTime-tider`);
  } else {
    h.check(readmeFbx.includes("rigg") || readmeFbx.includes("rig"), `${lang}/fbx: skudd uten rigg forklares i LESMEG`);
  }

  // After Effects-pakken i begge kameramodus
  for (const mode of ["ae", "parallax"]) {
    await page.getByTestId("ptg-camera-mode").selectOption(mode);
    const dl = page.waitForEvent("download", { timeout: 60000 });
    await page.getByTestId("ptg-export-ae").click();
    const path = `${h.out}/${lang}-ae-${mode}.zip`; await (await dl).saveAs(path);
    await page.waitForFunction(() => !document.querySelector('[data-testid="ptg-export-ae"]').disabled);
    const zip = unzipSync(readFileSync(path));
    h.check(!!zip["bygg.jsx"], `${lang}/ae-${mode}: bygg.jsx i pakken`);
    h.check(!!zip["LESMEG.txt"], `${lang}/ae-${mode}: LESMEG.txt i pakken`);
    const jsx = new TextDecoder().decode(zip["bygg.jsx"]);
    h.check(jsx.includes("app.project.items.addComp"), `${lang}/ae-${mode}: komposisjoner bygges`);
    h.check(!/\b(let|const)\s/.test(jsx) && !jsx.includes("=>"), `${lang}/ae-${mode}: ren ES3`);
    h.check(mode === "ae" ? jsx.includes("addCamera") : !jsx.includes("addCamera"), `${lang}/ae-${mode}: kameramodus følges`);
    h.check(mode === "parallax" ? jsx.includes("PAR_") : !jsx.includes("PAR_"), `${lang}/ae-${mode}: parallakse-nuller bare i 2D-modus`);
    const readme = new TextDecoder().decode(zip["LESMEG.txt"]);
    h.check(readme.includes("bygg.jsx"), `${lang}/ae-${mode}: LESMEG forklarer kjøringen`);
  }
  await section.screenshot({ path: `${h.out}/${lang}-section.png` });
});
await h.finish();
