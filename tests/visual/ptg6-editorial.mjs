/** PTG6: real ZIP/video/audio, fixed fixtures and mocked services. No AI or paid calls. */
import { harness } from "./mts-harness.mjs";
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
const h = harness("/tmp/browser/ptg6-editorial");
const lang = process.env.UI_LANG ?? "nb";
const occ = h.rows.scene_occurrences.find(o => o.active);
if (!occ) throw new Error("fixture");
h.fx.project.code = "PTG6-TEST"; h.fx.project.capture_mode = "twos";
h.fx.project.capture_fps_num = 12; h.fx.project.capture_fps_den = 1;
// Fixed active PTG5-style film in one shot; all other shots still use animatic.
const takeId = "00000000-0000-7000-8000-000000009206";
const filmPath = `${h.fx.project.id}/films/${takeId}/ptg6-red.mp4`;
let syntheticFilm = Buffer.alloc(0);
occ.active_take_id = takeId;
h.rows.clip_parts = h.rows.clip_parts.filter(p => p.occurrence_id !== occ.id);
h.rows.takes.push({ id: takeId, project_id: h.fx.project.id, revision: 1, occurrence_id: occ.id, segment_id: null,
  kind: "imported_film", status: "approved", duration_frames: 25, removed: false, media_ref: filmPath,
  media: { fileName: "ptg6-red.mp4", mimeType: "video/mp4", byteSize: 1000, width: 96, height: 54, fps: 25, durationMs: 1000, videoCodec: "avc", hasAudio: false }, produced_from: { blockRevisions: {} } });
h.hooks.storage = path => path.includes("ptg6-red.mp4") ? { contentType: "video/mp4", body: syntheticFilm } : null;
let settings, version = 0;
h.hooks.rest = (table, req) => {
  if (table === "rpc/reserve_interchange_export") {
    const body = JSON.parse(req.postData()); settings = body.p_settings; version++;
    return { batchId: "00000000-0000-7000-8000-000000008206", versions: Object.fromEntries(body.p_occurrence_ids.map(id => [id, version])) };
  }
  if (table === "rpc/complete_interchange_export") return "00000000-0000-7000-8000-000000008207";
};
await h.scenario(`ptg6-${lang}`, occ.id, lang, async page => {
  syntheticFilm = Buffer.from(await page.evaluate(async () => {
    const mb = await import("/node_modules/.vite/deps/mediabunny.js");
    const canvas = new OffscreenCanvas(96, 54); const ctx = canvas.getContext("2d"); ctx.fillStyle = "red"; ctx.fillRect(0, 0, 96, 54);
    const target = new mb.BufferTarget(); const output = new mb.Output({ format: new mb.Mp4OutputFormat(), target });
    const codec = await mb.getFirstEncodableVideoCodec(["avc", "vp9", "av1"], { width: 96, height: 54, bitrate: 100000 });
    const source = new mb.CanvasSource(canvas, { codec, bitrate: 100000 }); output.addVideoTrack(source, { frameRate: 25 });
    await output.start(); for (let i = 0; i < 25; i++) await source.add(i / 25, 1 / 25); await output.finalize();
    return Array.from(new Uint8Array(target.buffer));
  }));
  await page.setViewportSize({ width: 1280, height: 1800 });
  await page.goto(h.base + h.P + "/montering", { waitUntil: "networkidle" });
  await page.evaluate(() => { delete window.showSaveFilePicker; });
  await page.getByRole("button", { name: lang === "en" ? "Export animatic" : "Eksporter animatic", exact: true }).click();
  const section = page.getByTestId("ptg-export-section"); await section.waitFor();
  const button = page.getByTestId("ptg-export-editorial");
  h.check((await button.innerText()).includes(lang === "en" ? "Editorial files" : "Klippefiler"), `${lang}: klippeknappen har riktig språk`);
  h.check(await page.getByTestId("ptg-editorial-media").isChecked(), `${lang}: medier følger med som standard`);
  for (const includeMedia of [false, true]) {
    await page.getByTestId("ptg-editorial-media").setChecked(includeMedia);
    const download = page.waitForEvent("download", { timeout: 600000 }); await button.click();
    const path = `${h.out}/${lang}-${includeMedia ? "media" : "linked"}.zip`; await (await download).saveAs(path);
    await page.waitForFunction(() => !document.querySelector('[data-testid="ptg-export-editorial"]').disabled, null, { timeout: 60000 });
    const zip = unzipSync(readFileSync(path)); const names = Object.keys(zip);
    h.check(settings?.format === "editorial" && settings?.includeMedia === includeMedia, `${lang}: valg og format i eksportloggen (${includeMedia})`);
    h.check(["otio", "xml", "edl"].every(ext => zip[`PTG6-TEST.${ext}`]), `${lang}: OTIO, XML og EDL ligger i ZIP`);
    const readme = new TextDecoder().decode(zip["LESMEG.txt"]);
    h.check(readme.includes("Ingen KI brukes") && readme.includes("No AI is used") && readme.includes("Reel → skuddnavn") && readme.includes("Reel → shot name"), `${lang}: tospråklig LESMEG og reeltabell`);
    const otio = JSON.parse(new TextDecoder().decode(zip["PTG6-TEST.otio"]));
    const [video, audio] = otio.tracks.children;
    const clips = video.children.filter(c => c.OTIO_SCHEMA === "Clip.2");
    h.check(video.kind === "Video" && audio.kind === "Audio" && clips.length > 1, `${lang}: ett videospor og lydspor`);
    const refs = clips.map(c => c.media_references.DEFAULT_MEDIA.target_url);
    h.check(refs.every(p => !p.startsWith("/") && !p.startsWith("http")), `${lang}: relative mediestier`);
    const fields = await page.evaluate(text => {
      const doc = new DOMParser().parseFromString(text, "application/xml");
      return { valid: !doc.querySelector("parsererror") && doc.documentElement.tagName === "xmeml" && doc.documentElement.getAttribute("version") === "5",
        length: Number(doc.querySelector("sequence > duration").textContent), clips: doc.querySelectorAll("video > track > clipitem").length };
    }, new TextDecoder().decode(zip["PTG6-TEST.xml"]));
    h.check(fields.valid && fields.clips === clips.length && fields.length === clips.reduce((n,c) => n+c.source_range.duration.value,0), `${lang}: gyldig xmeml og sum av klipp lik film`);
    const edl = new TextDecoder().decode(zip["PTG6-TEST.edl"]);
    const reels = clips.map(c => c.metadata.ptg.reel);
    h.check(new Set(reels).size === reels.length && reels.every(r => r.length <= 8 && readme.includes(r)) && edl.includes("FCM: NON-DROP FRAME"), `${lang}: unike reelnavn, reeltabell og NDF`);
    if (!includeMedia) h.check(names.length === 4 && refs.every(p => !zip[p]), `${lang}: bare pekerfiler, ingen medier`);
    else {
      h.check(refs.every(p => zip[p]) && audio.children.every(c => zip[c.media_references.DEFAULT_MEDIA.target_url]), `${lang}: alle video- og lydreferanser finnes i pakken`);
      const c = clips[0], bytes = zip[refs[0]];
      const info = await page.evaluate(async bytes => {
        const mb = await import("/node_modules/.vite/deps/mediabunny.js");
        const input = new mb.Input({ source: new mb.BufferSource(new Uint8Array(bytes).buffer), formats: mb.ALL_FORMATS });
        const track = await input.getPrimaryVideoTrack(); let count = 0; const colors = [];
        for await (const frame of new mb.CanvasSink(track).canvases()) { count++; colors.push(Array.from(frame.canvas.getContext("2d").getImageData(frame.canvas.width / 2, frame.canvas.height / 2,1,1).data).slice(0,3)); }
        return { count, colors, fps: (await track.computePacketStats()).averagePacketRate };
      }, Array.from(bytes));
      h.check(info.count === c.media_references.DEFAULT_MEDIA.available_range.duration.value && Math.abs(info.fps - 24) < .1, `${lang}: videoen har håndtak og alle bilder på 24 fps`);
      h.check(info.colors.every(rgb => rgb[0] > 200 && rgb[1] < 30 && rgb[2] < 30), `${lang}: aktiv take brukes bilde for bilde, ikke animatic`);
      const wav = zip[audio.children[0].media_references.DEFAULT_MEDIA.target_url]; const v = new DataView(wav.buffer,wav.byteOffset,wav.byteLength);
      h.check(v.getUint32(24,true) === 48000 && v.getUint16(34,true) === 24 && v.getUint32(40,true)/6 === info.count*2000, `${lang}: lyd er WAV 48 kHz 24 bit med samme lengde`);
    }
  }
  h.check(!h.state.commands.some(c => ["SetActiveTake","SetSceneEdit"].includes(c.type)) && !h.state.rpcs.some(r => /generate|Ai/.test(r.name)), `${lang}: ingen aktivering eller AI`);
  await section.screenshot({ path: `${h.out}/${lang}-section.png` });
});
await h.finish();