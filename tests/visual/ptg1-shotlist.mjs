/** PTG1: mocked storage/RPCs, real CSV/JSON/PNG ZIP download, nb and UI_LANG=en. No paid calls. */
import { harness } from "./mts-harness.mjs";
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
const h = harness("/tmp/browser/ptg1-shotlist");
const lang = process.env.UI_LANG ?? "nb";
const occ = h.rows.scene_occurrences.find(o => o.active);
if (!occ) throw new Error("Missing fixture");
h.fx.project.code = "PTG-TEST";
h.fx.project.capture_mode = "twos"; h.fx.project.capture_fps_num = 12; h.fx.project.capture_fps_den = 1;
let version = 0;
h.hooks.rest = (table, req) => {
  if (table === "rpc/reserve_interchange_export") {
    const body = JSON.parse(req.postData()); version++;
    return { batchId: "00000000-0000-7000-8000-000000008101", versions: Object.fromEntries(body.p_occurrence_ids.map(id => [id, version])) };
  }
  if (table === "rpc/complete_interchange_export") return "00000000-0000-7000-8000-000000008102";
};
await h.scenario(`ptg1-${lang}`, occ.id, lang, async page => {
  await page.goto(h.base + h.P + "/montering", { waitUntil: "networkidle" });
  await page.evaluate(() => { delete window.showSaveFilePicker; });
  await page.getByRole("button", { name: lang === "en" ? "Export animatic" : "Eksporter animatic", exact: true }).click();
  const section = page.getByTestId("ptg-export-section"); await section.waitFor();
  h.check(await page.getByTestId("ptg-project-code").inputValue() === "PTG-TEST", `${lang}: prosjektkode vises`);
  h.check(await page.getByTestId("ptg-capture-mode").inputValue() === "twos", `${lang}: toere beholdes`);
  for (const profile of ["standard", "flow", "ftrack", "kitsu"]) {
    await page.getByTestId("ptg-profile").selectOption(profile);
    const dl = page.waitForEvent("download", { timeout: 60000 });
    await page.getByTestId("ptg-export-shotlist").click();
    const download = await dl; const path = `${h.out}/${lang}-${profile}.zip`; await download.saveAs(path);
    await page.getByTestId("ptg-export-shotlist").waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-testid="ptg-export-shotlist"]').disabled);
    const files = unzipSync(readFileSync(path));
    const csv = files["shotlist.csv"], json = JSON.parse(new TextDecoder().decode(files["shotlist.json"]));
    const doc = JSON.parse(new TextDecoder().decode(files["interchange.json"]));
    h.check(csv[0] === 239 && csv[1] === 187 && csv[2] === 191, `${lang}/${profile}: UTF-8 BOM`);
    const columns = Object.keys(json.shots[0]);
    h.check(columns.includes(profile === "flow" ? "code" : profile === "standard" ? "Shot (code)" : "Name"), `${lang}/${profile}: riktige navnekolonner`);
    h.check(columns.includes("Handle In") && columns.includes("Handle Out"), `${lang}/${profile}: håndtak i egne kolonner`);
    h.check(doc.shots.every(s => /^PTG-TEST_SC\d{3}[A-Z]*_SH\d{3}_v\d{3}$/.test(s.name) && s.version === version), `${lang}/${profile}: navn og økende eksportversjoner`);
    h.check(doc.shots.reduce((n,s) => n+s.lengthFrames,0) === doc.lengthFrames, `${lang}/${profile}: sum lik filmlengden`);
    h.check(doc.fps.num === 24 && doc.captureFps.num === 12 && doc.exposureStep === 2, `${lang}/${profile}: toere på 24-bilders tidslinje`);
    h.check(doc.shots.every(s => files[s.thumbnail.path]?.[0] === 137), `${lang}/${profile}: PNG-miniatyrer med relative stier`);
    h.check(new TextDecoder().decode(files["LESMEG.txt"]).includes("crossesCut"), `${lang}/${profile}: LESMEG med overlappsregelen`);
  }
  await section.screenshot({ path: `${h.out}/${lang}-section.png` });
});
await h.finish();