/** PTG3b (B-115): tittelkort med QR i AE-pakken og importsiden. Mockede RPC-er, nb og UI_LANG=en. Ingen betalte kall. */
import { harness } from "./mts-harness.mjs";
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
const h = harness("/tmp/browser/ptg3b-titlecard");
const lang = process.env.UI_LANG ?? "nb";
const occ = h.rows.scene_occurrences.find(o => o.active);
if (!occ) throw new Error("Missing fixture");
h.fx.project.code = "PTG-TEST";
let version = 0;
h.hooks.rest = (table, req) => {
  if (table === "rpc/reserve_interchange_export") {
    const body = JSON.parse(req.postData()); version++;
    return { batchId: "00000000-0000-7000-8000-000000008203", versions: Object.fromEntries(body.p_occurrence_ids.map(id => [id, version])) };
  }
  if (table === "rpc/complete_interchange_export") return "00000000-0000-7000-8000-000000008204";
};
const footer = lang === "en" ? "Exported from From Pen to Glass" : "Eksportert fra From Pen to Glass";
await h.scenario(`ptg3b-${lang}`, occ.id, lang, async page => {
  await page.goto(h.base + h.P + "/montering", { waitUntil: "networkidle" });
  await page.evaluate(() => { delete window.showSaveFilePicker; });
  await page.getByRole("button", { name: lang === "en" ? "Export animatic" : "Eksporter animatic", exact: true }).click();
  await page.getByTestId("ptg-export-section").waitFor();
  h.check(await page.getByTestId("ptg-title-card").isChecked(), `${lang}: «Tittelkort med QR» er på som standard`);
  async function exportAe(name) {
    const dl = page.waitForEvent("download", { timeout: 60000 });
    await page.getByTestId("ptg-export-ae").click();
    const path = `${h.out}/${lang}-${name}.zip`; await (await dl).saveAs(path);
    await page.waitForFunction(() => !document.querySelector('[data-testid="ptg-export-ae"]').disabled);
    return unzipSync(readFileSync(path));
  }
  const withCard = await exportAe("with-card");
  const jsx = new TextDecoder().decode(withCard["bygg-after-effects.jsx"]);
  const qrs = Object.keys(withCard).filter(n => n.startsWith("tittelkort/") && n.endsWith("_qr.png"));
  h.check(qrs.length > 0, `${lang}: QR-bilde per skudd i pakken`);
  h.check(jsx.includes("_TITLE") && jsx.includes("_RENDER") && jsx.includes("displayStartTime = -1"), `${lang}: tittelkort i egen komp foran skuddet, −1 s`);
  h.check(jsx.includes(JSON.stringify(footer)), `${lang}: tekst på grensesnittspråket`);
  const readme = new TextDecoder().decode(withCard["LESMEG.txt"]);
  h.check(readme.includes("00:00:00:00"), `${lang}: LESMEG forklarer at tidskoden ikke forskyves`);
  await page.getByTestId("ptg-title-card").uncheck();
  const noCard = await exportAe("no-card");
  const jsx2 = new TextDecoder().decode(noCard["bygg-after-effects.jsx"]);
  h.check(!jsx2.includes("_TITLE") && !Object.keys(noCard).some(n => n.startsWith("tittelkort/")), `${lang}: kan slås av`);
  await page.getByTestId("ptg-export-section").screenshot({ path: `${h.out}/${lang}-section.png` });

  // Importsiden fra QR-lenken
  const pid = h.P.split("/").pop();
  await page.goto(`${h.base}/ptg/i?p=${pid}&o=${occ.id}&n=PTG-TEST_SC001_SH010_v001&f=48`, { waitUntil: "networkidle" });
  await page.getByTestId("ptg-import").waitFor({ timeout: 20000 });
  h.check((await page.getByTestId("ptg-import-shot").innerText()).includes("PTG-TEST_SC001_SH010_v001"), `${lang}: importsiden viser skuddet`);
  await page.screenshot({ path: `${h.out}/${lang}-import.png` });
  await page.goto(`${h.base}/ptg/i?p=bad&o=${occ.id}&n=x&f=1`, { waitUntil: "networkidle" });
  await page.getByTestId("ptg-import-failed").waitFor();
  h.check(true, `${lang}: ugyldig lenke gir nøytral melding`);
});
await h.finish();
