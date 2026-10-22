/**
 * PTG2: «Send til Dragonframe». Mockede tjenester, ekte ZIP-nedlasting, nb og UI_LANG=en. Ingen betalte kall.
 * Opptak på toere (12 eksp./s på 24-bilders tidslinje) mot et 25 bilder/s-prosjekt, så omregningen testes.
 * Referansefilmen dekodes i nettleseren (mediabunny) og sammenlignes bilde for bilde med PNG-sekvensen, som
 * er monteringens egne bilder (drawFilmFrame) for de samme opptaksbildene.
 *   ENV_FILE=.env [UI_LANG=en] node tests/visual/ptg2-dragonframe.mjs
 */
import { harness } from "./mts-harness.mjs";
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
const h = harness("/tmp/browser/ptg2-dragonframe");
const lang = process.env.UI_LANG ?? "nb";
const occ = h.rows.scene_occurrences.find(o => o.active);
if (!occ) throw new Error("Missing fixture");
h.fx.project.code = "PTG-TEST";
h.fx.project.capture_mode = "twos"; h.fx.project.capture_fps_num = 12; h.fx.project.capture_fps_den = 1;
const RIG_SCENE = "00000000-0000-7000-8000-000000000004";
const rid = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
h.rows.rig_setups = [{ id: rid(8203), project_id: h.fx.project.id, revision: 1, scene_id: RIG_SCENE, template_id: null, name: "PTG2 rigg", removed: false, spec: {
  format: "1", camera: { sensorWidthMm: 36, sensorHeightMm: 24, focalLengthMm: 50, cameraHeightMm: 900, mode: "moving" },
  plates: [{ id: rid(8201), name: "Bord", heightMm: 0, glassThicknessMm: null }, { id: rid(8202), name: "Plate 1", heightMm: 100, glassThicknessMm: 4 }],
  calibration: { cameraHeightMm: 900, focalLengthMm: 50, sensorWidthMm: 36, sensorHeightMm: 24, referencePlateId: rid(8201), pxPerMm: 3, calibratedAt: "2026-10-01T10:00:00Z", valid: true },
} }];
let version = 0, settings = null;
h.hooks.rest = (table, req) => {
  if (table === "rpc/reserve_interchange_export") {
    const body = JSON.parse(req.postData()); version++; settings = body.p_settings;
    return { batchId: "00000000-0000-7000-8000-000000008203", versions: Object.fromEntries(body.p_occurrence_ids.map(id => [id, version])) };
  }
  if (table === "rpc/complete_interchange_export") return "00000000-0000-7000-8000-000000008204";
};
const wavInfo = (b) => {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { rate: v.getUint32(24, true), bits: v.getUint16(34, true), channels: v.getUint16(22, true), frames: v.getUint32(40, true) / (v.getUint16(22, true) * v.getUint16(34, true) / 8) };
};

await h.scenario(`ptg2-${lang}`, occ.id, lang, async page => {
  await page.goto(h.base + h.P + "/montering", { waitUntil: "networkidle" });
  await page.evaluate(() => { delete window.showSaveFilePicker; });
  await page.getByRole("button", { name: lang === "en" ? "Export animatic" : "Eksporter animatic", exact: true }).click();
  const section = page.getByTestId("ptg-export-section"); await section.waitFor();
  const btn = page.getByTestId("ptg-export-dragonframe");
  h.check((await btn.innerText()).includes(lang === "en" ? "Send to Dragonframe" : "Send til Dragonframe"), `${lang}: knappen heter «Send til Dragonframe» på riktig språk`);
  h.check(!(await page.getByTestId("ptg-df-png").isChecked()) && await page.getByTestId("ptg-df-burnin").isChecked(), `${lang}: PNG av og påskrift på som standard`);
  await page.getByTestId("ptg-df-png").check();
  const dl = page.waitForEvent("download", { timeout: 600000 });
  await btn.click();
  const path = `${h.out}/${lang}-dragonframe.zip`; await (await dl).saveAs(path);
  await page.waitForFunction(() => !document.querySelector('[data-testid="ptg-export-dragonframe"]').disabled, null, { timeout: 60000 });
  h.check(settings?.format === "dragonframe" && settings?.png === true && settings?.burnIn === true, `${lang}: eksportloggen får valgene`);
  const zip = unzipSync(readFileSync(path));
  const names = Object.keys(zip);
  const readme = new TextDecoder().decode(zip["LESMEG.txt"]);
  h.check(readme.includes("Dragonframe") && readme.includes("Video Assist") && readme.includes("X-Sheet"), `${lang}: LESMEG forklarer import i Dragonframe`);
  h.check(readme.includes("uten KI") && readme.includes("without AI"), `${lang}: LESMEG på nb og en, uten KI`);
  const folders = [...new Set(names.filter(n => n.includes("/")).map(n => n.split("/")[0]))];
  h.check(folders.length > 1 && folders.every(f => /^PTG-TEST_SC\d{3}[A-Z]?_SH\d{3}_v\d{3}$/.test(f)), `${lang}: én mappe per skudd med PTG1-navn (${folders.length})`);
  let fbx = 0, checkedVideo = 0, okLen = true, okRows = true, okPdf = true, okStems = true, okPng = true;
  const sample = [];
  for (const f of folders) {
    const mp4 = zip[`${f}/${f}_ref.mp4`];
    const pngs = names.filter(n => n.startsWith(`${f}/png/`)).sort();
    const wavs = names.filter(n => n.startsWith(`${f}/audio/`) && n.endsWith(".wav"));
    if (!wavs.some(n => n.endsWith("_MIX.wav"))) okStems = false;
    const wav0 = wavs[0] ? wavInfo(zip[wavs[0]]) : null;
    const frames = wav0 ? wav0.frames / 2000 : 0;
    for (const w of wavs) {
      const i = wavInfo(zip[w]);
      if (i.rate !== 48000 || i.bits !== 24 || i.channels !== 2 || i.frames !== frames * 2000) { okLen = false; console.log("  wav", w, i, frames); }
    }
    const csv = new TextDecoder().decode(zip[`${f}/${f}_xsheet.csv`]).trim().split("\r\n");
    // Én rad per eksponering: toere → antall distinkte eksponeringer (hvert andre bilde, rutenett fra klippet)
    const rows = csv.length - 1;
    // PNG: én fil per eksponering, samme antall som X-sheet-radene; bildenummeret i kolonne 1 viser videobildet
    const rowFrames = csv.slice(1).map(l => Number(l.split(",")[0].replace(/"/g, "")) - 1);
    if (pngs.length !== rows) { okPng = false; console.log("  png", f, pngs.length, rows); }
    if (!(rows >= Math.floor(frames / 2) && rows <= Math.ceil(frames / 2) + 1)) { okRows = false; console.log("  rows", f, rows, frames); }
    for (const p of ["A4", "Letter"]) { const pdf = zip[`${f}/${f}_xsheet_${p}.pdf`]; if (!pdf || new TextDecoder().decode(pdf.slice(0, 5)) !== "%PDF-") okPdf = false; }
    if (zip[`${f}/${f}_camera.fbx`]) fbx++;
    if (mp4 && frames && sample.length < 2) sample.push({ f, mp4, frames, rowFrames, pngs: pngs.map(n => zip[n]) });
  }
  h.check(okStems, `${lang}: hver mappe har samlet miks (MIX)`);
  h.check(okLen, `${lang}: alle lydfiler er WAV 48 kHz 24 bit og like lange som skuddet`);
  h.check(okRows, `${lang}: X-sheet har én rad per eksponering`);
  h.check(okPng, `${lang}: PNG-sekvensen har én fil per eksponering (lik X-sheet-radene)`);
  h.check(okPdf, `${lang}: X-sheet som PDF i A4 og Letter`);
  h.check(fbx === 1, `${lang}: FBX-kamera bare for skuddet med rigg (${fbx})`);
  h.check(new TextDecoder().decode(zip[`${folders[0]}/${folders[0]}_xsheet.csv`]).includes(lang === "en" ? "Mouth" : "Munn"), `${lang}: X-sheet har munn-kolonnen`);

  // Bilde for bilde: dekod MP4 i nettleseren og sammenlign hvert bilde med monteringens PNG for samme bilde
  for (const s of sample) {
    const res = await page.evaluate(async ({ mp4, pngs, rowFrames }) => {
      const mb = await import("/node_modules/.vite/deps/mediabunny.js");
      const input = new mb.Input({ source: new mb.BufferSource(new Uint8Array(mp4).buffer), formats: mb.ALL_FORMATS });
      const track = await input.getPrimaryVideoTrack();
      const sink = new mb.CanvasSink(track, { width: 96, height: 54, fit: "fill" });
      const decoded = [];
      for await (const w of sink.canvases()) {
        const c = w.canvas; const x = c.getContext("2d"); decoded.push({ t: w.timestamp, px: Array.from(x.getImageData(0, 0, 96, 54).data) });
      }
      const ref = [];
      for (const p of pngs) {
        const bmp = await createImageBitmap(new Blob([new Uint8Array(p)], { type: "image/png" }));
        const c = new OffscreenCanvas(96, 54); const x = c.getContext("2d"); x.drawImage(bmp, 0, 0, 96, 54);
        ref.push(Array.from(x.getImageData(0, 0, 96, 54).data));
      }
      // Videobilde i viser eksponeringen med største rowFrames[k] <= i
      const expOf = i => { let k = 0; while (k + 1 < rowFrames.length && rowFrames[k + 1] <= i) k++; return k; };
      const diff = decoded.map((d, i) => { const r = ref[expOf(i)]; if (!r) return 255; let s = 0; for (let k = 0; k < r.length; k += 4) s += Math.abs(r[k] - d.px[k]) + Math.abs(r[k + 1] - d.px[k + 1]) + Math.abs(r[k + 2] - d.px[k + 2]); return s / (r.length / 4 * 3); });
      // Nabobildet skal passe dårligere enn riktig bilde der bildene skiller seg (bildenøyaktighet)
      return { decoded: decoded.length, pngs: ref.length, maxDiff: Math.max(...diff), duration: await track.computeDuration(), fps: (await track.computePacketStats()).averagePacketRate };
    }, { mp4: Array.from(s.mp4), rowFrames: s.rowFrames, pngs: s.pngs.map(p => Array.from(p)) });
    h.check(res.decoded === s.frames && res.pngs === s.rowFrames.length && res.pngs < res.decoded, `${lang}/${s.f}: referansefilmen har alle ${s.frames} bilder, PNG én per eksponering (${res.decoded}/${res.pngs})`);
    h.check(Math.abs(res.fps - 24) < 0.1, `${lang}/${s.f}: opptakets bildefrekvens 24 (${res.fps.toFixed(2)})`);
    h.check(res.maxDiff < 12, `${lang}/${s.f}: hvert bilde stemmer med monteringen (største avvik ${res.maxDiff.toFixed(2)})`);
    checkedVideo++;
  }
  h.check(checkedVideo > 0, `${lang}: minst én referansefilm kontrollert bilde for bilde`);
  await section.screenshot({ path: `${h.out}/${lang}-section.png` });
});
await h.finish();
