/** P4: real compositor, real PNG ZIP download, NO/EN and cancellation. All server calls mocked. */
import { harness } from "./mts-harness.mjs";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { unzipSync } from "fflate";
const h = harness("/tmp/browser/p4-alpha-export");
const c = h.rows.compositions.find(c => !c.removed);
const occ = h.rows.scene_occurrences.find(o => o.variant_id === c?.variant_id && o.active);
if (!c || !occ) throw new Error("Missing fixture");
c.width = 64; c.height = 64; c.duration_frames = 4; c.camera = { shots: [] };
h.fx.project.frame_width = 64; h.fx.project.frame_height = 64;
const existing = h.rows.composition_layers.find(l => l.composition_id === c.id && !l.removed && l.kind !== "group");
if (!existing) throw new Error("Missing layer");
const solid = { ...existing, id: "00000000-0000-7000-8000-00000000a401", name: "Solid", kind: "object", asset_id: null, asset_variant_id: null, version_id: null, fill: "#c86432", width: 16, height: 16,
  transform: { x: 32, y: 32, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 }, keyframes: [], group_id: null, visible: true, removed: false, path: null, mask: null, swaps: [], active_range: null, effects: null, text: null, shape: null, order_key: "a" };
const edge = { ...solid, id: "00000000-0000-7000-8000-00000000a402", name: "Edge", order_key: "b", transform: { ...solid.transform, x: 12, opacity: .5 } };
h.rows.composition_layers = h.rows.composition_layers.filter(l => l.composition_id !== c.id).concat([solid, edge]);

function decode(bytes) {
  const chunks = []; let at = 8, width, height;
  while (at < bytes.length) {
    const length = bytes.readUInt32BE(at), kind = bytes.toString("ascii", at + 4, at + 8);
    const data = bytes.subarray(at + 8, at + 8 + length);
    if (kind === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); }
    if (kind === "IDAT") chunks.push(data);
    at += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * 4, pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 2) throw new Error("Unexpected filter");
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0, up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      pixels[y * stride + x] = raw[y * (stride + 1) + 1 + x] + (filter === 1 ? left : filter === 2 ? up : 0);
    }
  }
  return { width, height, at: (x,y) => [...pixels.subarray((y*width+x)*4, (y*width+x)*4+4)] };
}
for (const lang of ["nb", "en"]) await h.scenario(`p4-${lang}`, occ.id, lang, async page => {
  await page.getByTestId("alpha-export-open").click();
  const dialog = page.getByTestId("alpha-export-dialog"); await dialog.waitFor();
  h.check(await page.getByTestId("alpha-mode").inputValue() === "straight", `${lang}: PNG standard rett alfa`);
  await page.getByTestId("alpha-range").selectOption("in-out");
  await page.getByTestId("alpha-in").fill("1"); await page.getByTestId("alpha-out").fill("3");
  h.check(await page.getByTestId(`alpha-layer-${solid.id}`).isChecked() && await page.getByTestId(`alpha-layer-${edge.id}`).isChecked(), `${lang}: flere lag valgt`);
  await dialog.screenshot({ path: `${h.out}/dialog-${lang}.png` });
  const dl = page.waitForEvent("download"); await page.getByTestId("alpha-start").click();
  const download = await dl; const path = `${h.out}/${lang}.zip`; await download.saveAs(path);
  const files = unzipSync(readFileSync(path)), names = Object.keys(files);
  h.check(names.length === 2, `${lang}: inn/ut eksporterer akkurat to bilder`);
  h.check(names.every(n => n.includes("Solid + Edge") && n.includes("f1-3") && n.endsWith(".png")), `${lang}: filnavn med scene, lag og tidsrom`);
  const png = decode(Buffer.from(files[names[0]]));
  h.check(png.width === 64 && png.height === 64, `${lang}: riktige mål`);
  h.check(png.at(0,0)[3] === 0 && png.at(63,63)[3] === 0, `${lang}: nedlastet PNG har gjennomsiktige hjørner`);
  h.check(png.at(32,32)[3] === 255, `${lang}: figur er helt dekkende`);
  const edgePixel = png.at(12,32);
  // Canvas unpremultiplication can round RGB by one byte; alpha must be exact.
  h.check(edgePixel[3] === 128 && [200,100,50].every((v,i) => Math.abs(edgePixel[i]-v) <= 1), `${lang}: rett kantfarge og delvis alfa`);
  h.check(await page.getByTestId("alpha-download").isVisible(), `${lang}: ferdig fil og nedlastingslenke`);
  h.check(h.state.commands.length === 0, `${lang}: scenedata endres ikke`);
  await page.getByTestId("alpha-cancel").click(); await h.waitHidden(dialog);
  await page.getByTestId("alpha-export-open").click();
  h.check(await page.getByTestId("alpha-range").inputValue() === "in-out" && await page.getByTestId("alpha-in").inputValue() === "1", `${lang}: prosjektets valg huskes`);
  await page.getByTestId("alpha-mode").selectOption("premultiplied");
  const second = page.waitForEvent("download"); await page.getByTestId("alpha-start").click();
  const d2 = await second; const p2 = `${h.out}/${lang}-premult.zip`; await d2.saveAs(p2);
  const sequence = unzipSync(readFileSync(p2)); const premult = decode(Buffer.from(Object.values(sequence)[0]));
  h.check(JSON.stringify(premult.at(12,32)) === JSON.stringify([100,50,25,128]), `${lang}: premultiplisert kant i nedlastet PNG`);
  const supported = await page.evaluate(async () => {
    if (!globalThis.VideoEncoder) return false;
    const r = await VideoEncoder.isConfigSupported({ codec: "vp09.00.10.08", width:64, height:64, bitrate:8000000, alpha:"keep" });
    return r.supported === true && r.config.alpha === "keep";
  });
  h.check(await page.getByTestId("alpha-format").locator('option[value="webm-vp9"]').evaluate(e => e.disabled) === !supported, `${lang}: WebM sperres når alfa ikke støttes`);
});

await h.scenario("p4-mask", occ.id, "nb", async page => {
  solid.mask = { kind:"layer", layerId:edge.id, invert:false };
  edge.width = 8; edge.transform = { ...edge.transform, x:24, opacity:1 };
  await page.reload({waitUntil:"networkidle"});
  await page.getByTestId("alpha-export-open").click();
  await page.getByTestId(`alpha-layer-${edge.id}`).uncheck();
  await page.getByTestId("alpha-range").selectOption("in-out");
  await page.getByTestId("alpha-in").fill("0"); await page.getByTestId("alpha-out").fill("1");
  const pending = page.waitForEvent("download"); await page.getByTestId("alpha-start").click();
  const dl = await pending; const path=`${h.out}/mask.zip`; await dl.saveAs(path);
  const files=unzipSync(readFileSync(path)), png=decode(Buffer.from(Object.values(files)[0]));
  h.check(png.at(26,32)[3]===255 && png.at(32,32)[3]===0 && png.at(20,32)[3]===0, "uvalgt maskelag brukes som maske, ikke synlig innhold");
  solid.mask=null; edge.width=16; edge.transform={...edge.transform,x:12,opacity:.5};
});
await h.scenario("p4-cancel", occ.id, "nb", async page => {
  c.duration_frames = 250; // Reload the mocked row before opening a long export.
  await page.reload({ waitUntil: "networkidle" });
  await page.getByTestId("alpha-export-open").click(); await page.getByTestId("alpha-range").selectOption("scene");
  let downloads = 0; page.on("download", () => downloads++);
  await page.getByTestId("alpha-start").click(); await page.getByTestId("alpha-progress").waitFor();
  await page.getByTestId("alpha-cancel").click();
  await page.getByTestId("alpha-error").waitFor();
  h.check(downloads === 0, "avbrutt eksport laster aldri ned en halv fil");
  const files = await page.evaluate(async () => { const root = await navigator.storage.getDirectory(); const keys=[]; for await (const key of root.keys()) keys.push(key); return keys; });
  h.check(!files.some(k => k.startsWith("alpha-")), "midlertidige eksportfiler ryddes ved avbryt");
  await page.getByTestId("alpha-export-dialog").screenshot({ path: `${h.out}/cancel.png` });
});
await h.finish();