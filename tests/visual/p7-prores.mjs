/** P7: ProRes 422 HQ film and ProRes 4444 layer export as MOV, NO/EN, lock message and cancel. All server calls mocked. */
import { harness } from "./mts-harness.mjs";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
const h = harness("/tmp/browser/p7-prores");
const c = h.rows.compositions.find(c => !c.removed);
const occ = h.rows.scene_occurrences.find(o => o.variant_id === c?.variant_id && o.active);
if (!c || !occ) throw new Error("Missing fixture");
c.width = 64; c.height = 48; c.duration_frames = 3; c.camera = { shots: [] };
h.fx.project.frame_width = 64; h.fx.project.frame_height = 48;
h.fx.project.fps_num = 24000; h.fx.project.fps_den = 1001;
const base = h.rows.composition_layers.find(l => l.composition_id === c.id && !l.removed && l.kind !== "group");
const solid = { ...base, id: "00000000-0000-7000-8000-00000000a701", name: "Solid", kind: "object", asset_id: null, asset_variant_id: null, version_id: null, fill: "#c86432", width: 16, height: 16,
  transform: { x: 32, y: 24, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 }, keyframes: [], group_id: null, visible: true, removed: false, path: null, mask: null, swaps: [], active_range: null, effects: null, text: null, shape: null, order_key: "a" };
h.rows.composition_layers = h.rows.composition_layers.filter(l => l.composition_id !== c.id).concat([solid]);
const pid = "00000000-0000-7000-8000-000000007001";
h.rows.quality_profiles = [{ id: pid, project_id: h.fx.project.id, name: "Endelig", revision: 1, removed: false, spec: { effort: "premium", export: { format: "prores" } } }];
h.fx.project.active_quality_profile_id = pid;

const ascii = (b, i) => b.toString("ascii", i, i + 4);
function atoms(b, s = 0, e = b.length) { const out = []; for (let i = s; i + 8 <= e;) { const n = b.readUInt32BE(i); out.push({ t: ascii(b, i + 4), s: i + 8, e: i + n }); i += n; } return out; }
function find(b, path, s = 0, e = b.length) { const [hd, ...r] = path; const hit = atoms(b, s, e).filter(a => a.t === hd); return r.length ? hit.flatMap(a => find(b, r, a.s, a.e)) : hit; }
function inspect(b) {
  const out = { tracks: [] };
  for (const t of find(b, ["moov", "trak"])) {
    const stsd = find(b, ["mdia", "minf", "stbl", "stsd"], t.s, t.e)[0], at = stsd.s + 16;
    const mdhd = find(b, ["mdia", "mdhd"], t.s, t.e)[0];
    out.tracks.push({ fourcc: ascii(b, stsd.s + 12), w: b.readUInt16BE(at + 24), h: b.readUInt16BE(at + 26), scale: b.readUInt32BE(mdhd.s + 12), dur: b.readUInt32BE(mdhd.s + 16), rate: b.readUInt32BE(at + 24) / 65536 });
  }
  return out;
}
const ffmpeg = (() => { try { execFileSync("ffprobe", ["-version"], { stdio: "ignore" }); return true; } catch { return false; } })();

for (const lang of ["nb", "en"]) {
  await h.scenario(`p7-layer-${lang}`, occ.id, lang, async page => {
    await page.getByTestId("alpha-export-open").click();
    const dialog = page.getByTestId("alpha-export-dialog"); await dialog.waitFor();
    h.check(await page.getByTestId("quality-profile-picker").inputValue() === "active", `${lang}: profilen vises i lageksporten`);
    h.check(await page.getByTestId("alpha-format").inputValue() === "mov-prores4444", `${lang}: «Endelig» foreslår ProRes 4444`);
    h.check(await page.getByTestId("alpha-prores-note").isVisible(), `${lang}: ProRes-merknad vises`);
    await dialog.screenshot({ path: `${h.out}/layer-${lang}.png` });
    const dl = page.waitForEvent("download"); await page.getByTestId("alpha-start").click();
    const d = await dl; const path = `${h.out}/layer-${lang}.mov`; await d.saveAs(path);
    await page.getByTestId("alpha-download").waitFor();
    const linkName = await page.getByTestId("alpha-download").getAttribute("download");
    h.check(linkName?.endsWith(".mov") && linkName.includes("Solid"), `${lang}: filnavn med lag og .mov (${linkName})`);
    const b = readFileSync(path), info = inspect(b);
    h.check(ascii(b, 4) === "ftyp" && ascii(b, 8) === "qt  ", `${lang}: QuickTime-container`);
    h.check(info.tracks.length === 1 && info.tracks[0].fourcc === "ap4h", `${lang}: ett spor, ProRes 4444 (ap4h), uten lyd`);
    h.check(info.tracks[0].w === 64 && info.tracks[0].h === 48, `${lang}: riktige mål`);
    h.check(info.tracks[0].scale === 24000 && info.tracks[0].dur === 3 * 1001, `${lang}: bildefrekvens 24000/1001 og tre bilder`);
    if (ffmpeg) {
      const raw = execFileSync("ffmpeg", ["-v", "error", "-i", path, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-"]);
      h.check(raw[3] === 0 && raw[(24 * 64 + 32) * 4 + 3] === 255, `${lang}: ffmpeg dekoder alfa (hjørne 0, figur 255)`);
    }
    await page.getByTestId("alpha-cancel").click();
  });
  await h.scenario(`p7-film-${lang}`, occ.id, lang, async page => {
    await page.goto(`${h.base}${h.P}/montering?scene=${occ.id}&lastned=1`, { waitUntil: "networkidle" });
    const fmt = page.getByTestId("export-format"); await fmt.waitFor();
    h.check(await fmt.inputValue() === "mov", `${lang}: «Endelig» foreslår MOV (ProRes 422 HQ)`);
    h.check(await page.getByTestId("quality-profile-picker").first().isVisible(), `${lang}: profilen vises i filmeksporten`);
    h.check(await page.getByTestId("export-prores-note").isVisible(), `${lang}: ProRes-merknad med PCM 48 kHz`);
    await page.getByRole("dialog").screenshot({ path: `${h.out}/film-${lang}.png` });
    const dl = page.waitForEvent("download", { timeout: 60000 }); await page.getByTestId("export-start").click();
    const d = await dl; const path = `${h.out}/film-${lang}.mov`; await d.saveAs(path);
    const b = readFileSync(path), info = inspect(b);
    const v = info.tracks.find(t => t.fourcc === "apch");
    h.check(!!v, `${lang}: ProRes 422 HQ (apch)`);
    h.check(v && v.w === 64 && v.h === 48 && v.scale === 24000, `${lang}: mål og 24000/1001`);
    const a = info.tracks.find(t => t.fourcc === "sowt");
    h.check(!a || a.rate === 48000, `${lang}: lyd er PCM 48 kHz når scenen har lyd`);
    if (ffmpeg) {
      const probe = execFileSync("ffprobe", ["-v", "error", "-show_streams", path]).toString();
      h.check(/profile=HQ/.test(probe) && /color_primaries=bt709/.test(probe) && /r_frame_rate=24000\/1001/.test(probe), `${lang}: ffprobe: HQ, Rec.709, 24000/1001`);
    }
    const types = h.state.commands.map(c => c?.type ?? JSON.stringify(c).slice(0, 80));
    h.check(types.every(t => t === "SetExportSettings"), `${lang}: eksporten endrer ikke prosjektet, bare de lagrede eksportvalgene (${types.join(",")})`);
  });
}
await h.scenario("p7-unsupported", occ.id, "nb", async page => {
  await page.evaluate(() => { delete window.Worker; });
  await page.getByTestId("alpha-export-open").click();
  h.check(await page.getByTestId("alpha-format").locator('option[value="mov-prores4444"]').evaluate(e => e.disabled), "uten støtte sperres ProRes-valget");
  h.check(await page.getByTestId("alpha-prores-unavailable").isVisible(), "tydelig melding når ProRes ikke støttes");
  h.check(await page.getByTestId("alpha-format").inputValue() !== "mov-prores4444", "ingen stille overgang til ProRes uten støtte");
  await page.getByTestId("alpha-export-dialog").screenshot({ path: `${h.out}/unsupported.png` });
});
await h.scenario("p7-cancel", occ.id, "nb", async page => {
  c.duration_frames = 400; await page.reload({ waitUntil: "networkidle" });
  await page.getByTestId("alpha-export-open").click();
  let downloads = 0; page.on("download", () => downloads++);
  await page.getByTestId("alpha-start").click(); await page.getByTestId("alpha-progress").waitFor();
  await page.getByTestId("alpha-cancel").click(); await page.getByTestId("alpha-error").waitFor();
  h.check(downloads === 0, "avbrutt ProRes-eksport laster ikke ned en halv fil");
  const files = await page.evaluate(async () => { const r = await navigator.storage.getDirectory(); const k = []; for await (const x of r.keys()) k.push(x); return k; });
  h.check(!files.some(k => k.startsWith("alpha-")), "midlertidig OPFS-fil ryddes ved avbryt");
  c.duration_frames = 3;
});
console.log(ffmpeg ? " ok ffmpeg tilgjengelig – dekoding kontrollert" : " ok ffmpeg mangler – bare strukturkontroll");
await h.finish();
