/** PTG3: mocked storage/RPCs, real FBX/AE ZIP downloads, nb and UI_LANG=en. No paid calls. */
import { harness } from "./mts-harness.mjs";
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
const h = harness("/tmp/browser/ptg3-camera");
const lang = process.env.UI_LANG ?? "nb";
const occ = h.rows.scene_occurrences.find(o => o.active);
if (!occ) throw new Error("Missing fixture");
h.fx.project.code = "PTG-TEST";
// Gyldig rigg (B-087) bare for scenen «Stua – åpning», som har zoom og panorering i kameraet. Alle
// andre skudd mangler rigg, slik at LESMEG må nevne dem med årsak.
const RIG_SCENE = "00000000-0000-7000-8000-000000000004";
const rid = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rigSpec = {
  format: "1",
  camera: { sensorWidthMm: 36, sensorHeightMm: 24, focalLengthMm: 50, cameraHeightMm: 900, mode: "moving" },
  plates: [
    { id: rid(8101), name: "Bord", heightMm: 0, glassThicknessMm: null },
    { id: rid(8102), name: "Plate 1", heightMm: 100, glassThicknessMm: 4 },
  ],
  calibration: { cameraHeightMm: 900, focalLengthMm: 50, sensorWidthMm: 36, sensorHeightMm: 24, referencePlateId: rid(8101), pxPerMm: 3, calibratedAt: "2026-10-01T10:00:00Z", valid: true },
};
h.rows.rig_setups = [{ id: rid(8103), project_id: h.fx.project.id, revision: 1, scene_id: RIG_SCENE, template_id: null, name: "PTG3 rigg", spec: rigSpec, removed: false }];
const rigShotPrefix = "PTG-TEST_SC";
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
  h.check(readmeFbx.includes("KTime") && (readmeFbx.includes("eksperimentell") || readmeFbx.includes("experimental")), `${lang}/fbx: LESMEG beskriver FBX-formatet`);
  const fbxFiles = fbxNames.filter(n => n.startsWith("camera/") && n.endsWith(".fbx"));
  h.check(fbxFiles.length === 1, `${lang}/fbx: nøyaktig ett FBX-skudd (skuddet med rigg), fant ${fbxFiles.length}`);
  if (fbxFiles.length) {
    const text = new TextDecoder().decode(fbxZip[fbxFiles[0]]);
    h.check(text.includes("FBXVersion: 7400") && text.includes("FilmWidth") && text.includes("FocalLength"), `${lang}/fbx: ASCII 7.4 med sensor og objektiv`);
    h.check(text.includes("46186158000") || text.includes("KTime"), `${lang}/fbx: KTime-tider`);
    const keys = /KeyTime: \*(\d+)/.exec(text);
    h.check(!!keys && Number(keys[1]) > 3, `${lang}/fbx: én nøkkel per eksponering (${keys?.[1]} nøkler)`);
  }
  // Kontroll for skudd uten rigg: LESMEG nevner skuddnavnet og årsaken.
  const missingLine = readmeFbx.split("\n").find(l => l.startsWith("- ") && l.includes(rigShotPrefix) && /rigg|rig/.test(l));
  h.check(!!missingLine, `${lang}/fbx: skudd uten rigg står med navn og årsak i LESMEG`);
  h.check(!readmeFbx.includes("null i PTG1") && !readmeFbx.includes("null in PTG1"), `${lang}/fbx: LESMEG sier ikke lenger «null i PTG1»`);
  h.check(readmeFbx.includes("PAR_") && readmeFbx.includes("Blender"), `${lang}/fbx: LESMEG forklarer kameramodusene og binær FBX`);

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
    h.check(jsx.includes("camera omitted"), `${lang}/ae-${mode}: skudd uten rigg får ingen kamera`);
    const readme = new TextDecoder().decode(zip["LESMEG.txt"]);
    h.check(readme.split("\n").some(l => l.startsWith("- ") && l.includes(rigShotPrefix)), `${lang}/ae-${mode}: LESMEG nevner skudd uten rigg`);
    h.check(!readme.includes("null i PTG1") && !readme.includes("null in PTG1"), `${lang}/ae-${mode}: LESMEG sier ikke lenger «null i PTG1»`);
    h.check(readme.includes("bygg.jsx"), `${lang}/ae-${mode}: LESMEG forklarer kjøringen`);
  }
  await section.screenshot({ path: `${h.out}/${lang}-section.png` });
});
await h.finish();
