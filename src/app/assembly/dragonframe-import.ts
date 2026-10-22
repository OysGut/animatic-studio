import { dragonframeTimeline, type DragonframeEntry, type DragonframeTimeline } from "@/core/interchange/dragonframe-import";
import { fpsToNumber, framesToSeconds, type Rational } from "@/core/time";
import { readZipIndex, zipEntryBlob } from "@/engine/import/zip-read";
import { t } from "@/core/i18n/keyed";

export interface DragonframeSource { path: string; blob: Blob }
export interface DragonframeInput { sources: readonly DragonframeSource[]; timeline: DragonframeTimeline; fps: Rational | null; hasEdl: boolean }
/** The browser's XML parser handles namespaces, escaping and malformed documents; core owns the EDL policy. */
export function readDragonframeXml(xml: string): { entries: DragonframeEntry[] | null; fps: Rational | null } {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length || doc.doctype) throw new Error(t("ptg5.invalid"));
  const nodes = Array.from(doc.getElementsByTagName("*"));
  const edl = nodes.find(n => n.localName === "edl");
  const entries = edl ? Array.from(edl.getElementsByTagName("*")).filter(n => n.localName === "vframe").map(n => {
    const vframe = Number(n.getAttribute("vframe")), file = Number(n.getAttribute("file"));
    if (!n.hasAttribute("vframe") || !n.hasAttribute("file") || !Number.isSafeInteger(vframe) || !Number.isSafeInteger(file)) throw new Error(t("ptg5.invalid"));
    return { vframe, file };
  }) : null;
  // Dragonframe schemas vary. Unknown/missing rate is shown explicitly and must be selected by the user.
  const rate = nodes.find(n => ["fps", "frameRate", "framerate"].includes(n.localName));
  const value = rate?.getAttribute("value") ?? rate?.textContent?.trim() ?? "";
  const [num, den = "1"] = value.split("/");
  const n = Number(num), d = Number(den);
  const fps = n > 0 && d > 0 && n / d <= 1000 ? { num: Math.round(n * 1000), den: Math.round(d * 1000) } : null;
  return { entries, fps };
}

export async function dragonframeSources(files: readonly File[]): Promise<DragonframeSource[]> {
  if (files.length === 1 && /\.zip$/i.test(files[0]?.name ?? "")) {
    const zip = files[0]; if (!zip) return [];
    const index = await readZipIndex(zip); const out: DragonframeSource[] = [];
    for (const e of index.values()) {
      if (/(^|\/)\.\.(\/|$)|^\//.test(e.name)) throw new Error(t("ptg5.invalid"));
      if (!/(?:take\.xml|_X1_\d+\.(?:jpe?g|png|tiff?|webp))$/i.test(e.name)) continue;
      out.push({ path: e.name, blob: await zipEntryBlob(zip, e) });
    }
    return out;
  }
  return files.map(f => ({ path: f.webkitRelativePath || f.name, blob: f }));
}
export async function inspectDragonframe(sources: readonly DragonframeSource[]): Promise<DragonframeInput> {
  const xmls = sources.filter(s => /(^|\/)take\.xml$/i.test(s.path));
  if (xmls.length > 1) throw new Error(t("ptg5.single-take"));
  const xml = xmls[0];
  const parsed = xml ? readDragonframeXml(await xml.blob.text()) : { entries: null, fps: null };
  return { sources, timeline: dragonframeTimeline(sources.map(s => s.path), parsed.entries), fps: parsed.fps, hasEdl: parsed.entries !== null };
}
/** One bounded decoded image at a time; intentional repeats are kept at the source timeline rate. */
export async function encodeDragonframe(input: DragonframeInput, fps: Rational, name: string, progress: (n: number) => void): Promise<File> {
  const mb = await import("mediabunny");
  const first = input.sources.find(s => s.path === input.timeline.files[0]);
  if (!first || input.timeline.files.length === 0) throw new Error(t("ptg5.empty"));
  const bitmap = await createImageBitmap(first.blob);
  const canvas = document.createElement("canvas"); canvas.width = Math.ceil(bitmap.width / 2) * 2; canvas.height = Math.ceil(bitmap.height / 2) * 2; bitmap.close();
  const ctx = canvas.getContext("2d", { alpha: false }); if (!ctx) throw new Error(t("ptg5.invalid"));
  const encodable = await mb.getFirstEncodableVideoCodec(["avc", "vp9", "av1"], { width: canvas.width, height: canvas.height, quality: mb.QUALITY_HIGH });
  if (!encodable) throw new Error(t("ptg5.encoder"));
  const target = new mb.BufferTarget(); const output = new mb.Output({ format: new mb.Mp4OutputFormat(), target });
  const source = new mb.CanvasSource(canvas, { codec: encodable, quality: mb.QUALITY_HIGH });
  output.addVideoTrack(source, { frameRate: fpsToNumber(fps) });
  const lookup = new Map(input.sources.map(s => [s.path, s.blob]));
  try {
    await output.start();
    for (let i = 0; i < input.timeline.files.length; i++) {
      const path = input.timeline.files[i]; const blob = path ? lookup.get(path) : null;
      if (!blob) throw new Error(t("ptg5.invalid"));
      const image = await createImageBitmap(blob);
      try { ctx.drawImage(image, 0, 0, canvas.width, canvas.height); } finally { image.close(); }
      await source.add(framesToSeconds(i, fps), framesToSeconds(1, fps));
      progress(Math.round((i + 1) * 100 / input.timeline.files.length));
    }
    await output.finalize();
  } catch (e) { await output.cancel().catch(() => undefined); throw e; }
  if (!target.buffer) throw new Error(t("ptg5.invalid"));
  return new File([target.buffer], `${name}.mp4`, { type: "video/mp4" });
}